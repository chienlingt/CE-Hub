// Hand-written entity fixtures, in the API's snake_case shape so the mock path
// runs through the same normalizeSnapshot the live path will.
//
// Mirrors server/seedDemo.js where it exists (the first three lorry plates, the
// product catalogue, the Klang Valley building spread) so the data reads as
// familiar, and follows docs/Meeting_Outcomes.md for the fleet: Mr Lee
// confirmed 8 x 3-ton and 13 x 1-ton.

// --- Zones: the Klang Valley spread the cluster story needs ------------------
export const ZONES = [
  { id: 'z-pj',  zone_name: 'Petaling Jaya' },
  { id: 'z-klg', zone_name: 'Klang' },
  { id: 'z-sa',  zone_name: 'Shah Alam' },
  { id: 'z-chr', zone_name: 'Cheras' },
];

// --- Products: 8, with weights the real DB does not have yet -----------------
// weight_kg and max_payload_kg are mock-only until the Phase-3 migration. They
// are real figures, not derived from volume — a fabricated kilogram is worse
// than none, because a warehouse lead spots it instantly.
export const PRODUCTS = [
  {
    id: 'p-tv65', product_name: 'LED TV 65"',
    package_length_cm: 150, package_width_cm: 25, package_height_cm: 95, weight_kg: 28,
    installer_team_required_flag: true, estimated_installation_time_min: 120,
    estimated_installation_time_max: 180, fragile_flag: true,
  },
  {
    id: 'p-tv43', product_name: 'LED TV 43"',
    package_length_cm: 105, package_width_cm: 18, package_height_cm: 68, weight_kg: 12,
    installer_team_required_flag: false,
  },
  {
    id: 'p-washer', product_name: 'Front Load Washer 9kg',
    package_length_cm: 68, package_width_cm: 70, package_height_cm: 90, weight_kg: 74,
    installer_team_required_flag: true, estimated_installation_time_min: 80,
    estimated_installation_time_max: 100, dismantle_time: 25, dismantle_required_flag: true,
  },
  {
    id: 'p-dryer', product_name: 'Condenser Dryer 8kg',
    package_length_cm: 66, package_width_cm: 68, package_height_cm: 88, weight_kg: 52,
    installer_team_required_flag: true, estimated_installation_time_min: 45,
    estimated_installation_time_max: 60,
  },
  {
    id: 'p-fridge', product_name: '2-Door Refrigerator 410L',
    package_length_cm: 78, package_width_cm: 82, package_height_cm: 185, weight_kg: 96,
    installer_team_required_flag: false, estimated_installation_time_min: 50,
    estimated_installation_time_max: 70, no_lie_down_flag: true,
  },
  {
    id: 'p-aircon', product_name: 'Air Conditioner 1.5HP',
    package_length_cm: 95, package_width_cm: 40, package_height_cm: 35, weight_kg: 34,
    installer_team_required_flag: true, estimated_installation_time_min: 90,
    estimated_installation_time_max: 150,
  },
  {
    id: 'p-microwave', product_name: 'Microwave Oven 25L',
    package_length_cm: 55, package_width_cm: 45, package_height_cm: 38, weight_kg: 15,
    installer_team_required_flag: false,
  },
  {
    id: 'p-sofa', product_name: '3-Seater Fabric Sofa',
    package_length_cm: 230, package_width_cm: 105, package_height_cm: 92, weight_kg: 68,
    installer_team_required_flag: false, dismantle_time: 20,
  },
];

