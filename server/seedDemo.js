// server/seedDemo.js
//
// Comprehensive demo dataset for the throwaway Docker Postgres container
// (docker-compose.demo.yml). Populates every model in schema.prisma with a
// coherent, interlinked story spanning the full order lifecycle — pending,
// scheduled, in-transit, delivered-with-rating, failed-with-return-and-reentry,
// escalated/overdue, rescheduled, and cancelled — so every dashboard, filter,
// and report screen has something real to show. Also seeds two orders dated
// today specifically so every current Scan Station tab (Loading/Unloading/Audit)
// has rows without touching the date picker — see DEMO.md's Scan Station table.
//
// SAFETY: this script only ever talks to the URL in server/.env.demo, and
// refuses to run unless that URL is unmistakably the local demo container
// (see assertDemoDatabase() below). It is never wired to prismaClient.js
// (the one the running app and every other seed* script uses), so it cannot
// touch SANDBOX or PRODUCTION even by mistake.
//
// Safe to re-run: wipes every table in this database (all of it is demo
// data — see truncateAll()) and reseeds from scratch each time.
//
// Usage:  cd server
//         set -a; source .env.demo; set +a
//         node seedDemo.js
//    or:  npm run seed:demo   (does the same — see package.json)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.demo') });

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
      '[seedDemo] Refusing to run — DATABASE_URL does not look like the local demo ' +
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

// Pin the current recording dataset to 10 September 2026 in Malaysia.
// DEMO_DATE may still override this when a different rehearsal date is needed.
const demoDate = process.env.DEMO_DATE || '2026-09-10';
if (!/^\d{4}-\d{2}-\d{2}$/.test(demoDate) || !dayjs(demoDate).isValid()) {
  throw new Error(`Invalid DEMO_DATE "${demoDate}"; expected YYYY-MM-DD`);
}
const now = dayjs(`${demoDate}T12:00:00+08:00`);

// Dates relative to "today" so the demo always looks current whenever it's run.
const D = {
  past6: now.subtract(6, 'day'),
  past3: now.subtract(3, 'day'),
  today: now,
  future3: now.add(3, 'day'),
  future5: now.add(5, 'day'),
  future7: now.add(7, 'day'),
};

function atTime(day, hhmm) {
  return new Date(`${day.format('YYYY-MM-DD')}T${hhmm}:00+08:00`);
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
  console.log('[seedDemo] Truncated all tables');
}

