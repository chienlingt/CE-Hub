// server/seedSchedulerDemo.js
//
// B.1 Delivery Scheduler demo dataset: one realistic working week of lorries,
// slots and delivery orders for the throwaway Docker Postgres container
// (docker-compose.demo.yml), so the new scheduler workspace can be driven
// against a live database instead of mocks (/schedule?data=live).
//
// Why the data is shaped the way it is:
//   * The fleet is the real one Mr Lee confirmed on 13-10-2026
//     (docs/Meeting_Outcomes.md §4): 8 x 3-ton + 13 x 1-ton = 21 lorries.
//   * Daily volume is the real one (§1): 70-80 DOs on four days, and one peak
//     day at 92 on a thinner roster — §1's "may reach 90, but rarely exceeds
//     100". Four calm days plus one tight one is what makes the week legible:
//     the UI's capacity bands (calm / amber 85-100% / red over 100%) and its
//     over-the-DO-cap state only appear if some slot actually reaches them, and
//     a flat week would render exactly one of the three. See PEAK_WEEKDAY.
//   * Slot windows are exactly the ones server/services/scheduler.js
//     generateTimeSlots() emits (08:00-12:00 / 13:00-19:00 / 19:00-21:00), so a
//     later scheduler run lands on this grid instead of creating a second,
//     parallel set of slots next to it.
//   * Crew skills always match their load, on every day including the peak one:
//     the engine's job is to produce a feasible plan, so a fabricated skill
//     clash in the grid would read as noise. Those violations live in the
//     unassigned pool, which is what the exception panel reads. Capacity
//     pressure is the exception, and only because it is real: the peak day's
//     load is genuine volume on genuinely fewer lorries, not padding.
//
// SAFETY: identical guard to seedDemo.js — this script only ever talks to the
// URL in server/.env.demo, and refuses to run unless that URL is unmistakably
// the local demo container (see assertDemoDatabase() below). It is never wired
// to prismaClient.js (the one the running app and every other seed* script
// uses), so it cannot touch SANDBOX or PRODUCTION even by mistake.
//
// Safe to re-run: wipes every table in this database (all of it is demo data —
// see truncateAll()) and reseeds from scratch each time.
//
// Usage:  cd server
//         set -a; source .env.demo; set +a
//         node seedSchedulerDemo.js
//    or:  npm run seed:scheduler   (does the same — see package.json)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.demo') });

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { PrismaClient } = require('@prisma/client');

// ── Guard rail: refuse to run against anything that isn't the demo container ──
function assertDemoDatabase() {
  const url = process.env.DATABASE_URL || '';
  const looksLikeDemo =
    url.includes('tbm_demo') && (url.includes('localhost') || url.includes('127.0.0.1'));
  if (!looksLikeDemo) {
    console.error(
      '[seedSchedulerDemo] Refusing to run — DATABASE_URL does not look like the local demo ' +
        'container (expected localhost + "tbm_demo").\n' +
        '  Got: ' + (url || '(not set)') + '\n' +
        '  Did you forget:  set -a; source .env.demo; set +a\n'
    );
    process.exit(1);
  }
}
assertDemoDatabase();

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const DEMO_PASSWORD = 'Demo@1234';

// ── Dates: always derived, never hardcoded ──────────────────────────────────
// A pinned date would make this seed useless the following week, so every date
// below is computed from today's Asia/Kuala_Lumpur date (the timezone the server
// cron jobs and intelligentRouteOptimizationService both assume).
const klToday = (process.env.DEMO_DATE || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(klToday) || !dayjs(klToday).isValid()) {
  throw new Error(`Invalid DEMO_DATE "${klToday}"; expected YYYY-MM-DD`);
}

// scheduler.js:331 skips dayOfWeek 6 (Saturday) and 0 (Sunday), so a seed run on
// a weekend has no working day to put the "live" traffic on. Anchor to the
// coming Monday in that case, rather than seeding a week that is already over.
const todayDow = dayjs(klToday).day();
const anchor = (todayDow === 0 || todayDow === 6)
  ? dayjs(klToday).add(todayDow === 6 ? 2 : 1, 'day')
  : dayjs(klToday);

// Monday of the anchor's week. (anchor.day() + 6) % 7 is the number of days
// back to Monday for a Mon=1..Sun=0 week.
const monday = anchor.subtract((anchor.day() + 6) % 7, 'day');

// Mon-Sat is the span the scheduler walks; Sat and Sun are then skipped, so in
// practice the week is Mon-Fri.
const weekDays = [];
for (let i = 0; i < 6; i += 1) {
  const day = monday.add(i, 'day');
  if (day.day() === 6 || day.day() === 0) continue;
  weekDays.push(day.format('YYYY-MM-DD'));
}

// The day that gets the live lifecycle (departed trips, part-delivered stops).
const liveDay = anchor.format('YYYY-MM-DD');
const liveDayIndex = weekDays.indexOf(liveDay);