// --- Buildings: 14, with real access windows and permit flags ----------------
export const BUILDINGS = [
  {
    id: 'b-01', building_name: 'Taman Megah Terrace', zone_id: 'z-pj', housing_type: 'Terrace',
    address: 'Jalan SS24/2, Taman Megah', postal_code: '47301',
    latitude: '3.11920000', longitude: '101.60810000',
  },
  {
    id: 'b-02', building_name: 'Sri Puteri Condominium', zone_id: 'z-pj', housing_type: 'Condominium',
    address: 'Jalan 222, Seksyen 51A', postal_code: '46100',
    access_time_window_start: '10:00', access_time_window_end: '16:00',
    pre_registration_required: true, lift_available: true, loading_bay_available: true,
    vehicle_size_limit: '3 ton max, basement clearance 2.1m',
    latitude: '3.10730000', longitude: '101.63120000',
  },
  {
    id: 'b-03', building_name: 'Menara Dayabumi Serviced Suites', zone_id: 'z-pj', housing_type: 'Serviced apartment',
    address: 'Jalan Barat, Seksyen 52', postal_code: '46200',
    access_time_window_start: '09:00', access_time_window_end: '17:00',
    pre_registration_required: true, lift_available: true,
    latitude: '3.10290000', longitude: '101.64400000',
  },
  {
    id: 'b-04', building_name: 'Damansara Uptown Residence', zone_id: 'z-pj', housing_type: 'Condominium',
    address: 'Jalan SS21/39, Damansara Utama', postal_code: '47400',
    access_time_window_start: '10:00', access_time_window_end: '15:00',
    lift_available: true, vehicle_size_limit: '1 ton only',
    latitude: '3.13480000', longitude: '101.62290000',
  },
  {
    id: 'b-05', building_name: 'Bandar Botanic Link House', zone_id: 'z-klg', housing_type: 'Link house',
    address: 'Jalan Botanic 7/2, Bandar Botanic', postal_code: '41200',
    latitude: '3.02210000', longitude: '101.43340000',
  },
  {
    id: 'b-06', building_name: 'Bukit Tinggi Apartment', zone_id: 'z-klg', housing_type: 'Apartment',
    address: 'Jalan Batu Nilam 3, Bandar Bukit Tinggi', postal_code: '41200',
    access_time_window_start: '09:00', access_time_window_end: '18:00',
    lift_available: false,
    latitude: '3.02860000', longitude: '101.45530000',
  },
  {
    id: 'b-07', building_name: 'Klang Sentral Walk-up', zone_id: 'z-klg', housing_type: 'Walk-up flat',
    address: 'Jalan Meru, Klang Sentral', postal_code: '41050',
    lift_available: false, parking_distance: '80m',
    latitude: '3.07750000', longitude: '101.44200000',
  },
  {
    id: 'b-08', building_name: 'Setia Alam Eco Terrace', zone_id: 'z-sa', housing_type: 'Terrace',
    address: 'Jalan Setia Prima, Setia Alam', postal_code: '40170',
    latitude: '3.09940000', longitude: '101.45220000',
  },
  {
    id: 'b-09', building_name: 'Pusat Bandar Shah Alam Flats', zone_id: 'z-sa', housing_type: 'Flat',
    address: 'Persiaran Damai, Seksyen 11', postal_code: '40100',
    access_time_window_start: '08:00', access_time_window_end: '12:00',
    lift_available: false,
    latitude: '3.07380000', longitude: '101.51830000',
  },
  {
    id: 'b-10', building_name: 'i-City Serviced Residence', zone_id: 'z-sa', housing_type: 'Serviced apartment',
    address: 'Jalan Multimedia, Seksyen 7', postal_code: '40000',
    access_time_window_start: '11:00', access_time_window_end: '19:00',
    pre_registration_required: true, lift_available: true,
    vehicle_size_limit: 'Basement 2.0m clearance',
    latitude: '3.06470000', longitude: '101.49190000',
  },
  {
    id: 'b-11', building_name: 'Taman Maluri Shoplot', zone_id: 'z-chr', housing_type: 'Shoplot',
    address: 'Jalan Jejaka, Taman Maluri', postal_code: '55100',
    access_time_window_start: '10:00', access_time_window_end: '18:00',
    latitude: '3.12440000', longitude: '101.73160000',
  },
  {
    id: 'b-12', building_name: 'Cheras Vista Apartment', zone_id: 'z-chr', housing_type: 'Apartment',
    address: 'Jalan Cheras Vista, Bandar Tun Razak', postal_code: '56000',
    lift_available: true,
    latitude: '3.08020000', longitude: '101.73940000',
  },
  {
    id: 'b-13', building_name: 'Sunway Velocity Tower', zone_id: 'z-chr', housing_type: 'Condominium',
    address: 'Lingkaran SV, Cheras', postal_code: '55100',
    access_time_window_start: '10:00', access_time_window_end: '16:00',
    pre_registration_required: true, lift_available: true,
    vehicle_size_limit: 'No lorries above 2.3m',
    latitude: '3.12990000', longitude: '101.72260000',
  },
  {
    id: 'b-14', building_name: 'Alam Damai Bungalow', zone_id: 'z-chr', housing_type: 'Bungalow',
    address: 'Jalan Damai Impian, Alam Damai', postal_code: '56000',
    latitude: '3.06190000', longitude: '101.74670000',
  },
];