async function main() {
  console.log(`\n=== TBM Demo Seed — writing to ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')} ===\n`);
  console.log(`[seedDemo] Demo date: ${D.today.format('YYYY-MM-DD')} (Asia/Kuala_Lumpur)`);

  await truncateAll();

  // ── Roles ───────────────────────────────────────────────────────────────
  const roleAdmin = await prisma.roles.create({
    data: { name: 'Admin', permissions: ['dashboard', 'cases', 'delivery', 'scanning', 'driver'] },
  });
  const roleDelivery = await prisma.roles.create({
    data: { name: 'Delivery Team', permissions: ['delivery', 'scanning', 'driver'] },
  });
  const roleInstaller = await prisma.roles.create({
    data: { name: 'Installer', permissions: ['delivery'] },
  });
  console.log('[seedDemo] Roles created');

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
  const dispatcher = await prisma.employees.create({
    data: {
      name: 'Nadia Hassan', display_name: 'Nadia', email: 'dispatcher@demo.tbm.local',
      contact_number: '0129876543', password: pwd, role_id: roleAdmin.id,
      outlet_id: outletKL.id, active_flag: true,
    },
  });
  const driver1 = await prisma.employees.create({
    data: {
      name: 'Razif bin Ahmad', display_name: 'Razif', email: 'razif.driver@demo.tbm.local',
      contact_number: '0111234567', password: pwd, role_id: roleDelivery.id,
      outlet_id: outletKL.id, active_flag: true,
    },
  });
  const assistant1 = await prisma.employees.create({
    data: {
      name: 'Hafiz bin Osman', display_name: 'Hafiz', email: 'hafiz.assist@demo.tbm.local',
      contact_number: '0111234568', password: pwd, role_id: roleDelivery.id,
      outlet_id: outletKL.id, active_flag: true,
    },
  });
  const driver2 = await prisma.employees.create({
    data: {
      name: 'Suresh a/l Kumar', display_name: 'Suresh', email: 'suresh.driver@demo.tbm.local',
      contact_number: '0122345678', password: pwd, role_id: roleDelivery.id,
      outlet_id: outletPJ.id, active_flag: true,
    },
  });
  const assistant2 = await prisma.employees.create({
    data: {
      name: 'Nurul Ain binti Kamal', display_name: 'Nurul', email: 'nurul.assist@demo.tbm.local',
      contact_number: '0122345679', password: pwd, role_id: roleDelivery.id,
      outlet_id: outletPJ.id, active_flag: true,
    },
  });
  const installerEmp = await prisma.employees.create({
    data: {
      name: 'Kumaran a/l Raj', display_name: 'Kumaran', email: 'kumaran.installer@demo.tbm.local',
      contact_number: '0144567890', password: pwd, role_id: roleInstaller.id,
      outlet_id: outletPJ.id, active_flag: true,
    },
  });
  await prisma.installers.create({
    data: {
      employee_id: installerEmp.id, company_name: 'RajKay Installation Services',
      product_category: 'Aircond / Wardrobe', collection_point: outletPJ.name,
    },
  });
  const inactiveDriver = await prisma.employees.create({
    data: {
      name: 'Chong Boon Hui', display_name: 'Boon Hui', email: 'boonhui.former@demo.tbm.local',
      contact_number: '0155678901', password: pwd, role_id: roleDelivery.id,
      outlet_id: outletKL.id, active_flag: false, // edge case: deactivated staff, still has FK history
    },
  });
  console.log('[seedDemo] 8 employees created (incl. 1 inactive)');

  await prisma.employee_locations.create({
    data: { employee_id: driver1.id, latitude: 3.1390, longitude: 101.6869 },
  });
  await prisma.employee_locations.create({
    data: { employee_id: driver2.id, latitude: 3.1073, longitude: 101.6067 },
  });

  // ── Zones & buildings ───────────────────────────────────────────────────
  const zoneKL = await prisma.zones.create({ data: { zone_name: 'Kuala Lumpur Central' } });
  const zonePJ = await prisma.zones.create({ data: { zone_name: 'Petaling Jaya / Subang' } });
  const zoneKlang = await prisma.zones.create({ data: { zone_name: 'Klang / Shah Alam' } });

  const buildingLanded = await prisma.buildings.create({
    data: {
      building_name: 'Taman Desa Landed House', housing_type: 'Landed', zone_id: zoneKL.id,
      postal_code: '58100', address: 'No. 12, Jalan Desa 5, Taman Desa', loading_bay_available: false,
      lift_available: false, narrow_doorways: false, pre_registration_required: false,
      latitude: 3.0925, longitude: 101.6809,
    },
  });
  const buildingCondoLift = await prisma.buildings.create({
    data: {
      building_name: 'Menara Suria Condominium', housing_type: 'Condominium', zone_id: zonePJ.id,
      postal_code: '46000', address: 'Jalan SS2/24, Menara Suria', loading_bay_available: true,
      lift_available: true, lift_dimensions: '200cm x 150cm x 230cm', narrow_doorways: false,
      pre_registration_required: true, access_time_window_start: '09:00', access_time_window_end: '18:00',
      latitude: 3.1177, longitude: 101.6234,
    },
  });
  const buildingCondoNoLift = await prisma.buildings.create({
    data: {
      building_name: 'Sri Mutiara Apartment (Walk-up)', housing_type: 'Apartment', zone_id: zonePJ.id,
      postal_code: '47301', address: 'Jalan Kelang Lama, Sri Mutiara Blok C', loading_bay_available: false,
      lift_available: false, narrow_doorways: true, notes: '4th floor walk-up, narrow staircase',
      parking_distance: '80m', latitude: 3.0654, longitude: 101.6423,
    },
  });
  const buildingCommercial = await prisma.buildings.create({
    data: {
      building_name: 'Menara TBM Corporate Tower', housing_type: 'Commercial', zone_id: zoneKL.id,
      postal_code: '50450', address: 'Jalan Ampang, Menara TBM', loading_bay_available: true,
      lift_available: true, lift_dimensions: '250cm x 200cm x 250cm', pre_registration_required: true,
      access_time_window_start: '08:00', access_time_window_end: '17:00',
      vehicle_size_limit: '5 tonne', special_equipment_needed: 'Trolley + hand pallet jack',
      latitude: 3.1611, longitude: 101.7183,
    },
  });
  const buildingShoplot = await prisma.buildings.create({
    data: {
      building_name: 'Jalan Meru Shoplot', housing_type: 'Shoplot', zone_id: zoneKlang.id,
      postal_code: '41050', address: '23, Jalan Meru 2, Bandar Baru Klang', loading_bay_available: false,
      narrow_doorways: true, vehicle_width_limit: '2.1m', latitude: 3.0587, longitude: 101.4498,
    },
  });
  const buildingGated = await prisma.buildings.create({
    data: {
      building_name: 'Bukit Rimau Gated Community', housing_type: 'Landed (Gated)', zone_id: zoneKlang.id,
      postal_code: '40460', address: 'Persiaran Rimau, Bukit Rimau', loading_bay_available: false,
      pre_registration_required: true, access_time_window_start: '10:00', access_time_window_end: '19:00',
      notes: 'Guardhouse requires visitor pass 1 day in advance', latitude: 3.0389, longitude: 101.5309,
    },
  });
  console.log('[seedDemo] 3 zones, 6 buildings created');

  // ── Trucks & truck_zones ────────────────────────────────────────────────
  const truck1 = await prisma.trucks.create({
    data: { plate_no: 'WXX 1234', tone: 3, length_cm: 420, width_cm: 190, height_cm: 200, driver_id: driver1.id, assistant_id: assistant1.id },
  });
  const truck2 = await prisma.trucks.create({
    data: { plate_no: 'WYY 5678', tone: 1, length_cm: 280, width_cm: 160, height_cm: 170, driver_id: driver2.id, assistant_id: assistant2.id },
  });
  const truck3 = await prisma.trucks.create({
    data: { plate_no: 'WZZ 9999', tone: 5, length_cm: 520, width_cm: 210, height_cm: 220, off_day: 'Sunday' }, // spare truck, unassigned driver
  });
  await prisma.truck_zones.createMany({
    data: [
      { truck_id: truck1.id, zone_id: zoneKL.id, is_primary_zone: true },
      { truck_id: truck1.id, zone_id: zoneKlang.id, is_primary_zone: false },
      { truck_id: truck2.id, zone_id: zonePJ.id, is_primary_zone: true },
      { truck_id: truck3.id, zone_id: zoneKL.id, is_primary_zone: false },
    ],
  });
  console.log('[seedDemo] 3 trucks, 4 truck_zones created');

  // ── Teams (primary/assistant driver + truck pairing) ───────────────────
  const deliveryTeamA = await prisma.teams.create({
    data: { team_type: 'Delivery Team A', available_flag: true, primary_driver_id: driver1.id, assistant_driver_id: assistant1.id, truck_id: truck1.id },
  });
  const deliveryTeamB = await prisma.teams.create({
    data: { team_type: 'Delivery Team B', available_flag: true, primary_driver_id: driver2.id, assistant_driver_id: assistant2.id, truck_id: truck2.id },
  });
  const installerTeam = await prisma.teams.create({
    data: { team_type: 'Installer Team', available_flag: true },
  });
  await prisma.employee_team_assignments.createMany({
    data: [
      { employee_id: driver1.id, team_id: deliveryTeamA.id, assigned_at: D.past6.toDate() },
      { employee_id: assistant1.id, team_id: deliveryTeamA.id, assigned_at: D.past6.toDate() },
      { employee_id: driver2.id, team_id: deliveryTeamB.id, assigned_at: D.past6.toDate() },
      { employee_id: assistant2.id, team_id: deliveryTeamB.id, assigned_at: D.past6.toDate() },
      { employee_id: installerEmp.id, team_id: installerTeam.id, assigned_at: D.past6.toDate() },
    ],
  });
  console.log('[seedDemo] 3 teams, 5 team assignments created');

  // ── Customers ────────────────────────────────────────────────────────────
  const custTan = await prisma.customers.create({ data: {
    full_name: 'Tan Mei Ling', email: 'meiling.tan@demo.local', phone: '0161234567',
    address: buildingLanded.address, city: 'Kuala Lumpur', postcode: buildingLanded.postal_code, state: 'Wilayah Persekutuan',
    notifications_enabled: true, created_at: D.past6.toDate(),
  }});
  const custWong = await prisma.customers.create({ data: {
    full_name: 'Wong Kar Fai', email: 'karfai.wong@demo.local', phone: '0162345678',
    address: buildingCondoLift.address, city: 'Petaling Jaya', postcode: buildingCondoLift.postal_code, state: 'Selangor',
    notifications_enabled: true, preferred_delivery_time_start: '09:00', preferred_delivery_time_end: '13:00',
    preferred_delivery_notes: 'Please call security 15 min before arrival', created_at: D.past6.toDate(),
  }});
  const custNorain = await prisma.customers.create({ data: {
    full_name: 'Norain binti Ismail', email: 'norain.ismail@demo.local', phone: '0163456789',
    address: buildingCondoNoLift.address, city: 'Petaling Jaya', postcode: buildingCondoNoLift.postal_code, state: 'Selangor',
    notifications_enabled: false, created_at: D.past3.toDate(),
  }});
  const custCorp = await prisma.customers.create({ data: {
    full_name: 'Menara TBM Corporate Tower (Facilities)', email: 'facilities@menaratbm-demo.local', phone: '0164567890',
    address: buildingCommercial.address, city: 'Kuala Lumpur', postcode: buildingCommercial.postal_code, state: 'Wilayah Persekutuan',
    notifications_enabled: true, created_at: D.past3.toDate(),
  }});
  const custMuthu = await prisma.customers.create({ data: {
    full_name: 'Muthu a/l Samy', email: 'muthu.samy@demo.local', phone: '0165678901',
    address: buildingShoplot.address, city: 'Klang', postcode: buildingShoplot.postal_code, state: 'Selangor',
    notifications_enabled: true, created_at: D.today.toDate(),
  }});
  const custSiti = await prisma.customers.create({ data: {
    full_name: 'Siti Fatimah binti Zakaria', email: 'siti.fatimah@demo.local', phone: '0166789012',
    address: buildingGated.address, city: 'Shah Alam', postcode: buildingGated.postal_code, state: 'Selangor',
    notifications_enabled: true, created_at: D.today.toDate(),
  }});
  const custLee = await prisma.customers.create({ data: {
    full_name: 'Lee Chong Wei', email: 'chongwei.lee@demo.local', phone: '0167890123',
    address: buildingLanded.address, city: 'Kuala Lumpur', postcode: buildingLanded.postal_code, state: 'Wilayah Persekutuan',
    notifications_enabled: true, created_at: D.today.toDate(),
  }});
  const custPriya = await prisma.customers.create({ data: {
    full_name: 'Priya a/p Segaran', email: 'priya.segaran@demo.local', phone: '0168901234',
    address: buildingCondoLift.address, city: 'Petaling Jaya', postcode: buildingCondoLift.postal_code, state: 'Selangor',
    notifications_enabled: true, created_at: D.today.toDate(),
  }});
  console.log('[seedDemo] 8 customers created');

  // ── Products ────────────────────────────────────────────────────────────
  const pSofa = await prisma.products.create({ data: {
    product_name: 'NOVA 3-Seater L-Shape Sofa', package_length_cm: 280, package_width_cm: 90, package_height_cm: 85,
    fragile_flag: false, installer_team_required_flag: false, dismantle_required_flag: false, available_flag: true,
  }});
  const pFridge = await prisma.products.create({ data: {
    product_name: 'Samsung 380L Top Freezer Fridge', package_length_cm: 70, package_width_cm: 70, package_height_cm: 170,
    fragile_flag: false, installer_team_required_flag: false, available_flag: true,
  }});
  const pMattress = await prisma.products.create({ data: {
    product_name: 'Restonic Comfort Queen Mattress', package_length_cm: 203, package_width_cm: 152, package_height_cm: 30,
    fragile_flag: false, no_lie_down_flag: true, installer_team_required_flag: false, available_flag: true,
  }});
  const pDining = await prisma.products.create({ data: {
    product_name: 'NOVA 6-Seater Dining Set', package_length_cm: 180, package_width_cm: 90, package_height_cm: 75,
    fragile_flag: false, dismantle_required_flag: true, dismantle_time: 30, installer_team_required_flag: false, available_flag: true,
  }});
  const pWasher = await prisma.products.create({ data: {
    product_name: 'LG 9kg Front Load Washer', package_length_cm: 60, package_width_cm: 60, package_height_cm: 85,
    fragile_flag: false, installer_team_required_flag: false, available_flag: true,
  }});
  const pTvConsole = await prisma.products.create({ data: {
    product_name: 'NOVA TV Console 1.8m', package_length_cm: 180, package_width_cm: 40, package_height_cm: 45,
    fragile_flag: false, dismantle_required_flag: true, dismantle_time: 20, installer_team_required_flag: false, available_flag: true,
  }});
  const pWardrobe = await prisma.products.create({ data: {
    product_name: '4-Door Sliding Wardrobe', package_length_cm: 240, package_width_cm: 60, package_height_cm: 220,
    fragile_flag: false, dismantle_required_flag: true, dismantle_time: 45, installer_team_required_flag: true,
    estimated_installation_time_min: 90, estimated_installation_time_max: 150, available_flag: true,
  }});
  const pAircond = await prisma.products.create({ data: {
    product_name: 'Daikin 1.5HP Inverter Aircond', package_length_cm: 90, package_width_cm: 30, package_height_cm: 30,
    fragile_flag: true, installer_team_required_flag: true,
    estimated_installation_time_min: 120, estimated_installation_time_max: 180, available_flag: true,
  }});
  console.log('[seedDemo] 8 products created');

  // ── Time slots ──────────────────────────────────────────────────────────
  // Past, completed round trip (used by the delivered + failed/returned orders)
  const slotPastCompleted = await prisma.time_slots.create({ data: {
    date: D.past6.format('YYYY-MM-DD'), time_window_start: '09:00', time_window_end: '13:00',
    delivery_team_id: deliveryTeamA.id, truck_id: truck1.id,
    available_flag: false, slot_status: 'completed', created_at: D.past6.subtract(1, 'day').toDate(),
    loading_start_date_time: atTime(D.past6, '07:30'), loading_end_date_time: atTime(D.past6, '08:45'),
    departed_at: atTime(D.past6, '09:00'), ended_at: atTime(D.past6, '13:20'), ended_by: driver1.id,
    started_by: driver1.id,
  }});
  // A second past completed slot for the good delivered/rated order
  const slotPastDelivered = await prisma.time_slots.create({ data: {
    date: D.past3.format('YYYY-MM-DD'), time_window_start: '14:00', time_window_end: '18:00',
    delivery_team_id: deliveryTeamB.id, truck_id: truck2.id,
    available_flag: false, slot_status: 'completed', created_at: D.past3.subtract(1, 'day').toDate(),
    loading_start_date_time: atTime(D.past3, '12:30'), loading_end_date_time: atTime(D.past3, '13:40'),
    departed_at: atTime(D.past3, '14:00'), ended_at: atTime(D.past3, '17:45'), ended_by: driver2.id,
    started_by: driver2.id,
  }});
  // Today, truck out on the road right now
  const slotTodayOut = await prisma.time_slots.create({ data: {
    date: D.today.format('YYYY-MM-DD'), time_window_start: '09:00', time_window_end: '13:00',
    delivery_team_id: deliveryTeamA.id, truck_id: truck1.id,
    available_flag: false, slot_status: 'out_for_delivery', created_at: D.today.subtract(2, 'day').toDate(),
    loading_start_date_time: atTime(D.today, '07:15'), loading_end_date_time: atTime(D.today, '08:40'),
    departed_at: atTime(D.today, '09:00'), started_by: driver1.id,
    route_polyline: null, route_distance_m: 18400, route_duration_s: 2760, route_computed_at: atTime(D.today, '08:45'),
  }});
  // Today, still loading at the warehouse (loading dashboard demo)
  const slotTodayLoading = await prisma.time_slots.create({ data: {
    date: D.today.format('YYYY-MM-DD'), time_window_start: '14:00', time_window_end: '18:00',
    delivery_team_id: deliveryTeamB.id, truck_id: truck2.id,
    available_flag: false, slot_status: 'scheduled', created_at: D.today.subtract(2, 'day').toDate(),
    loading_start_date_time: atTime(D.today, '12:00'),
  }});
  // Dedicated loading/departure demo for Razif / Delivery Team A.
  const slotTodayDemoLoading = await prisma.time_slots.create({ data: {
    date: D.today.format('YYYY-MM-DD'), time_window_start: '14:00', time_window_end: '18:00',
    delivery_team_id: deliveryTeamA.id, truck_id: truck1.id,
    available_flag: false, slot_status: 'scheduled', created_at: D.today.subtract(2, 'day').toDate(),
    loading_start_date_time: atTime(D.today, '12:00'),
  }});
  // Future, scheduled
  const slotFuture1 = await prisma.time_slots.create({ data: {
    date: D.future3.format('YYYY-MM-DD'), time_window_start: '09:00', time_window_end: '13:00',
    delivery_team_id: deliveryTeamA.id, truck_id: truck1.id,
    available_flag: true, slot_status: 'scheduled', created_at: D.today.toDate(),
  }});
  const slotFuture2 = await prisma.time_slots.create({ data: {
    date: D.future5.format('YYYY-MM-DD'), time_window_start: '10:00', time_window_end: '14:00',
    delivery_team_id: deliveryTeamB.id, truck_id: truck2.id,
    available_flag: true, slot_status: 'scheduled', created_at: D.today.toDate(),
  }});
  const slotFuture3 = await prisma.time_slots.create({ data: {
    date: D.future7.format('YYYY-MM-DD'), time_window_start: '13:00', time_window_end: '17:00',
    delivery_team_id: deliveryTeamA.id, truck_id: truck1.id,
    available_flag: true, slot_status: 'scheduled', created_at: D.today.toDate(),
  }});
  // Unused open slot, no team/truck attached yet — admin still needs to assign one
  const slotUnassignedFuture = await prisma.time_slots.create({ data: {
    date: D.future3.format('YYYY-MM-DD'), time_window_start: '15:00', time_window_end: '19:00',
    available_flag: true, slot_status: 'scheduled', created_at: D.today.toDate(),
  }});
  console.log('[seedDemo] 9 time slots created');

  // ── Lorry trips (only for slots that have actually departed) ───────────
  const tripPastCompleted = await prisma.lorry_trips.create({ data: {
    time_slot_id: slotPastCompleted.id, truck_id: truck1.id,
    delivery_team_id: deliveryTeamA.id,
    driver_id: driver1.id, assistant_id: assistant1.id, status: 'completed',
    started_at: atTime(D.past6, '09:00'), started_by: driver1.id,
    ended_at: atTime(D.past6, '13:20'), ended_by: driver1.id,
    created_at: atTime(D.past6, '09:00'), updated_at: atTime(D.past6, '13:20'),
  }});
  const tripPastDelivered = await prisma.lorry_trips.create({ data: {
    time_slot_id: slotPastDelivered.id, truck_id: truck2.id,
    delivery_team_id: deliveryTeamB.id,
    driver_id: driver2.id, assistant_id: assistant2.id, status: 'completed',
    started_at: atTime(D.past3, '14:00'), started_by: driver2.id,
    ended_at: atTime(D.past3, '17:45'), ended_by: driver2.id,
    created_at: atTime(D.past3, '14:00'), updated_at: atTime(D.past3, '17:45'),
  }});
  const tripTodayOut = await prisma.lorry_trips.create({ data: {
    time_slot_id: slotTodayOut.id, truck_id: truck1.id,
    delivery_team_id: deliveryTeamA.id,
    driver_id: driver1.id, assistant_id: assistant1.id, status: 'active',
    started_at: atTime(D.today, '09:00'), started_by: driver1.id,
    created_at: atTime(D.today, '09:00'), updated_at: atTime(D.today, '09:00'),
  }});
  console.log('[seedDemo] 3 lorry trips created');

  // ── Orders — the full lifecycle story ───────────────────────────────────

  // 1. Pending / unassigned — fresh from Odoo, not yet scheduled
  const order1 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1001', odoo_sales_ref: 'S00101',
    customer_id: custPriya.id, building_id: buildingCondoLift.id,
    order_status: 'Pending', assignment_status: 'unassigned',
    delivery_address: custPriya.address, delivery_city: custPriya.city,
    delivery_postcode: custPriya.postcode, delivery_state: custPriya.state,
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    created_at: D.today.subtract(1, 'day').toDate(), updated_at: D.today.subtract(1, 'day').toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order1.id, product_id: pWasher.id, quantity: 1, service_type: 'delivery_only',
  }});

  // 2. Scheduled — approved for a future slot
  const order2 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1002', odoo_sales_ref: 'S00102',
    customer_id: custTan.id, building_id: buildingLanded.id, employee_id: driver1.id,
    time_slot_id: slotFuture1.id, order_status: 'Scheduled', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.future3, '09:00'), scheduled_end_date_time: atTime(D.future3, '13:00'),
    delivery_address: custTan.address, delivery_city: custTan.city,
    delivery_postcode: custTan.postcode, delivery_state: custTan.state,
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    created_at: D.today.subtract(2, 'day').toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order2.id, product_id: pSofa.id, quantity: 1, service_type: 'delivery_only',
  }});

  // 3. Scheduled with installer required — has an installation_schedules row
  const order3 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1003', odoo_sales_ref: 'S00103',
    customer_id: custWong.id, building_id: buildingCondoLift.id, employee_id: driver2.id,
    time_slot_id: slotFuture2.id, order_status: 'Scheduled', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.future5, '10:00'), scheduled_end_date_time: atTime(D.future5, '14:00'),
    delivery_address: custWong.address, delivery_city: custWong.city,
    delivery_postcode: custWong.postcode, delivery_state: custWong.state,
    delivery_notes: custWong.preferred_delivery_notes,
    salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    created_at: D.today.subtract(2, 'day').toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order3.id, product_id: pAircond.id, quantity: 1, service_type: 'delivery_installation',
    custom_installation_time_min: 120, custom_installation_time_max: 180,
  }});
  await prisma.installation_schedules.create({ data: {
    order_id: order3.id, installation_team_id: installerTeam.id,
    estimated_arrival_time: atTime(D.future5, '10:30'), status: 'Scheduled',
  }});

  // 4. In transit right now — on tripTodayOut
  const order4 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1004', odoo_sales_ref: 'S00104',
    customer_id: custLee.id, building_id: buildingLanded.id, employee_id: driver1.id,
    time_slot_id: slotTodayOut.id, order_status: 'Delivering', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.today, '09:00'), scheduled_end_date_time: atTime(D.today, '13:00'),
    actual_start_date_time: atTime(D.today, '09:00'),
    delivery_address: custLee.address, delivery_city: custLee.city,
    delivery_postcode: custLee.postcode, delivery_state: custLee.state,
    truck_loading_sequence: 1, salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    notified_on_the_way_at: atTime(D.today, '08:55'),
    created_at: D.today.subtract(3, 'day').toDate(), updated_at: atTime(D.today, '09:00'),
  }});
  await prisma.order_products.create({ data: {
    order_id: order4.id, product_id: pFridge.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'pending', handling_status: 'loaded',
    loaded_at: atTime(D.today, '08:20'), loaded_by: assistant1.id, loaded_serial: 'FR-88213',
  }});

  // 5. Also on tripTodayOut — multi-line order, second stop
  const order5 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1005', odoo_sales_ref: 'S00105',
    customer_id: custCorp.id, building_id: buildingCommercial.id, employee_id: driver1.id,
    time_slot_id: slotTodayOut.id, order_status: 'Delivering', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.today, '09:00'), scheduled_end_date_time: atTime(D.today, '13:00'),
    actual_start_date_time: atTime(D.today, '09:00'),
    delivery_address: custCorp.address, delivery_city: custCorp.city,
    delivery_postcode: custCorp.postcode, delivery_state: custCorp.state,
    special_equipment_needed: buildingCommercial.special_equipment_needed,
    truck_loading_sequence: 2, salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    notified_on_the_way_at: atTime(D.today, '08:55'),
    created_at: D.today.subtract(3, 'day').toDate(), updated_at: atTime(D.today, '09:00'),
  }});
  await prisma.order_products.create({ data: {
    order_id: order5.id, product_id: pDining.id, quantity: 2, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'pending', handling_status: 'loaded',
    loaded_at: atTime(D.today, '08:25'), loaded_by: assistant1.id,
  }});
  await prisma.order_products.create({ data: {
    order_id: order5.id, product_id: pTvConsole.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'pending', handling_status: 'pending', // not loaded yet — still at warehouse
  }});

  // 6. Delivered successfully — POD, feedback, high rating
  const order6 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1006', odoo_sales_ref: 'S00106',
    customer_id: custWong.id, building_id: buildingCondoLift.id, employee_id: driver2.id,
    time_slot_id: slotPastDelivered.id, order_status: 'Delivered', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.past3, '14:00'), scheduled_end_date_time: atTime(D.past3, '18:00'),
    actual_start_date_time: atTime(D.past3, '14:10'), actual_arrival_date_time: atTime(D.past3, '15:05'),
    actual_end_date_time: atTime(D.past3, '15:25'),
    delivery_start_date_time: atTime(D.past3, '15:05'), delivery_end_date_time: atTime(D.past3, '15:25'),
    delivered_by: driver2.id, delivered_latitude: 3.1177, delivered_longitude: 101.6234,
    proof_of_delivery_url: '/uploads/demo/pod-demo-1006.jpg',
    customer_feedback: 'Fast and courteous delivery team, very satisfied!', customer_rating: 5,
    delivery_address: custWong.address, delivery_city: custWong.city,
    delivery_postcode: custWong.postcode, delivery_state: custWong.state,
    number_of_attempts: 1, salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    notified_on_the_way_at: atTime(D.past3, '13:55'), notified_d1_at: atTime(D.past3.subtract(1, 'day'), '19:00'),
    created_at: D.past6.toDate(), updated_at: atTime(D.past3, '15:25'),
  }});
  const order6Line = await prisma.order_products.create({ data: {
    order_id: order6.id, product_id: pMattress.id, quantity: 1, delivered_quantity: 1,
    service_type: 'delivery_only', item_delivery_status: 'delivered', handling_status: 'unloaded',
    loaded_at: atTime(D.past3, '13:10'), loaded_by: assistant2.id, loaded_serial: 'MT-55210',
    unloaded_at: atTime(D.past3, '15:20'), unloaded_by: assistant2.id, unloaded_serial: 'MT-55210',
  }});
  await prisma.rating.create({ data: {
    customer_id: custWong.id, order_id: order6.id, product_name: pMattress.product_name,
    driver_id: driver2.id, driver_name: driver2.name, delivery_date: D.past3.format('YYYY-MM-DD'),
    delivery_rating: 5, service_rating: 5, comment: 'Very professional, on time and careful with the item.',
    customer_signature: '/uploads/demo/signature-demo-1006.png', created_at: atTime(D.past3, '15:25'),
  }});

  // 7. Delivered but customer filed a complaint afterwards (resolved)
  const order7 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1007', odoo_sales_ref: 'S00107',
    customer_id: custTan.id, building_id: buildingLanded.id, employee_id: driver2.id,
    time_slot_id: slotPastDelivered.id, order_status: 'Delivered', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.past3, '14:00'), scheduled_end_date_time: atTime(D.past3, '18:00'),
    actual_start_date_time: atTime(D.past3, '15:30'), actual_arrival_date_time: atTime(D.past3, '16:40'),
    actual_end_date_time: atTime(D.past3, '17:00'),
    delivered_by: driver2.id, proof_of_delivery_url: '/uploads/demo/pod-demo-1007.jpg',
    customer_feedback: 'Delivered ok but one leg of the table has a scratch.', customer_rating: 3,
    delivery_address: custTan.address, delivery_city: custTan.city,
    delivery_postcode: custTan.postcode, delivery_state: custTan.state,
    number_of_attempts: 1, salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, is_complaint_submitted: true,
    created_at: D.past6.toDate(), updated_at: atTime(D.past3, '17:00'),
  }});
  await prisma.order_products.create({ data: {
    order_id: order7.id, product_id: pDining.id, quantity: 1, delivered_quantity: 1,
    service_type: 'delivery_only', item_delivery_status: 'delivered', handling_status: 'unloaded',
  }});
  await prisma.rating.create({ data: {
    customer_id: custTan.id, order_id: order7.id, product_name: pDining.product_name,
    driver_id: driver2.id, driver_name: driver2.name, delivery_date: D.past3.format('YYYY-MM-DD'),
    delivery_rating: 3, service_rating: 4, comment: 'Table arrived with a scratch on one leg.',
    created_at: atTime(D.past3, '17:00'),
  }});
  await prisma.complaint.create({ data: {
    customer_id: custTan.id, employee_id: dispatcher.id, employee_name: dispatcher.name, order_id: order7.id,
    product_name: pDining.product_name, delivery_date: D.past3.format('YYYY-MM-DD'),
    reason: 'Product damaged', status: 'resolved', is_submitted: true,
    content: 'Customer reports a visible scratch on one table leg after delivery. Replacement leg sent via courier and complaint closed.',
    date_reported: atTime(D.past3, '19:00'),
    media_product_installation: ['/uploads/demo/complaint-1007-photo1.jpg'],
    media_serial_number: [],
  }});

  // 8. Delivery failed — return pending pickup (not yet processed)
  const order8 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1008', odoo_sales_ref: 'S00108',
    customer_id: custNorain.id, building_id: buildingCondoNoLift.id, employee_id: driver1.id,
    time_slot_id: slotPastCompleted.id, order_status: 'Failed', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.past6, '09:00'), scheduled_end_date_time: atTime(D.past6, '13:00'),
    actual_start_date_time: atTime(D.past6, '09:10'), actual_arrival_date_time: atTime(D.past6, '10:30'),
    delivery_address: buildingCondoNoLift.address, delivery_city: 'Petaling Jaya',
    delivery_postcode: buildingCondoNoLift.postal_code, delivery_state: 'Selangor',
    number_of_attempts: 1, issue_status: 'open', issue_priority_level: 'Medium',
    issue_reason: 'Customer not around', issue_desc: 'No answer at unit and phone unreachable after 20 min wait.',
    issue_evidence: ['/uploads/demo/issue-1008-doorbell.jpg'], issue_reported_at: atTime(D.past6, '10:50'),
    salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, created_at: D.past6.subtract(1, 'day').toDate(), updated_at: atTime(D.past6, '10:50'),
  }});
  const order8Line = await prisma.order_products.create({ data: {
    order_id: order8.id, product_id: pWardrobe.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_installation', item_delivery_status: 'failed', handling_status: 'unloaded',
  }});
  const failure8 = await prisma.delivery_failure_events.create({ data: {
    order_id: order8.id, failure_reason: 'Customer not around',
    failure_desc: 'No answer at unit and phone unreachable after 20 min wait.',
    evidence_urls: ['/uploads/demo/issue-1008-doorbell.jpg'], confirmed_by: driver1.id,
    odoo_sync_status: 'pending', created_at: atTime(D.past6, '10:50'),
  }});

  // 9. Delivery failed — item damaged in transit, admin manually reset for rescheduling
  const order9 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1009', odoo_sales_ref: 'S00109',
    customer_id: custMuthu.id, building_id: buildingShoplot.id,
    order_status: 'Pending', assignment_status: 'unassigned', // reset in place by admin after failure
    delivery_address: buildingShoplot.address, delivery_city: 'Klang',
    delivery_postcode: buildingShoplot.postal_code, delivery_state: 'Selangor',
    number_of_attempts: 1, salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, created_at: D.past6.subtract(2, 'day').toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order9.id, product_id: pFridge.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'pending', handling_status: 'pending',
  }});
  const failure9 = await prisma.delivery_failure_events.create({ data: {
    order_id: order9.id, failure_reason: 'Item damaged in transit',
    failure_desc: 'Dent found on fridge door panel during unloading — refused by customer.',
    evidence_urls: ['/uploads/demo/issue-1009-dent1.jpg', '/uploads/demo/issue-1009-dent2.jpg'],
    confirmed_by: driver1.id, odoo_sync_status: 'synced', created_at: atTime(D.past6, '11:20'),
  }});

  // 10. Escalated / overdue — awaiting acknowledgement
  const order10 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1010', odoo_sales_ref: 'S00110',
    customer_id: custSiti.id, building_id: buildingGated.id, employee_id: driver2.id,
    time_slot_id: slotTodayLoading.id, order_status: 'Issue', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.today, '14:00'), scheduled_end_date_time: atTime(D.today, '18:00'),
    delivery_address: buildingGated.address, delivery_city: 'Shah Alam',
    delivery_postcode: buildingGated.postal_code, delivery_state: 'Selangor',
    issue_status: 'open', issue_priority_level: 'High', issue_reason: 'Vehicle breakdown en route',
    issue_desc: 'Truck WYY 5678 broke down on NKVE — mechanic dispatched, ETA delayed by 3+ hours.',
    issue_reported_at: D.today.subtract(2, 'hour').toDate(),
    is_escalation_acknowledged: false, overdue_reminder_sent_at: D.today.subtract(1, 'hour').toDate(),
    salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, created_at: D.today.subtract(2, 'day').toDate(), updated_at: D.today.subtract(1, 'hour').toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order10.id, product_id: pWasher.id, quantity: 1, service_type: 'delivery_only',
    handling_status: 'loaded', item_delivery_status: 'pending',
  }});

  // 11. Rescheduled — original order cancelled, points forward to order 12
  const order11 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1011', odoo_sales_ref: 'S00111',
    customer_id: custPriya.id, building_id: buildingCondoLift.id,
    order_status: 'Cancelled', assignment_status: 'unassigned',
    delivery_address: custPriya.address, delivery_city: custPriya.city,
    delivery_postcode: custPriya.postcode, delivery_state: custPriya.state,
    delivery_notes: 'Customer requested a later date — rescheduled, see linked order DEMO-DO-1012.',
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    created_at: D.today.subtract(4, 'day').toDate(), updated_at: D.today.subtract(1, 'day').toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order11.id, product_id: pTvConsole.id, quantity: 1, service_type: 'delivery_only',
  }});
  const order12 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1012', odoo_sales_ref: 'S00111-R1',
    customer_id: custPriya.id, building_id: buildingCondoLift.id,
    rescheduled_from_order_id: order11.id, time_slot_id: slotFuture3.id,
    order_status: 'Scheduled', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.future7, '13:00'), scheduled_end_date_time: atTime(D.future7, '17:00'),
    delivery_address: custPriya.address, delivery_city: custPriya.city,
    delivery_postcode: custPriya.postcode, delivery_state: custPriya.state,
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, created_at: D.today.subtract(1, 'day').toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order12.id, product_id: pTvConsole.id, quantity: 1, service_type: 'delivery_only',
  }});

  // 13. Cancelled outright — no reschedule
  const order13 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1013', odoo_sales_ref: 'S00113',
    customer_id: custMuthu.id, building_id: buildingShoplot.id,
    order_status: 'Cancelled', assignment_status: 'unassigned',
    delivery_address: buildingShoplot.address, delivery_city: 'Klang',
    delivery_postcode: buildingShoplot.postal_code, delivery_state: 'Selangor',
    delivery_notes: 'Customer cancelled order — found a cheaper alternative locally.',
    salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    created_at: D.today.subtract(5, 'day').toDate(), updated_at: D.today.subtract(4, 'day').toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order13.id, product_id: pSofa.id, quantity: 1, service_type: 'delivery_only',
  }});

  // 14. LLM-parsed driver remarks differ from the original address (A1.3 remark parser demo)
  const order14 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1014', odoo_sales_ref: 'S00114',
    customer_id: custLee.id, building_id: buildingLanded.id, employee_id: driver1.id,
    time_slot_id: slotFuture1.id, order_status: 'Scheduled', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.future3, '09:00'), scheduled_end_date_time: atTime(D.future3, '13:00'),
    original_delivery_address: custLee.address,
    delivery_address: custLee.address, delivery_city: custLee.city,
    delivery_postcode: custLee.postcode, delivery_state: custLee.state,
    remarks_contact_name: 'Lee Chong Wei (brother, Kevin, will receive)', remarks_contact_phone: '0169990001',
    remarks_delivery_address: 'Same address but use the side gate — main gate is under renovation',
    remarks_driver_notes: 'Gate code 4521. Call before arrival. Ask for Kevin, not the customer.',
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, created_at: D.today.toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order14.id, product_id: pWasher.id, quantity: 1, service_type: 'delivery_only',
  }});

  // 15. Delivered with a low rating, no complaint filed
  const order15 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1015', odoo_sales_ref: 'S00115',
    customer_id: custSiti.id, building_id: buildingGated.id, employee_id: driver1.id,
    time_slot_id: slotPastCompleted.id, order_status: 'Delivered', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.past6, '09:00'), scheduled_end_date_time: atTime(D.past6, '13:00'),
    actual_start_date_time: atTime(D.past6, '11:00'), actual_arrival_date_time: atTime(D.past6, '12:40'),
    actual_end_date_time: atTime(D.past6, '13:00'), delivered_by: driver1.id,
    proof_of_delivery_url: '/uploads/demo/pod-demo-1015.jpg',
    customer_feedback: 'Driver arrived very late, outside the promised window.', customer_rating: 2,
    delivery_address: buildingGated.address, delivery_city: 'Shah Alam',
    delivery_postcode: buildingGated.postal_code, delivery_state: 'Selangor',
    number_of_attempts: 1, salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, created_at: D.past6.subtract(1, 'day').toDate(), updated_at: atTime(D.past6, '13:00'),
  }});
  await prisma.order_products.create({ data: {
    order_id: order15.id, product_id: pMattress.id, quantity: 1, delivered_quantity: 1,
    service_type: 'delivery_only', item_delivery_status: 'delivered', handling_status: 'unloaded',
  }});
  await prisma.rating.create({ data: {
    customer_id: custSiti.id, order_id: order15.id, product_name: pMattress.product_name,
    driver_id: driver1.id, driver_name: driver1.name, delivery_date: D.past6.format('YYYY-MM-DD'),
    delivery_rating: 2, service_rating: 2, comment: 'Arrived almost 3 hours late with no update call.',
    created_at: atTime(D.past6, '13:00'),
  }});

  // 16. Scheduled for TODAY, still at the warehouse — Scan Station "Loading" tab:
  //     2 line items awaiting loading (order_status must be exactly 'Scheduled'
  //     and dated today for ScanStation's Loading tab to pick it up).
  const order16 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1016', odoo_sales_ref: 'S00116',
    customer_id: custNorain.id, building_id: buildingCondoNoLift.id, employee_id: driver1.id,
    time_slot_id: slotTodayDemoLoading.id, order_status: 'Scheduled', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.today, '14:00'), scheduled_end_date_time: atTime(D.today, '18:00'),
    delivery_address: buildingCondoNoLift.address, delivery_city: 'Petaling Jaya',
    delivery_postcode: buildingCondoNoLift.postal_code, delivery_state: 'Selangor',
    truck_loading_sequence: 1, salesperson_name: 'Amirul Hakim', salesperson_phone: '0173334444',
    dispatched_by: admin.id, notified_pending: true, notified_scheduled: true,
    created_at: D.today.subtract(1, 'day').toDate(), updated_at: D.today.toDate(),
  }});
  await prisma.order_products.create({ data: {
    order_id: order16.id, product_id: pWardrobe.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_installation', item_delivery_status: 'pending', handling_status: 'pending',
    assigned_serial: 'DEMO-SERIAL-1016-A', // exact serial required for this item
  }});
  await prisma.order_products.create({ data: {
    order_id: order16.id, product_id: pDining.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'pending', handling_status: 'pending',
    assigned_serial: 'DEMO-SERIAL-1016-B', // exact serial required for the second item
  }});

  // Guard the video-demo workflow against accidental reassignment in future
  // seed edits. A successful seed must leave DEMO-DO-1016 assigned to Razif.
  const verifiedOrder16 = await prisma.orders.findUnique({
    where: { id: order16.id },
    select: { employee_id: true },
  });
  if (verifiedOrder16?.employee_id !== driver1.id) {
    throw new Error('[seedDemo] DEMO-DO-1016 must be assigned to Razif');
  }
  console.log('[seedDemo]   DEMO-DO-1016 assigned to Razif (razif.driver@demo.tbm.local)');

  // 17. Delivery failed TODAY, mid-trip — Cases → Delivery Issues: item marked
  //     'failed' (order_status 'Failed', dated today).
  const order17 = await prisma.orders.create({ data: {
    odoo_order_ref: 'DEMO-DO-1017', odoo_sales_ref: 'S00117',
    customer_id: custMuthu.id, building_id: buildingShoplot.id, employee_id: driver1.id,
    time_slot_id: slotTodayOut.id, order_status: 'Failed', assignment_status: 'approved',
    scheduled_start_date_time: atTime(D.today, '09:00'), scheduled_end_date_time: atTime(D.today, '13:00'),
    actual_start_date_time: atTime(D.today, '09:00'), actual_arrival_date_time: atTime(D.today, '10:15'),
    delivery_address: buildingShoplot.address, delivery_city: 'Klang',
    delivery_postcode: buildingShoplot.postal_code, delivery_state: 'Selangor',
    truck_loading_sequence: 3, number_of_attempts: 1, issue_status: 'open', issue_priority_level: 'Medium',
    issue_reason: 'Wrong item delivered', issue_desc: 'Customer says the sofa colour delivered does not match the order — refused at doorstep.',
    issue_evidence: ['/uploads/demo/issue-1017-wrongcolor.jpg'], issue_reported_at: atTime(D.today, '10:20'),
    salesperson_name: 'Grace Tan', salesperson_phone: '0171112222',
    dispatched_by: admin.id, created_at: D.today.subtract(1, 'day').toDate(), updated_at: atTime(D.today, '10:20'),
  }});
  await prisma.order_products.create({ data: {
    order_id: order17.id, product_id: pSofa.id, quantity: 1, delivered_quantity: 0,
    service_type: 'delivery_only', item_delivery_status: 'failed', handling_status: 'unloaded',
  }});
  await prisma.delivery_failure_events.create({ data: {
    order_id: order17.id, failure_reason: 'Wrong item delivered',
    failure_desc: 'Customer says the sofa colour delivered does not match the order — refused at doorstep.',
    evidence_urls: ['/uploads/demo/issue-1017-wrongcolor.jpg'], confirmed_by: driver1.id,
    odoo_sync_status: 'pending', created_at: atTime(D.today, '10:20'),
  }});

  console.log('[seedDemo] 17 orders created spanning the full lifecycle');
  console.log('[seedDemo]   incl. Scan Station coverage for today: Loading (DEMO-DO-1016), Unloading (DEMO-DO-1004/1005), Audit (all of today\'s orders)');
  console.log('[seedDemo]   DEMO-DO-1016 serial test: DEMO-SERIAL-1016-A + DEMO-SERIAL-1016-B');

  // ── A general (non order-specific) complaint ────────────────────────────
  await prisma.complaint.create({ data: {
    customer_id: custNorain.id, product_name: pWardrobe.product_name,
    reason: 'Service quality', status: 'pending', is_submitted: true,
    content: 'General feedback: installer team was 40 minutes late for the appointment window.',
    date_reported: D.today.subtract(1, 'day').toDate(),
    media_product_installation: [], media_serial_number: [],
  }});

  // ── Employee issue reports (Report Issue feature) ───────────────────────
  await prisma.reports.createMany({ data: [
    { employee_id: driver1.id, content: 'Truck WXX 1234 AC not cooling properly, needs workshop check.', status: 'pending', created_at: D.today.subtract(1, 'day').toDate() },
    { employee_id: assistant1.id, content: 'Loading bay door sensor at KL-01 outlet is faulty — manual override needed.', status: 'resolved', created_at: D.past3.toDate() },
    { employee_id: driver2.id, content: 'GPS unit on truck WYY 5678 loses signal intermittently in Subang area.', status: 'pending', created_at: D.today.toDate() },
  ]});

  // ── Notifications ────────────────────────────────────────────────────────
  await prisma.notifications.createMany({ data: [
    { user_id: driver1.id, order_id: order2.id, type: 'info', message: 'New delivery assigned: DEMO-DO-1002 on ' + D.future3.format('D MMM YYYY'), is_read: false, created_at: D.today.toDate() },
    { user_id: admin.id, order_id: order10.id, type: 'warning', message: 'Order DEMO-DO-1010 overdue — vehicle breakdown reported, needs acknowledgement.', is_read: false, created_at: D.today.subtract(1, 'hour').toDate() },
    { user_id: dispatcher.id, order_id: order7.id, type: 'warning', message: 'New complaint filed for order DEMO-DO-1007.', is_read: true, created_at: atTime(D.past3, '19:05') },
    { user_id: driver1.id, order_id: order4.id, type: 'info', message: 'Trip departed — 2 stops on today’s 09:00 slot.', is_read: true, created_at: atTime(D.today, '09:00') },
  ]});

  // ── System settings & scheduler config ──────────────────────────────────
  await prisma.system_settings.createMany({ data: [
    { setting_key: 'failure_require_photo', setting_value: 'true', description: 'Require at least one evidence photo when confirming a delivery failure' },
    { setting_key: 'failure_require_remark', setting_value: 'true', description: 'Require a written remark when confirming a delivery failure' },
    { setting_key: 'whatsapp_admin_recipients', setting_value: JSON.stringify([admin.contact_number, dispatcher.contact_number]), description: 'Admin phone numbers notified on delivery failure' },
    { setting_key: 'whatsapp_admin_notification_enabled', setting_value: 'true', description: 'Send WhatsApp alerts to admins on delivery failure' },
  ]});
  await prisma.scheduler_config.create({ data: {
    warehouse_address: 'Lot 5, Jalan Teknologi 3/9, Kota Damansara', warehouse_postal: '47810',
    cron_expression: '0 0 * * *', enabled: true, last_run_at: D.today.subtract(1, 'day').toDate(),
  }});

  // ── Integration outbox (Odoo sync demo) ─────────────────────────────────
  await prisma.integration_outbox.createMany({ data: [
    {
      event_type: 'DELIVERY_FAILURE', target: 'odoo', payload: { order_id: order9.id, failure_event_id: failure9.id },
      idempotency_key: `order:${order9.id}:failure:${failure9.id}`, status: 'sent',
      attempts: 1, processed_at: atTime(D.past6, '11:22'), created_at: atTime(D.past6, '11:20'),
    },
    {
      event_type: 'DELIVERY_FAILURE', target: 'odoo', payload: { order_id: order8.id, failure_event_id: failure8.id },
      idempotency_key: `order:${order8.id}:failure:${failure8.id}`, status: 'pending',
      attempts: 0, next_retry_at: D.today.add(5, 'minute').toDate(), created_at: atTime(D.past6, '10:55'),
    },
  ]});

  // ── Misc completeness rows (chats, access_logs) ─────────────────────────
  await prisma.chats.create({ data: {
    order_number: order4.odoo_order_ref,
    members: [driver1.id, admin.id], names: { [driver1.id]: driver1.name, [admin.id]: admin.name },
    created_at: D.today.toDate(), last_message_at: D.today.toDate(),
  }});
  await prisma.access_logs.create({ data: {
    changed_at: D.today.subtract(1, 'day').toDate(),
    changes: { entity: 'orders', id: order10.id, field: 'issue_priority_level', from: 'Medium', to: 'High', changed_by: admin.id },
  }});

  console.log('\n=== Demo seed complete ===');
  console.log(`Login as admin:      ${admin.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as driver:     ${driver1.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as driver 2:   ${driver2.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as assistant:  ${assistant1.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as installer:  ${installerEmp.email} / ${DEMO_PASSWORD}`);
  console.log('\nOpen with:  set -a; source .env.demo; set +a && npx prisma studio');
  console.log('Or run the app against it:  DATABASE_URL="' + process.env.DATABASE_URL + '" npm run dev\n');
}

main()
  .catch((err) => {
    console.error('[seedDemo] Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