function atTime(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00+08:00`);
}

function minusHours(date, hours) {
  return new Date(date.getTime() - hours * 3600 * 1000);
}

// ── Slot windows ────────────────────────────────────────────────────────────
// Verbatim from scheduler.js generateTimeSlots(). Must not drift: utils/schedule
// /slotWindows.js classifies AM/PM/NIGHT by these start times.
const NORMAL_WINDOWS = [
  { start: '08:00', end: '12:00' },
  { start: '13:00', end: '19:00' },
  { start: '19:00', end: '21:00' },
];

// Thursday is the far-area run (Genting and beyond) — scheduler.js:338 flags
// dayOfWeek 4 as 'far-area'. A lorry that spends the day outside the Klang
// Valley physically cannot be back for a 19:00-21:00 night drop, so Thursday
// gets two windows and visibly less capacity in the grid. The windows are still
// the normal 08:00/13:00 pair rather than the engine's farArea template, because
// that template is dead code today: the loop at scheduler.js:340 iterates
// `timeslotTemplates.normal` whatever slotType says.
function windowsFor(dateKey) {
  return dayjs(dateKey).day() === 4 ? NORMAL_WINDOWS.slice(0, 2) : NORMAL_WINDOWS;
}

// Wednesday is the peak day. §1 says the daily volume "may reach 90 DOs, but
// rarely exceeds 100", so 92 is Mr Lee's own stated peak, not invented pressure
// — and a peak day is exactly the day he needs this screen for. DO NOT flatten
// this back to a uniform week: a week where every slot sits at a quarter full
// renders only one of the UI's three capacity bands, so the amber (85-100%),
// red (>100%) and over-the-DO-cap states would never be seen at all. The four
// other days stay comfortably feasible on purpose — the contrast across the week
// is itself the thing being demonstrated.
const PEAK_WEEKDAY = 3;

// §1: average 70-80 DOs/day, with the Wednesday peak at 92. Thursday is the
// lightest because it is the far-area day with one window fewer.
const DAILY_ORDER_TOTALS = { 1: 78, 2: 74, [PEAK_WEEKDAY]: 92, 4: 70, 5: 76 };

// The 19:00-21:00 window exists for customers who can only take a delivery after
// work, so it is deliberately the lightest of the three.
const WINDOW_SHARE = { 3: [0.4, 0.4, 0.2], 2: [0.5, 0.5] };

// Lorries rostered per day, out of the fleet of 21 — the rest are on other
// duties (inter-branch transfers, §3) or in for service. The peak day runs a
// THINNER roster, which is the ordinary real cause of a tight day: peak volume
// arriving on a day when fewer lorries are available.
const ROSTER_SIZES = { 1: 8, 2: 8, [PEAK_WEEKDAY]: 4, 4: 8, 5: 8 };

// What a routine day's order actually looks like for an electrical-appliance
// retailer: small and medium boxes, dominated by airconds and laundry. The sofa
// and the wardrobe are deliberately absent — cycling all eight products evenly
// would put a 2.1 m3 sofa or a 3.2 m3 wardrobe on one order in four, which no
// real DO mix does and which would silently blow every 1-ton lorry's 7.6 m3 load
// box on an ordinary Tuesday.
const ROUTINE_MIX = [
  'aircond', 'washer', 'dryer', 'tv', 'aircond', 'washer',
  'fridge', 'dryer', 'tv', 'aircond', 'washer', 'dryer',
];

// The peak day, cell by cell: [{ dos, sofas }] per position, per window.
// `sofas` is how many of that slot's orders carry an L-shape sofa (2.14 m3 each)
// instead of a routine box, which is what drives the volume meter into its amber
// and red bands. Positions 0-1 are 3-ton lorries (15.96 m3), 2-3 are 1-ton
// (7.62 m3) — see peakRoster() — so the same sofa count means very different
// things across a row, which is the comparison the grid exists to make.
//
// The 26-DO cell is the one slot in the week over the 25-DO cap KF and Mr Lee
// agreed, so SLOT_DO_CAP_REACHED renders somewhere in the grid and not only in
// the exception panel. It is a concentration, not an addition: the day still
// totals exactly 92, so that overload is something the dispatcher fixes by
// dragging orders off the slot, which is the whole interaction.
const PEAK_DAY_PLAN = [
  [{ dos: 26, sofas: 0 }, { dos: 4, sofas: 1 }, { dos: 4, sofas: 4 }, { dos: 3, sofas: 2 }], // 08:00 = 37
  [{ dos: 10, sofas: 2 }, { dos: 9, sofas: 0 }, { dos: 9, sofas: 2 }, { dos: 9, sofas: 0 }], // 13:00 = 37
  [{ dos: 5, sofas: 0 }, { dos: 5, sofas: 0 }, { dos: 4, sofas: 2 }, { dos: 4, sofas: 3 }],  // 19:00 = 18
];

function splitEvenly(total, buckets) {
  const base = Math.floor(total / buckets);
  const extra = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < extra ? 1 : 0));
}

// ── Wipe every table — this database holds nothing but demo data ────────────
async function truncateAll() {
  const tables = [
    'access_logs', 'chats', 'notifications', 'integration_outbox',
    'delivery_failure_events',
    'rating', 'complaint', 'reports', 'installation_schedules',
    'order_products', 'orders', 'lorry_trips', 'time_slots',
    'employee_team_assignments', 'teams', 'truck_zones', 'trucks',
    'products', 'customers', 'buildings', 'zones', 'installers',
    'employee_locations', 'employees', 'outlets', 'roles',
    'system_settings', 'scheduler_config',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log('[seedSchedulerDemo] Truncated all tables');
}

// ── Static descriptors ──────────────────────────────────────────────────────

// Mr Lee's fleet, §4. Plates WXX 1234 / WYY 5678 are kept from seedDemo.js so
// the two lorries everyone already recognises from the other demos stay put.
const FLEET = [
  { plate: 'WXX 1234', tone: 3 },
  { plate: 'WKL 3201', tone: 3 },
  { plate: 'WKL 3302', tone: 3 },
  { plate: 'WKN 3807', tone: 3, off_day: 'Wednesday' },
  { plate: 'WYY 5678', tone: 1 },
  { plate: 'WPA 1101', tone: 1 },
  { plate: 'WPA 1202', tone: 1 },
  { plate: 'WPB 1404', tone: 1 },
  { plate: 'WPC 1707', tone: 1 },
  { plate: 'WPD 2010', tone: 1, off_day: 'Thursday' },
];
// Both off-days are mid-week on purpose: the grid skips Sat/Sun entirely, so an
// off_day of 'Sunday' would never render the "— off —" cell it exists to show.

const TONE_DIMENSIONS = {
  3: { length_cm: 420, width_cm: 190, height_cm: 200 },
  1: { length_cm: 280, width_cm: 160, height_cm: 170 },
};

const ZONE_NAMES = ['Petaling Jaya', 'Klang', 'Shah Alam', 'Cheras'];

// 14 buildings. `city`/`state` are carried here only to fill orders.delivery_city
// /_state — the buildings table has no city or state column.
const BUILDINGS = [
  {
    zone: 'Petaling Jaya', building_name: 'Menara Suria Condominium', housing_type: 'Condominium',
    postal_code: '46000', address: 'Jalan SS2/24, Menara Suria, 46000 Petaling Jaya',
    city: 'Petaling Jaya', state: 'Selangor',
    loading_bay_available: true, lift_available: true, lift_dimensions: '200cm x 150cm x 230cm',
    narrow_doorways: false, pre_registration_required: true,
    access_time_window_start: '09:00', access_time_window_end: '18:00',
    latitude: 3.11770000, longitude: 101.62340000,
  },
  {
    zone: 'Petaling Jaya', building_name: 'Sri Mutiara Apartment (Walk-up)', housing_type: 'Apartment',
    postal_code: '47301', address: 'Jalan Kelang Lama, Sri Mutiara Blok C, 47301 Petaling Jaya',
    city: 'Petaling Jaya', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: true,
    pre_registration_required: false, parking_distance: '80m',
    notes: '4th floor walk-up, narrow staircase', latitude: 3.06540000, longitude: 101.64230000,
  },
  {
    zone: 'Petaling Jaya', building_name: 'Damansara Uptown Corporate Tower', housing_type: 'Commercial',
    postal_code: '47400', address: 'Jalan SS21/39, Damansara Uptown, 47400 Petaling Jaya',
    city: 'Petaling Jaya', state: 'Selangor',
    loading_bay_available: true, lift_available: true, lift_dimensions: '250cm x 200cm x 250cm',
    narrow_doorways: false, pre_registration_required: true,
    // Office tower: goods lift is released to vendors between 10:00 and 16:00 only.
    access_time_window_start: '10:00', access_time_window_end: '16:00',
    vehicle_size_limit: '3 tonne', special_equipment_needed: 'Trolley + hand pallet jack',
    latitude: 3.14120000, longitude: 101.62140000,
  },
  {
    zone: 'Petaling Jaya', building_name: 'Taman SS2 Landed House', housing_type: 'Landed',
    postal_code: '47300', address: 'No. 48, Jalan SS2/55, Taman SS2, 47300 Petaling Jaya',
    city: 'Petaling Jaya', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: false,
    pre_registration_required: false, latitude: 3.11520000, longitude: 101.61850000,
  },
  {
    zone: 'Klang', building_name: 'Jalan Meru Shoplot', housing_type: 'Shoplot',
    postal_code: '41050', address: '23, Jalan Meru 2, Bandar Baru Klang, 41050 Klang',
    city: 'Klang', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: true,
    pre_registration_required: false, vehicle_width_limit: '2.1m',
    latitude: 3.05870000, longitude: 101.44980000,
  },
  {
    zone: 'Klang', building_name: 'Bandar Botanic Landed House', housing_type: 'Landed',
    postal_code: '41200', address: 'No. 7, Jalan Langat, Bandar Botanic, 41200 Klang',
    city: 'Klang', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: false,
    pre_registration_required: false, latitude: 3.02680000, longitude: 101.43280000,
  },
  {
    zone: 'Klang', building_name: 'Pangsapuri Sri Klang', housing_type: 'Apartment',
    postal_code: '41300', address: 'Blok B, Pangsapuri Sri Klang, Jalan Tengku Kelana, 41300 Klang',
    city: 'Klang', state: 'Selangor',
    loading_bay_available: false, lift_available: true, lift_dimensions: '150cm x 120cm x 210cm',
    narrow_doorways: true, pre_registration_required: false,
    access_time_window_start: '10:00', access_time_window_end: '16:00',
    latitude: 3.04430000, longitude: 101.45120000,
  },
  {
    zone: 'Klang', building_name: 'Klang Parade Retail Lot', housing_type: 'Commercial',
    postal_code: '41400', address: 'Lot G-12, Klang Parade, Jalan Meru, 41400 Klang',
    city: 'Klang', state: 'Selangor',
    loading_bay_available: true, lift_available: true, narrow_doorways: false,
    pre_registration_required: true,
    // Mall: goods receiving closes at 11:00, before trading hours. The tightest
    // window in the dataset, and the one the exception panel leans on.
    access_time_window_start: '08:00', access_time_window_end: '11:00',
    vehicle_size_limit: '3 tonne', notes: 'Loading bay pass must be collected from mall management',
    latitude: 3.07380000, longitude: 101.45610000,
  },
  {
    zone: 'Shah Alam', building_name: 'Bukit Rimau Gated Community', housing_type: 'Landed (Gated)',
    postal_code: '40460', address: 'Persiaran Rimau, Bukit Rimau, 40460 Shah Alam',
    city: 'Shah Alam', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: false,
    pre_registration_required: true,
    access_time_window_start: '10:00', access_time_window_end: '19:00',
    notes: 'Guardhouse requires visitor pass 1 day in advance',
    latitude: 3.03890000, longitude: 101.53090000,
  },
  {
    zone: 'Shah Alam', building_name: 'Seksyen 13 Industrial Lot', housing_type: 'Industrial',
    postal_code: '40100', address: 'Lot 9, Jalan Pelabur 23/1, Seksyen 13, 40100 Shah Alam',
    city: 'Shah Alam', state: 'Selangor',
    loading_bay_available: true, lift_available: false, narrow_doorways: false,
    pre_registration_required: false,
    access_time_window_start: '09:00', access_time_window_end: '17:00',
    latitude: 3.07020000, longitude: 101.52410000,
  },
  {
    zone: 'Shah Alam', building_name: 'Residensi Alam Impian', housing_type: 'Condominium',
    postal_code: '40400', address: 'Blok C, Residensi Alam Impian, Persiaran Alam Impian, 40400 Shah Alam',
    city: 'Shah Alam', state: 'Selangor',
    loading_bay_available: false, lift_available: true, lift_dimensions: '180cm x 140cm x 220cm',
    narrow_doorways: false, pre_registration_required: true,
    // Management releases the service lift only over the midday lull.
    access_time_window_start: '11:00', access_time_window_end: '15:00',
    latitude: 3.01210000, longitude: 101.51020000,
  },
  {
    zone: 'Shah Alam', building_name: 'Setia Alam Landed House', housing_type: 'Landed',
    postal_code: '40170', address: 'No. 22, Jalan Setia Impian U13/18, Setia Alam, 40170 Shah Alam',
    city: 'Shah Alam', state: 'Selangor',
    loading_bay_available: false, lift_available: false, narrow_doorways: false,
    pre_registration_required: false, latitude: 3.10350000, longitude: 101.45720000,
  },
  {
    zone: 'Cheras', building_name: 'Aliran Damai Apartment', housing_type: 'Apartment',
    postal_code: '56000', address: 'B-10-05, Aliran Damai Apartment, Jalan Damai Perdana 5/2, 56000 Cheras',
    city: 'Cheras', state: 'Wilayah Persekutuan',
    loading_bay_available: false, lift_available: false, narrow_doorways: true,
    pre_registration_required: false, parking_distance: '120m',
    latitude: 3.05920000, longitude: 101.74400000,
  },
  {
    zone: 'Cheras', building_name: 'Mandarina Court', housing_type: 'Condominium',
    postal_code: '56000', address: 'A-08-01, Mandarina Court, No. 27, Jalan 10/142, Bukit Mandarina, 56000 Cheras',
    city: 'Cheras', state: 'Wilayah Persekutuan',
    loading_bay_available: true, lift_available: true, lift_dimensions: '200cm x 160cm x 230cm',
    narrow_doorways: false, pre_registration_required: true,
    // Afternoon-only window: nothing in the 08:00 run can legally reach this block.
    access_time_window_start: '14:00', access_time_window_end: '18:00',
    latitude: 3.06180000, longitude: 101.74610000,
  },
];

// 8 appliances. There is no weight column anywhere in schema.prisma, so payload
// cannot be modelled — the UI surfaces that as its WEIGHT_DATA_MISSING advisory.
// Capacity here is purely package volume against the lorry's load box.
const PRODUCTS = [
  {
    key: 'washer', product_name: 'LG 9kg Front Load Washer',
    package_length_cm: 60, package_width_cm: 60, package_height_cm: 85,
    fragile_flag: false, installer_team_required_flag: false,
    estimated_installation_time_min: 20, estimated_installation_time_max: 40,
    dismantle_required_flag: true, dismantle_time: 10,
  },
  {
    key: 'tv', product_name: 'Samsung 65" QLED Smart TV',
    package_length_cm: 160, package_width_cm: 25, package_height_cm: 100,
    fragile_flag: true, installer_team_required_flag: true,
    estimated_installation_time_min: 30, estimated_installation_time_max: 60,
    dismantle_required_flag: false, dismantle_time: 15,
  },
  {
    key: 'fridge', product_name: 'Samsung 380L Top Freezer Fridge',
    package_length_cm: 70, package_width_cm: 70, package_height_cm: 170,
    fragile_flag: false, installer_team_required_flag: false,
    estimated_installation_time_min: 10, estimated_installation_time_max: 20,
    dismantle_required_flag: false, dismantle_time: 10,
  },
  {
    key: 'aircond', product_name: 'Daikin 1.5HP Inverter Aircond',
    package_length_cm: 90, package_width_cm: 30, package_height_cm: 30,
    fragile_flag: true, installer_team_required_flag: true,
    estimated_installation_time_min: 120, estimated_installation_time_max: 180,
    dismantle_required_flag: true, dismantle_time: 30,
  },
  {
    // The bulky one: 280 x 90 x 85 = 2.14 m3 each, against a 1-ton load box of
    // 280 x 160 x 170 = 7.6 m3. Four of these already overflow it, which is why
    // the exception pool orders 3-6 at a time.
    key: 'sofa', product_name: 'NOVA 3-Seater L-Shape Sofa',
    package_length_cm: 280, package_width_cm: 90, package_height_cm: 85,
    fragile_flag: false, installer_team_required_flag: false,
    estimated_installation_time_min: 15, estimated_installation_time_max: 25,
    dismantle_required_flag: true, dismantle_time: 20,
  },
  {
    key: 'mattress', product_name: 'Restonic Comfort Queen Mattress',
    package_length_cm: 203, package_width_cm: 152, package_height_cm: 30,
    fragile_flag: false, installer_team_required_flag: false, no_lie_down_flag: true,
    estimated_installation_time_min: 10, estimated_installation_time_max: 15,
    dismantle_required_flag: false, dismantle_time: 0,
  },
  {
    key: 'wardrobe', product_name: '4-Door Sliding Wardrobe',
    package_length_cm: 240, package_width_cm: 60, package_height_cm: 220,
    fragile_flag: false, installer_team_required_flag: true,
    estimated_installation_time_min: 90, estimated_installation_time_max: 150,
    dismantle_required_flag: true, dismantle_time: 45,
  },
  {
    key: 'dryer', product_name: 'Panasonic 7kg Heat Pump Dryer',
    package_length_cm: 60, package_width_cm: 60, package_height_cm: 85,
    fragile_flag: false, installer_team_required_flag: false,
    estimated_installation_time_min: 20, estimated_installation_time_max: 30,
    dismantle_required_flag: false, dismantle_time: 10,
  },
];

const DRIVER_NAMES = [
  'Razif bin Ahmad', 'Suresh a/l Kumar', 'Lim Chee Keong', 'Mohd Faizal bin Rosli',
  'Ganesan a/l Murugan', 'Tan Wei Jian', 'Azhar bin Ibrahim',
  'Kamarul bin Hashim', 'Prakash a/l Nair', 'Wong Ah Seng',
];
const ASSISTANT_NAMES = [
  'Hafiz bin Osman', 'Nurul Ain binti Kamal', 'Chan Keng Wai', 'Syafiq bin Azman',
  'Ravi a/l Selvam', 'Low Chin Hong', 'Zulkarnain bin Latif',
  'Aiman bin Daud', 'Siva a/l Ramu', 'Tay Boon Keat',
];
const INSTALLER_NAMES = [
  'Kumaran a/l Raj', 'Mohd Nazri bin Yusof', 'Goh Teck Seng',
  'Arif bin Salleh', 'Lau Kok Meng',
];

const CUSTOMER_NAMES = [
  'Tan Mei Ling', 'Wong Kar Fai', 'Norain binti Ismail', 'Muthu a/l Samy',
  'Siti Fatimah binti Zakaria', 'Lee Chong Wei', 'Priya a/p Segaran', 'Ahmad Zaki bin Hamid',
  'Chong Ai Ling', 'Devi a/p Ramasamy', 'Yap Soon Huat', 'Nurhaliza binti Saad',
  'Koh Beng Hock', 'Shalini a/p Nadarajah', 'Rizal bin Mokhtar', 'Ooi Hui Min',
  'Vignesh a/l Balan', 'Faridah binti Jalil', 'Teoh Kar Wai', 'Hanis binti Rahman',
  'Loke Chee Wai', 'Anitha a/p Krishnan', 'Shahrul bin Nizam', 'Ng Pei Shan',
  'Dinesh a/l Sivakumar', 'Zulaikha binti Omar', 'Chew Yoke Lan', 'Arumugam a/l Pillai',
  'Hairul bin Shukri', 'Soo Mei Yee', 'Kavitha a/p Raju', 'Amirah binti Zulkifli',
  'Phang Wai Loon', 'Sanjay a/l Menon', 'Rohaya binti Daud', 'Gan Khai Seng',
];

const SALESPEOPLE = [
  { name: 'Grace Tan', phone: '0171112222' },
  { name: 'Amirul Hakim', phone: '0173334444' },
  { name: 'Jaya Sundram', phone: '0175556666' },
  { name: 'Melissa Chong', phone: '0177778888' },
];

// ── Helpers for per-order detail ────────────────────────────────────────────

// Today's morning run is already on the road, so its stops are strung out across
// the lifecycle: the early ones dropped, one being carried in right now, the rest
// still on the lorry. This is what puts the UI into its locked/live state.
function liveMorningStatus(index, count) {
  const handover = Math.floor(count / 2);
  if (index < handover) return 'Delivered';
  if (index === handover) return 'Delivering';
  return 'Loaded';
}

function lineStatusFor(orderStatus) {
  if (orderStatus === 'Delivered') return { item_delivery_status: 'delivered', handling_status: 'unloaded' };
  if (orderStatus === 'Delivering' || orderStatus === 'Loaded') {
    return { item_delivery_status: 'pending', handling_status: 'loaded' };
  }
  return { item_delivery_status: 'pending', handling_status: 'pending' };
}

function buildLines(orderId, product, quantity, orderStatus) {
  const requiresInstall = !!product.installer_team_required_flag;
  const { item_delivery_status, handling_status } = lineStatusFor(orderStatus);
  return {
    order_id: orderId,
    product_id: product.id,
    quantity,
    delivered_quantity: orderStatus === 'Delivered' ? quantity : 0,
    service_type: requiresInstall ? 'delivery_installation' : 'delivery_only',
    dismantle_required: !!product.dismantle_required_flag,
    // The real column names. There is no `custom_dismantle_time` column — the
    // reader at scheduler.js:460 looks for one and always gets undefined.
    dismantle_time_min: product.dismantle_required_flag ? product.dismantle_time : null,
    dismantle_time_max: product.dismantle_required_flag ? product.dismantle_time + 15 : null,
    custom_installation_time_min: requiresInstall ? product.estimated_installation_time_min : null,
    custom_installation_time_max: requiresInstall ? product.estimated_installation_time_max : null,
    item_delivery_status,
    handling_status,
  };
}

async function main() {
  console.log(`\n=== TBM B.1 Scheduler Demo Seed — writing to ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')} ===\n`);
  console.log(`[seedSchedulerDemo] KL today: ${klToday}  ->  week ${weekDays[0]} .. ${weekDays[weekDays.length - 1]}`);
  console.log(`[seedSchedulerDemo] Live day (departed trips): ${liveDay}`);

  await truncateAll();

  // ── Roles ───────────────────────────────────────────────────────────────
  // Role NAMES are load-bearing, not cosmetic: scheduler.js:516 infers crew
  // capability by substring ('delivery' for a delivery crew, 'installation' for
  // an installer), and utils/schedule/skillRules.js mirrors that on the client.
  const roleAdmin = await prisma.roles.create({
    data: { name: 'Admin', permissions: ['dashboard', 'cases', 'delivery', 'scanning', 'driver'] },
  });
  const roleLogistics = await prisma.roles.create({
    data: { name: 'Logistics Admin', permissions: ['dashboard', 'delivery', 'scanning'] },
  });
  const roleDriver = await prisma.roles.create({
    data: { name: 'Delivery Driver', permissions: ['delivery', 'scanning', 'driver'] },
  });
  const roleAssistant = await prisma.roles.create({
    data: { name: 'Delivery Assistant', permissions: ['delivery', 'scanning'] },
  });
  const roleInstaller = await prisma.roles.create({
    data: { name: 'Installation Technician', permissions: ['delivery'] },
  });
  console.log('[seedSchedulerDemo] 5 roles created');

  // ── Outlets ─────────────────────────────────────────────────────────────
  const outletKL = await prisma.outlets.create({ data: { outlet_code: 'KL-01', name: 'TBM Cheras Outlet' } });
  const outletPJ = await prisma.outlets.create({ data: { outlet_code: 'PJ-02', name: 'TBM Petaling Jaya Outlet' } });

  // ── Employees ───────────────────────────────────────────────────────────
  const pwd = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await prisma.employees.create({
    data: {
      name: 'Aiman Zulkifli', display_name: 'Aiman', email: 'admin@demo.tbm.local',
      contact_number: '0121234567', password: pwd, role_id: roleAdmin.id,
      outlet_id: outletKL.id, active_flag: true,
    },
  });
  // Mr Lee is the approval gate in §5: the engine proposes, he approves.
  const warehouseLead = await prisma.employees.create({
    data: {
      name: 'Lee Chee Meng', display_name: 'Mr Lee', email: 'lee.warehouse@demo.tbm.local',
      contact_number: '0129876543', password: pwd, role_id: roleLogistics.id,
      outlet_id: outletKL.id, active_flag: true,
    },
  });

  const drivers = [];
  for (let i = 0; i < DRIVER_NAMES.length; i += 1) {
    drivers.push(await prisma.employees.create({
      data: {
        name: DRIVER_NAMES[i], display_name: DRIVER_NAMES[i].split(' ')[0],
        email: `driver${i + 1}@demo.tbm.local`, contact_number: `01110000${String(i + 1).padStart(2, '0')}`,
        password: pwd, role_id: roleDriver.id,
        outlet_id: i % 2 === 0 ? outletKL.id : outletPJ.id, active_flag: true,
      },
    }));
  }
  const assistants = [];
  for (let i = 0; i < ASSISTANT_NAMES.length; i += 1) {
    assistants.push(await prisma.employees.create({
      data: {
        name: ASSISTANT_NAMES[i], display_name: ASSISTANT_NAMES[i].split(' ')[0],
        email: `assistant${i + 1}@demo.tbm.local`, contact_number: `01220000${String(i + 1).padStart(2, '0')}`,
        password: pwd, role_id: roleAssistant.id,
        outlet_id: i % 2 === 0 ? outletKL.id : outletPJ.id, active_flag: true,
      },
    }));
  }
  const installers = [];
  for (let i = 0; i < INSTALLER_NAMES.length; i += 1) {
    const emp = await prisma.employees.create({
      data: {
        name: INSTALLER_NAMES[i], display_name: INSTALLER_NAMES[i].split(' ')[0],
        email: `installer${i + 1}@demo.tbm.local`, contact_number: `01440000${String(i + 1).padStart(2, '0')}`,
        password: pwd, role_id: roleInstaller.id, outlet_id: outletPJ.id, active_flag: true,
      },
    });
    await prisma.installers.create({
      data: {
        employee_id: emp.id, company_name: 'RajKay Installation Services',
        product_category: 'Aircond / Wardrobe / TV mount', collection_point: outletPJ.name,
      },
    });
    installers.push(emp);
  }
  console.log(`[seedSchedulerDemo] ${2 + drivers.length + assistants.length + installers.length} employees created (${drivers.length} drivers, ${assistants.length} assistants, ${installers.length} installers)`);

  // ── Zones ───────────────────────────────────────────────────────────────
  const zones = {};
  for (const zoneName of ZONE_NAMES) {
    zones[zoneName] = await prisma.zones.create({ data: { zone_name: zoneName } });
  }

  // ── Buildings ───────────────────────────────────────────────────────────
  const buildings = [];
  for (const spec of BUILDINGS) {
    const { zone, city, state, ...columns } = spec;
    const row = await prisma.buildings.create({
      data: { ...columns, zone_id: zones[zone].id },
    });
    buildings.push({ ...row, zoneName: zone, city, state });
  }
  const buildingsByZone = {};
  for (const zoneName of ZONE_NAMES) {
    buildingsByZone[zoneName] = buildings.filter(b => b.zoneName === zoneName);
  }
  const buildingByName = Object.fromEntries(buildings.map(b => [b.building_name, b]));
  console.log(`[seedSchedulerDemo] ${ZONE_NAMES.length} zones, ${buildings.length} buildings created`);

  // ── Trucks & truck_zones ────────────────────────────────────────────────
  const trucks = [];
  for (let i = 0; i < FLEET.length; i += 1) {
    const spec = FLEET[i];
    const zoneName = ZONE_NAMES[i % ZONE_NAMES.length];
    const row = await prisma.trucks.create({
      data: {
        plate_no: spec.plate, tone: spec.tone, ...TONE_DIMENSIONS[spec.tone],
        off_day: spec.off_day ?? null,
        // Every lorry has its own default crew; slots may still rotate teams.
        driver_id: i < drivers.length ? drivers[i].id : null,
        assistant_id: i < assistants.length ? assistants[i].id : null,
      },
    });
    await prisma.truck_zones.create({
      data: { truck_id: row.id, zone_id: zones[zoneName].id, is_primary_zone: true },
    });
    trucks.push({ ...row, zoneName });
  }
  const threeTon = trucks.filter(t => t.tone === 3).length;
  console.log(`[seedSchedulerDemo] ${trucks.length} trucks created (${threeTon} x 3-ton, ${trucks.length - threeTon} x 1-ton), ${trucks.length} truck_zones`);

  // ── Teams and crews ─────────────────────────────────────────────────────
  // Ten crews, but only A/C/E/G/I carry an installation technician. That split is
  // the point: the installer-skill check is inferred from role name, so the UI
  // needs both an installer-capable crew and an installer-less one to be able
  // to show its "No installer in crew" conflict at all.
  const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const teams = [];
  const assignmentRows = [];
  for (let i = 0; i < TEAM_LETTERS.length; i += 1) {
    const team = await prisma.teams.create({
      data: {
        team_type: `Delivery Team ${TEAM_LETTERS[i]}`, available_flag: true,
        primary_driver_id: drivers[i].id, assistant_driver_id: assistants[i].id,
        truck_id: trucks[i].id,
      },
    });
    assignmentRows.push({ employee_id: drivers[i].id, team_id: team.id, assigned_at: atTime(weekDays[0], '08:00') });
    assignmentRows.push({ employee_id: assistants[i].id, team_id: team.id, assigned_at: atTime(weekDays[0], '08:00') });
    // Even-indexed teams (A, C, E, G, I) get one of the five technicians;
    // B, D, F, H and J are driver + assistant only.
    const installer = i % 2 === 0 ? (installers[i / 2] ?? null) : null;
    if (installer) {
      assignmentRows.push({ employee_id: installer.id, team_id: team.id, assigned_at: atTime(weekDays[0], '08:00') });
    }
    teams.push({ ...team, hasInstaller: !!installer });
  }
  // employee_team_assignments is @@unique([employee_id, team_id]); every pair
  // above is distinct, so one createMany is safe.
  await prisma.employee_team_assignments.createMany({ data: assignmentRows });
  const installerTeams = teams.filter(t => t.hasInstaller).length;
  console.log(`[seedSchedulerDemo] ${teams.length} teams created (${installerTeams} with an installer, ${teams.length - installerTeams} without), ${assignmentRows.length} crew assignments`);

  // ── Customers ───────────────────────────────────────────────────────────
  const customers = [];
  for (let i = 0; i < CUSTOMER_NAMES.length; i += 1) {
    const home = buildings[i % buildings.length];
    customers.push(await prisma.customers.create({
      data: {
        full_name: CUSTOMER_NAMES[i],
        email: `customer${i + 1}@demo.local`,
        phone: `01680${String(i + 1).padStart(5, '0')}`,
        address: home.address, city: home.city, postcode: home.postal_code, state: home.state,
        notifications_enabled: i % 5 !== 0,
        preferred_delivery_time_start: home.access_time_window_start ?? null,
        preferred_delivery_time_end: home.access_time_window_end ?? null,
        created_at: atTime(weekDays[0], '09:00'),
      },
    }));
  }
  console.log(`[seedSchedulerDemo] ${customers.length} customers created`);

  // ── Products ────────────────────────────────────────────────────────────
  const products = [];
  for (const spec of PRODUCTS) {
    const { key, ...columns } = spec;
    const row = await prisma.products.create({ data: { ...columns, available_flag: true } });
    products.push({ ...row, key });
  }
  const productByKey = Object.fromEntries(products.map(p => [p.key, p]));
  const installerProducts = products.filter(p => p.installer_team_required_flag);
  // Substitutes for an installer-only product when the crew has no technician.
  // Deliberately NOT "every product without the installer flag", because that
  // set includes the sofa — falling back to a 2.1 m3 item would leak peak-day
  // bulk onto ordinary days and quietly undo the band separation across the week.
  const routineSimple = ['washer', 'dryer', 'fridge'].map(k => productByKey[k]);
  console.log(`[seedSchedulerDemo] ${products.length} products created (${installerProducts.length} needing an installer)`);

  // ── The week: time slots, lorry trips, scheduled orders ─────────────────
  const slotRows = [];
  const tripRows = [];
  const orderRows = [];
  const lineRows = [];
  let orderSeq = 0;

  // Mr Lee's approval queue (§5 step 3) needs content whichever weekday this is
  // run on: everything up to the day after the live day is already approved, and
  // the rest is still 'assigned' — engine output awaiting his sign-off. The lower
  // bound at liveDayIndex matters because a day whose lorries have already left
  // cannot still be awaiting approval. (Run on a Friday there is no future day
  // left in the week, so nothing is 'assigned' and the queue is fed by the
  // unassigned pool alone.) 'pending_review' is deliberately never written: no
  // server path produces or consumes it.
  const lastIndex = weekDays.length - 1;
  const approvedThrough = Math.max(liveDayIndex, Math.min(liveDayIndex + 1, lastIndex - 1));

  weekDays.forEach((dateKey, dayIndex) => {
    const windows = windowsFor(dateKey);
    const shares = WINDOW_SHARE[windows.length];
    const dayTotal = DAILY_ORDER_TOTALS[dayjs(dateKey).day()];
    const weekday = dayjs(dateKey).format('dddd');

    // Rotate through the fleet across the week, skipping any lorry whose off_day
    // falls on this weekday.
    const eligible = trucks.filter(t => t.off_day !== weekday);
    const rosterSize = ROSTER_SIZES[dayjs(dateKey).day()];
    const isPeak = dayjs(dateKey).day() === PEAK_WEEKDAY;

    // The peak day's roster is composed explicitly rather than taken from the
    // rotation: PEAK_DAY_PLAN's cells are written against known lorry sizes, so
    // positions 0-1 must be 3-ton and 2-3 must be 1-ton for its numbers to mean
    // what the comment there says they mean.
    const roster = isPeak
      ? [
        ...eligible.filter(t => t.tone === 3).slice(0, 2),
        ...eligible.filter(t => t.tone === 1).slice(0, 2),
      ]
      : Array.from({ length: rosterSize }, (_, i) => eligible[(dayIndex * 4 + i) % eligible.length]);

    const phase = dayIndex < liveDayIndex ? 'past' : (dateKey === liveDay ? 'live' : 'future');
    const assignmentStatus = dayIndex <= approvedThrough ? 'approved' : 'assigned';

    windows.forEach((win, windowIndex) => {
      const perSlot = isPeak
        ? PEAK_DAY_PLAN[windowIndex].map(cell => cell.dos)
        : splitEvenly(Math.round(dayTotal * shares[windowIndex]), roster.length);

      roster.forEach((truck, position) => {
        const team = teams[(dayIndex + position) % teams.length];
        const driverId = team.primary_driver_id;
        const assistantId = team.assistant_driver_id;
        const slotId = crypto.randomUUID();

        // Only the live day's morning run has actually left the yard. Days before
        // the live day (when the seed is run mid-week) are closed out instead.
        const departed = phase === 'past' || (phase === 'live' && windowIndex === 0);
        const completed = phase === 'past';

        slotRows.push({
          id: slotId,
          date: dateKey,
          time_window_start: win.start,
          time_window_end: win.end,
          available_flag: !departed,
          slot_status: completed ? 'completed' : (departed ? 'out_for_delivery' : 'scheduled'),
          delivery_team_id: team.id,
          truck_id: truck.id,
          created_at: atTime(weekDays[0], '00:30'),
          loading_start_date_time: departed ? atTime(dateKey, '06:45') : null,
          loading_end_date_time: departed ? atTime(dateKey, '07:50') : null,
          departed_at: departed ? atTime(dateKey, win.start) : null,
          ended_at: completed ? atTime(dateKey, win.end) : null,
          ended_by: completed ? driverId : null,
          started_by: departed ? driverId : null,
        });

        if (departed) {
          // lorry_trips.time_slot_id is @unique, so exactly one trip per slot.
          tripRows.push({
            id: crypto.randomUUID(),
            time_slot_id: slotId,
            truck_id: truck.id,
            // Odd one out: lorry_trips.delivery_team_id is a plain String, not
            // @db.Uuid like it is on time_slots, so there is no FK behind it and
            // nothing validates the value. It still has to be the team's uuid.
            delivery_team_id: team.id,
            driver_id: driverId,
            assistant_id: assistantId,
            status: completed ? 'completed' : 'active',
            started_at: atTime(dateKey, win.start),
            started_by: driverId,
            ended_at: completed ? atTime(dateKey, win.end) : null,
            ended_by: completed ? driverId : null,
            created_at: atTime(dateKey, win.start),
            updated_at: atTime(dateKey, completed ? win.end : win.start),
          });
        }

        // Each lorry works its primary zone, so a slot's stops cluster — which is
        // what makes the B.2 route sequence on the slot mean anything.
        const zoneBuildings = buildingsByZone[truck.zoneName];
        const count = perSlot[position];

        for (let n = 0; n < count; n += 1) {
          orderSeq += 1;
          const building = zoneBuildings[orderSeq % zoneBuildings.length];
          const customer = customers[orderSeq % customers.length];
          const sales = SALESPEOPLE[orderSeq % SALESPEOPLE.length];
          const orderId = crypto.randomUUID();

          let orderStatus = 'Scheduled';
          if (completed) orderStatus = 'Delivered';
          else if (phase === 'live' && windowIndex === 0) orderStatus = liveMorningStatus(n, count);

          const delivered = orderStatus === 'Delivered';

          orderRows.push({
            id: orderId,
            odoo_order_ref: `SCHED-DO-${String(orderSeq).padStart(5, '0')}`,
            odoo_sales_ref: `S${String(90000 + orderSeq)}`,
            customer_id: customer.id,
            building_id: building.id,
            employee_id: driverId,
            time_slot_id: slotId,
            order_status: orderStatus,
            assignment_status: assignmentStatus,
            scheduled_start_date_time: atTime(dateKey, win.start),
            scheduled_end_date_time: atTime(dateKey, win.end),
            actual_start_date_time: departed ? atTime(dateKey, win.start) : null,
            actual_arrival_date_time: delivered ? atTime(dateKey, win.start) : null,
            actual_end_date_time: delivered ? atTime(dateKey, win.end) : null,
            delivered_by: delivered ? driverId : null,
            number_of_attempts: delivered ? 1 : null,
            proof_of_delivery_url: delivered ? `/uploads/demo/pod-${orderSeq}.jpg` : null,
            truck_loading_sequence: n + 1,
            delivery_address: building.address,
            delivery_city: building.city,
            delivery_postcode: building.postal_code,
            delivery_state: building.state,
            delivery_notes: building.pre_registration_required
              ? 'Pre-registration required — collect visitor pass before arrival'
              : null,
            special_equipment_needed: building.special_equipment_needed ?? null,
            salesperson_name: sales.name,
            salesperson_phone: sales.phone,
            dispatched_by: assignmentStatus === 'approved' ? warehouseLead.id : null,
            notified_pending: true,
            notified_scheduled: assignmentStatus === 'approved',
            delivery_evidence: [],
            issue_evidence: [],
            // Odoo pushes a DO a couple of days before its delivery date, and
            // the engine's FIFO ordering reads created_at, so this must not all
            // collapse onto one timestamp.
            created_at: minusHours(atTime(dateKey, '07:00'), 48 + (orderSeq % 24)),
            updated_at: atTime(dateKey, '07:00'),
          });

          // On the peak day the first `sofas` orders of the cell carry an
          // L-shape sofa, which is what pushes that slot's volume meter into its
          // amber or red band. Everything else draws from the routine mix.
          const sofaOrder = isPeak && n < PEAK_DAY_PLAN[windowIndex][position].sofas;

          if (sofaOrder) {
            // One bulky line, quantity 1: the volume comes from the item, not
            // from stacking quantity, so the cell reads as a real customer order.
            lineRows.push(buildLines(orderId, productByKey.sofa, 1, orderStatus));
          } else {
            // Crew skill is respected inside the grid: a slot whose team has no
            // installation technician never gets an installer-only product, so
            // the engine's plan stays feasible. The deliberate skill violations
            // live in the unassigned pool below instead.
            const wanted = productByKey[ROUTINE_MIX[orderSeq % ROUTINE_MIX.length]];
            const primary = (wanted.installer_team_required_flag && !team.hasInstaller)
              ? routineSimple[orderSeq % routineSimple.length]
              : wanted;
            lineRows.push(buildLines(orderId, primary, 1 + (orderSeq % 2), orderStatus));

            // Roughly a third of orders are multi-line, as in the real DO data.
            if (orderSeq % 3 === 0) {
              const secondary = productByKey[ROUTINE_MIX[(orderSeq + 5) % ROUTINE_MIX.length]];
              const safe = (secondary.installer_team_required_flag && !team.hasInstaller)
                ? routineSimple[(orderSeq + 1) % routineSimple.length]
                : secondary;
              lineRows.push(buildLines(orderId, safe, 1, orderStatus));
            }
          }
        }
      });
    });

    // Idle lorries still get open, empty slots on every day that has not already
    // run. They are the drop targets for the unassigned pool and for dragging
    // orders off the overloaded cells, so every window on every day has somewhere
    // to land. Past days are skipped: a closed-out day has no open slots.
    if (phase !== 'past') {
      const idle = eligible.filter(t => !roster.includes(t));
      // Teams already on a lorry today are skipped so no crew is double-booked.
      const freeTeams = teams.filter((_, ti) => (ti - dayIndex + teams.length) % teams.length >= roster.length);
      idle.forEach((truck, idleIndex) => {
        const team = freeTeams[idleIndex % freeTeams.length];
        windows.forEach((win) => {
          slotRows.push({
            id: crypto.randomUUID(),
            date: dateKey,
            time_window_start: win.start,
            time_window_end: win.end,
            available_flag: true,
            slot_status: 'scheduled',
            delivery_team_id: team.id,
            truck_id: truck.id,
            created_at: atTime(weekDays[0], '00:30'),
          });
        });
      });
    }
  });

  // A handful of orders on the still-unapproved days are marked rejected, so the
  // 'Rejected' legend state and the re-plan flow have rows to act on.
  const unapprovedSlotIds = new Set(
    slotRows.filter(sl => sl.slot_status === 'scheduled' && weekDays.indexOf(sl.date) > approvedThrough).map(sl => sl.id),
  );
  orderRows
    .filter(o => o.assignment_status === 'assigned' && unapprovedSlotIds.has(o.time_slot_id))
    .filter((o, i) => i % 11 === 0)
    .slice(0, 6)
    .forEach((o) => { o.assignment_status = 'rejected'; });

  const scheduledOrderCount = orderRows.length;

  // ── The unassigned pool: the exception panel's input ────────────────────
  // Twenty-eight orders with no slot, each built to fail one specific constraint, so
  // the panel's three most interesting reason codes (ACCESS_WINDOW_MISS /
  // PERMIT_REQUIRED, INSTALLER_TEAM_MISSING, TRUCK_VOLUME_EXCEEDED) each have
  // real rows behind them rather than an empty state.

  // Spread the pool over every remaining working day (not only the next one), so
  // the Unscheduled strip is populated whichever day the dispatcher opens.
  const poolDays = weekDays.slice(Math.max(liveDayIndex, 0));

  function poolOrder(index, building, note, preferredClock) {
    orderSeq += 1;
    const preferredDay = poolDays[index % poolDays.length];
    const customer = customers[(orderSeq + 7) % customers.length];
    const sales = SALESPEOPLE[index % SALESPEOPLE.length];
    const orderId = crypto.randomUUID();
    orderRows.push({
      id: orderId,
      odoo_order_ref: `SCHED-POOL-${String(index + 1).padStart(3, '0')}`,
      odoo_sales_ref: `S${String(99000 + index)}`,
      customer_id: customer.id,
      building_id: building.id,
      employee_id: null,
      time_slot_id: null,
      order_status: 'Pending',
      assignment_status: 'unassigned',
      // What the salesperson promised the customer (§5 step 1), which is what the
      // engine then has to try to honour.
      preferred_timeslot: atTime(preferredDay, preferredClock),
      delivery_address: building.address,
      delivery_city: building.city,
      delivery_postcode: building.postal_code,
      delivery_state: building.state,
      delivery_notes: note,
      special_equipment_needed: building.special_equipment_needed ?? null,
      salesperson_name: sales.name,
      salesperson_phone: sales.phone,
      notified_pending: true,
      notified_scheduled: false,
      delivery_evidence: [],
      issue_evidence: [],
      // Staggered backwards so the engine's FIFO ordering (scheduler.js
      // fetchPendingOrders sorts by created_at asc) has something to sort, and
      // the oldest unscheduled order visibly ages at the top of the panel.
      created_at: minusHours(atTime(weekDays[0], '08:00'), 20 - index),
      updated_at: atTime(weekDays[0], '08:00'),
    });
    return orderId;
  }

  // 10 x tight building access windows -> ACCESS_WINDOW_MISS / PERMIT_REQUIRED.
  const tightAccess = [
    'Klang Parade Retail Lot',       // 08:00-11:00, permit
    'Residensi Alam Impian',         // 11:00-15:00, permit
    'Mandarina Court',               // 14:00-18:00, permit
    'Damansara Uptown Corporate Tower', // 10:00-16:00, permit
    'Klang Parade Retail Lot',
    'Mandarina Court',
    'Residensi Alam Impian',
    'Damansara Uptown Corporate Tower',
    'Klang Parade Retail Lot',
    'Mandarina Court',
  ];
  tightAccess.forEach((name, i) => {
    const building = buildingByName[name];
    const orderId = poolOrder(
      i, building,
      `Access window ${building.access_time_window_start}-${building.access_time_window_end} only`,
      '08:00',
    );
    lineRows.push(buildLines(orderId, productByKey[i % 2 === 0 ? 'fridge' : 'washer'], 1, 'Pending'));
  });

  // 10 x needing an installation technician -> INSTALLER_TEAM_MISSING whenever the
  // dispatcher drops one onto a crew without one (teams B, D, F, H, J).
  const installNeeded = ['aircond', 'wardrobe', 'tv', 'aircond', 'wardrobe', 'tv', 'aircond', 'wardrobe', 'aircond', 'tv'];
  installNeeded.forEach((key, i) => {
    const building = buildings[(i * 3) % buildings.length];
    const orderId = poolOrder(
      tightAccess.length + i, building,
      'Installation required — crew must include a trained installer',
      '13:00',
    );
    lineRows.push(buildLines(orderId, productByKey[key], 1 + (i % 2), 'Pending'));
  });

  // 8 x bulky sofas in quantities of 3-6. At 2.14 m3 a unit against a 1-ton load
  // box of 7.6 m3, anything from 4 up cannot physically fit on a 1-ton lorry, so
  // these force a 3-ton or get refused -> TRUCK_VOLUME_EXCEEDED.
  const bulkQuantities = [3, 4, 5, 6, 4, 5, 3, 6];
  bulkQuantities.forEach((quantity, i) => {
    const building = buildings[(i * 5 + 1) % buildings.length];
    const orderId = poolOrder(
      tightAccess.length + installNeeded.length + i, building,
      `${quantity} x L-shape sofa — needs a 3-ton lorry`,
      '13:00',
    );
    lineRows.push(buildLines(orderId, productByKey.sofa, quantity, 'Pending'));
  });

  const poolOrderCount = orderRows.length - scheduledOrderCount;

  // ── Write the week ──────────────────────────────────────────────────────
  await prisma.time_slots.createMany({ data: slotRows });
  console.log(`[seedSchedulerDemo] ${slotRows.length} time slots created`);
  await prisma.lorry_trips.createMany({ data: tripRows });
  console.log(`[seedSchedulerDemo] ${tripRows.length} lorry trips created (status 'active' on ${liveDay})`);
  await prisma.orders.createMany({ data: orderRows });
  console.log(`[seedSchedulerDemo] ${orderRows.length} orders created (${scheduledOrderCount} slotted, ${poolOrderCount} unassigned pool)`);
  await prisma.order_products.createMany({ data: lineRows });
  console.log(`[seedSchedulerDemo] ${lineRows.length} order_products lines created`);

  // ── Scheduler config ────────────────────────────────────────────────────
  await prisma.scheduler_config.create({
    data: {
      warehouse_address: 'Lot 33, Jalan Delima 1/3, Subang Hi-tech Industrial Park, 40000 Shah Alam, Selangor',
      warehouse_postal: '40000',
      // The columns exist and both optimisers read them, even though
      // GET /api/scheduler/config does not return them yet.
      warehouse_latitude: 3.0533000,
      warehouse_longitude: 101.5851000,
      cron_expression: '0 0 * * *',
      enabled: true,
      last_run_at: atTime(weekDays[0], '00:30'),
    },
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  const slotDateById = new Map(slotRows.map(s => [s.id, s.date]));
  const ordersPerDay = new Map(weekDays.map(d => [d, 0]));
  for (const order of orderRows) {
    const date = order.time_slot_id ? slotDateById.get(order.time_slot_id) : null;
    if (date) ordersPerDay.set(date, ordersPerDay.get(date) + 1);
  }
  const byDay = weekDays.map(dateKey => {
    const daySlots = slotRows.filter(s => s.date === dateKey);
    const rostered = new Set(daySlots.filter(s => orderRows.some(o => o.time_slot_id === s.id)).map(s => s.truck_id)).size;
    const biggest = Math.max(...daySlots.map(s => orderRows.filter(o => o.time_slot_id === s.id).length));
    const tag = dayjs(dateKey).day() === PEAK_WEEKDAY
      ? '  <- peak day, thin roster'
      : (dayjs(dateKey).day() === 4 ? '  <- far-area day, 2 windows' : '');
    return `  ${dayjs(dateKey).format('ddd DD MMM')}  ${String(daySlots.length).padStart(2)} slots (incl. open)  `
      + `${String(ordersPerDay.get(dateKey)).padStart(3)} orders  ${rostered} lorries  `
      + `busiest slot ${String(biggest).padStart(2)} DOs${tag}`;
  });

  const peakDate = weekDays.find(d => dayjs(d).day() === PEAK_WEEKDAY);

  console.log('\n=== Scheduler demo seed complete ===');
  console.log(`Week:              ${weekDays[0]} .. ${weekDays[weekDays.length - 1]} (Sat/Sun skipped, as the engine does)`);
  console.log(`Live day:          ${liveDay} — morning slots out_for_delivery, afternoon/night still scheduled`);
  console.log(`Far-area day:      Thursday, two windows only, so its column is visibly lighter`);
  if (peakDate) {
    console.log(`Peak day:          ${peakDate} — ${DAILY_ORDER_TOTALS[PEAK_WEEKDAY]} DOs on ${ROSTER_SIZES[PEAK_WEEKDAY]} lorries, so the`);
    console.log('                   capacity meters reach their amber and red bands and one slot');
    console.log('                   goes over the 25-DO cap. The other four days stay calm.');
  }
  console.log(byDay.join('\n'));
  console.log(`\nFleet:             ${trucks.length} lorries (${threeTon} x 3-ton, ${trucks.length - threeTon} x 1-ton)`);
  console.log(`Roster per day:    ${weekDays.map(d => `${dayjs(d).format('ddd')} ${ROSTER_SIZES[dayjs(d).day()]}`).join(', ')}`);
  console.log(`Teams:             ${teams.length} (${installerTeams} installer-capable, ${teams.length - installerTeams} not)`);
  console.log(`Zones / buildings: ${ZONE_NAMES.length} / ${buildings.length}`);
  console.log(`Products:          ${products.length}`);
  console.log(`Customers:         ${customers.length}`);
  console.log(`Time slots:        ${slotRows.length}`);
  console.log(`Lorry trips:       ${tripRows.length}`);
  console.log(`Orders:            ${orderRows.length} (${scheduledOrderCount} slotted, ${poolOrderCount} unassigned pool)`);
  console.log(`Order lines:       ${lineRows.length}`);
  console.log(`\nLogin as admin:    ${admin.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as Mr Lee:   ${warehouseLead.email} / ${DEMO_PASSWORD}`);
  console.log(`\nOpen the scheduler at:  /schedule?data=live\n`);
}

main()
  .catch((err) => {
    console.error('[seedSchedulerDemo] Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