// --- Fleet: 8 x 3-ton + 13 x 1-ton, per Meeting_Outcomes.md §4 ---------------
// The first two plates match seedDemo.js so they are recognisable in the demo.
function truck(id, plate, tone) {
  const spec = tone === 3
    ? { length_cm: 420, width_cm: 190, height_cm: 200, max_payload_kg: 3000 }
    : { length_cm: 280, width_cm: 160, height_cm: 170, max_payload_kg: 1000 };
  return { id, plate_no: plate, tone, ...spec };
}

export const TRUCKS = [
  { ...truck('tk-01', 'WXX 1234', 3) },
  { ...truck('tk-02', 'WYY 5678', 1) },
  { ...truck('tk-03', 'WAB 2201', 3) },
  { ...truck('tk-04', 'WAB 2202', 3) },
  { ...truck('tk-05', 'WAB 2203', 3) },
  { ...truck('tk-06', 'WAB 2204', 3) },
  { ...truck('tk-07', 'WAB 2205', 3), off_day: 'Sunday' },
  { ...truck('tk-08', 'WAB 2206', 3) },
  { ...truck('tk-09', 'WAB 2207', 3) },
  { ...truck('tk-10', 'WCD 3302', 1) },
  { ...truck('tk-11', 'WCD 3303', 1) },
  { ...truck('tk-12', 'WCD 3304', 1) },
  { ...truck('tk-13', 'WCD 3305', 1), off_day: 'Wednesday' },
  { ...truck('tk-14', 'WCD 3306', 1) },
  { ...truck('tk-15', 'WCD 3307', 1) },
  { ...truck('tk-16', 'WCD 3308', 1) },
  { ...truck('tk-17', 'WCD 3309', 1) },
  { ...truck('tk-18', 'WCD 3310', 1) },
  { ...truck('tk-19', 'WCD 3311', 1) },
  { ...truck('tk-20', 'WCD 3312', 1) },
  { ...truck('tk-21', 'WCD 3313', 1) },
];

// --- Crews -------------------------------------------------------------------
// Installer capability is inferred from role name, which is how
// server/services/scheduler.js:499 already does it.
export const EMPLOYEES = [
  { id: 'e-01', name: 'Razif Hamzah',    role: { name: 'Delivery Team' }, contact_number: '012-3330101' },
  { id: 'e-02', name: 'Suresh Kumar',    role: { name: 'Installer' },     contact_number: '012-3330102' },
  { id: 'e-03', name: 'Ah Meng Tan',     role: { name: 'Delivery Team' }, contact_number: '012-3330103' },
  { id: 'e-04', name: 'Faizal Rahman',   role: { name: 'Installer' },     contact_number: '012-3330104' },
  { id: 'e-05', name: 'Devan Pillai',    role: { name: 'Delivery Team' }, contact_number: '012-3330105' },
  { id: 'e-06', name: 'Wei Jie Lim',     role: { name: 'Delivery Team' }, contact_number: '012-3330106' },
  { id: 'e-07', name: 'Haziq Idris',     role: { name: 'Installer' },     contact_number: '012-3330107' },
  { id: 'e-08', name: 'Kumaran Raj',     role: { name: 'Delivery Team' }, contact_number: '012-3330108' },
  { id: 'e-09', name: 'Syafiq Noor',     role: { name: 'Delivery Team' }, contact_number: '012-3330109' },
  { id: 'e-10', name: 'Boon Hock Chee',  role: { name: 'Installer' },     contact_number: '012-3330110' },
  { id: 'e-11', name: 'Arif Zulkifli',   role: { name: 'Delivery Team' }, contact_number: '012-3330111' },
  { id: 'e-12', name: 'Jason Yap',       role: { name: 'Delivery Team' }, contact_number: '012-3330112' },
  { id: 'e-13', name: 'Mohan Das',       role: { name: 'Installer' },     contact_number: '012-3330113' },
  { id: 'e-14', name: 'Chong Wei Seng',  role: { name: 'Delivery Team' }, contact_number: '012-3330114' },
  // Crews for the rest of the fleet, so every lorry but one has a paired team.
  ...[
    'Azman Yusof', 'Lee Kok Wai', 'Ravi Shankar', 'Hafizul Amin', 'Tan Boon Kiat',
    'Nizam Salleh', 'Gopal Naidu', 'Ong Chee Hin', 'Rizal Hashim', 'Vijay Kumar',
    'Khairul Anuar', 'Teoh Wei Ming', 'Saiful Bahri', 'Prakash Rao', 'Liew Ah Kow',
    'Amirul Hakim', 'Yap Kian Seng', 'Murali Dharan', 'Zamri Osman', 'Ng Chun Hoe',
    'Fadzli Ramli', 'Sim Teck Leong', 'Hisham Kamal', 'Selvam Raju', 'Chan Wai Kit',
    'Ikhwan Latif',
  ].map((name, i) => ({
    id: `e-${String(i + 15).padStart(2, '0')}`,
    name,
    // Every third extra crew member is an installer, so installer-capable and
    // delivery-only teams are both present across the fleet.
    role: { name: i % 3 === 1 ? 'Installer' : 'Delivery Team' },
    contact_number: `012-3330${String(i + 15).padStart(3, '0')}`,
  })),
];

// One team per lorry. The pairing (teams.truck_id) is set on the Information
// panel and is what the Board shows. Team A/C/E/G carry an installer; B/D/F do
// not — so the installer-skill constraint has something real to fail against.
// Team G is unavailable, and tk-21 has no team at all, so both "no crew"
// states appear in the demo.
const BASE_TEAMS = [
  { id: 'tm-a', team_type: 'Delivery Team A', available_flag: true, primary_driver_id: 'e-01', assistant_driver_id: 'e-02', truck_id: 'tk-01' },
  { id: 'tm-b', team_type: 'Delivery Team B', available_flag: true, primary_driver_id: 'e-03', assistant_driver_id: 'e-05', truck_id: 'tk-02' },
  { id: 'tm-c', team_type: 'Delivery Team C', available_flag: true, primary_driver_id: 'e-06', assistant_driver_id: 'e-04', truck_id: 'tk-03' },
  { id: 'tm-d', team_type: 'Delivery Team D', available_flag: true, primary_driver_id: 'e-08', assistant_driver_id: 'e-09', truck_id: 'tk-04' },
  { id: 'tm-e', team_type: 'Delivery Team E', available_flag: true, primary_driver_id: 'e-11', assistant_driver_id: 'e-07', truck_id: 'tk-05' },
  { id: 'tm-f', team_type: 'Delivery Team F', available_flag: true, primary_driver_id: 'e-12', assistant_driver_id: 'e-14', truck_id: 'tk-06' },
  { id: 'tm-g', team_type: 'Delivery Team G', available_flag: false, primary_driver_id: 'e-13', assistant_driver_id: 'e-10', truck_id: 'tk-08' },
];

const EXTRA_TEAM_TRUCKS = [
  'tk-07', 'tk-09', 'tk-10', 'tk-11', 'tk-12', 'tk-13', 'tk-14',
  'tk-15', 'tk-16', 'tk-17', 'tk-18', 'tk-19', 'tk-20',
];

export const TEAMS = [
  ...BASE_TEAMS,
  ...EXTRA_TEAM_TRUCKS.map((truckId, i) => ({
    id: `tm-${String.fromCharCode(104 + i)}`,                 // tm-h, tm-i, ...
    team_type: `Delivery Team ${String.fromCharCode(72 + i)}`,
    available_flag: true,
    primary_driver_id: `e-${String(15 + i * 2).padStart(2, '0')}`,
    assistant_driver_id: `e-${String(16 + i * 2).padStart(2, '0')}`,
    truck_id: truckId,
  })),
];

export const EMPLOYEE_TEAM_ASSIGNMENTS = TEAMS.flatMap(t => [
  { employee_id: t.primary_driver_id, team_id: t.id },
  { employee_id: t.assistant_driver_id, team_id: t.id },
]);

// --- Customers ---------------------------------------------------------------
const CUSTOMER_NAMES = [
  'Nurul Aina Binti Hassan', 'Lim Chee Keong', 'Rajesh Subramaniam', 'Siti Khadijah Omar',
  'Tan Mei Ling', 'Mohd Hafiz Abdullah', 'Priya Nair', 'Wong Kar Wai',
  'Zulaikha Ismail', 'Ganesh Murugan', 'Chong Li Wei', 'Aisyah Rahim',
  'Vincent Loh', 'Kamala Devi', 'Shahrul Nizam', 'Goh Beng Hock',
  'Farah Diana Yusof', 'Anand Krishnan', 'Lee Siew Mei', 'Hakim Jamaluddin',
];

export const CUSTOMERS = CUSTOMER_NAMES.map((name, i) => ({
  id: `c-${String(i + 1).padStart(2, '0')}`,
  full_name: name,
  phone: `01${(i % 9) + 1}-${String(2000000 + i * 7919).slice(0, 7)}`,
}));

export const SALESPEOPLE = [
  'Adeline Soh', 'Marcus Teh', 'Rohana Jalil', 'Danny Koh', 'Shalini Menon',
];
