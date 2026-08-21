// server/seedRouteTestData.js
//
// Seeds a ready-to-view route for the driver Route tab, without needing a
// real Google Maps key: 3 buildings get real KL-area coordinates directly
// (bypassing geocoding), and the time slot gets a hand-encoded polyline
// through them, so both the stop list and the embedded map render
// immediately. Run once: `node seedRouteTestData.js`.
//
// Reuses the existing test driver "Razif bin Ahmad" (from seedDriverTestData.js)
// and assigns orders to him directly via orders.employee_id, so no delivery
// team setup is required — GET /api/driver/route/:timeSlotId authorizes a
// driver via team OR direct order assignment.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRIVER_NAME  = 'Driver Tan';
const DRIVER_EMAIL = 'drivertan@gmail.com'; // phone 01172293772

// Real KL-area coordinates for a plausible 3-stop route near the default
// warehouse (University of Malaya, 3.1201, 101.6544).
const STOPS = [
  { building: 'PJ Seksyen 14 Test Stop', lat: 3.1073, lon: 101.6416, customer: 'Test Customer Route A', address: 'Jalan 14/1, Seksyen 14, Petaling Jaya', phone: '0123456701' },
  { building: 'Kelana Jaya Test Stop',   lat: 3.0738, lon: 101.5985, customer: 'Test Customer Route B', address: 'SS6, Kelana Jaya, Petaling Jaya',      phone: '0123456702' },
  { building: 'Subang Jaya Test Stop',   lat: 3.0567, lon: 101.5851, customer: 'Test Customer Route C', address: 'Jalan SS15/4, Subang Jaya',             phone: '0123456703' },
];
const WAREHOUSE = { lat: 3.1201, lon: 101.6544 };

// ── Google encoded-polyline algorithm (standard reference implementation) ──
function encodeNumber(num) {
  let output = '';
  while (num >= 0x20) {
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
}
function encodeSignedNumber(num) {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  return encodeNumber(sgn);
}
function encodePolyline(points) {
  let output = '';
  let prevLat = 0, prevLon = 0;
  for (const [lat, lon] of points) {
    const lat5 = Math.round(lat * 1e5);
    const lon5 = Math.round(lon * 1e5);
    output += encodeSignedNumber(lat5 - prevLat);
    output += encodeSignedNumber(lon5 - prevLon);
    prevLat = lat5;
    prevLon = lon5;
  }
  return output;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function todayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

async function main() {
  console.log('=== Seeding Route tab test data ===\n');

  // 1. Find the existing test driver — match name + email together since
  // contact_number is not unique in this dataset (several "Tan" test
  // employees share the same phone number across roles).
  const driver = await prisma.employees.findFirst({
    where: { name: DRIVER_NAME, email: DRIVER_EMAIL, active_flag: true },
  });
  if (!driver) {
    throw new Error(
      `Driver "${DRIVER_NAME}" <${DRIVER_EMAIL}> not found. Check the employees table, or edit DRIVER_NAME/DRIVER_EMAIL in this script.`
    );
  }
  console.log(`Driver: ${driver.name} <${driver.email}> (${driver.id})`);

  // 2. Time slot for today, 08:00-12:00
  const date = todayDateKey();
  let timeslot = await prisma.time_slots.findFirst({
    where: { date, time_window_start: '08:00', time_window_end: '12:00' },
  });
  if (!timeslot) {
    timeslot = await prisma.time_slots.create({
      data: {
        date,
        time_window_start: '08:00',
        time_window_end:   '12:00',
        available_flag:    true,
        slot_status:        'scheduled',
        created_at:         new Date(),
      },
    });
    console.log(`Created time slot ${timeslot.id} for ${date} 08:00-12:00`);
  } else {
    console.log(`Reusing existing time slot ${timeslot.id} for ${date} 08:00-12:00`);
  }

  // 3. Buildings with real coordinates (upsert by name so re-running is safe)
  const buildingIds = [];
  for (const stop of STOPS) {
    let building = await prisma.buildings.findFirst({ where: { building_name: stop.building } });
    if (!building) {
      building = await prisma.buildings.create({
        data: {
          building_name:            stop.building,
          housing_type:             'Residential',
          latitude:                 stop.lat,
          longitude:                stop.lon,
          access_time_window_start: '08:00',
          access_time_window_end:   '20:00',
          created_at:               new Date(),
        },
      });
      console.log(`Created building "${stop.building}" (${stop.lat}, ${stop.lon})`);
    } else if (building.latitude == null) {
      building = await prisma.buildings.update({
        where: { id: building.id },
        data:  { latitude: stop.lat, longitude: stop.lon },
      });
      console.log(`Backfilled coordinates for existing building "${stop.building}"`);
    } else {
      console.log(`Reusing building "${stop.building}"`);
    }
    buildingIds.push(building.id);
  }

  // 4. Customers (one per stop, upsert by phone)
  const customerIds = [];
  for (const stop of STOPS) {
    let customer = await prisma.customers.findFirst({ where: { phone: stop.phone } });
    if (!customer) {
      customer = await prisma.customers.create({
        data: {
          full_name:  stop.customer,
          phone:      stop.phone,
          address:    stop.address,
          created_at: new Date(),
        },
      });
      console.log(`Created customer "${stop.customer}"`);
    } else {
      console.log(`Reusing customer "${stop.customer}"`);
    }
    customerIds.push(customer.id);
  }

  // 5. A product to attach as one line item per order
  const product = await prisma.products.findFirst();
  if (!product) throw new Error('No products found — seed at least one product first.');

  // 6. Orders — visiting order is STOPS[0] -> [1] -> [2]; loading sequence
  //    is the reverse (last delivery loaded first), matching Route Optimisation's
  //    convention (see googleRoutingService.js assignLoadingSequence).
  const now = new Date();
  const baseTime = new Date(`${date}T08:00:00`);
  const legMinutes = [20, 15, 12]; // warehouse->stop1, stop1->stop2, stop2->stop3
  const serviceMinutes = 15;

  let cursor = new Date(baseTime);
  const orderIds = [];

  for (let i = 0; i < STOPS.length; i++) {
    cursor = new Date(cursor.getTime() + legMinutes[i] * 60000);
    const start = new Date(cursor);
    const end   = new Date(cursor.getTime() + serviceMinutes * 60000);
    cursor = end;

    const odooRef = `WH/OUT/ROUTE-TEST-${i + 1}`;
    let order = await prisma.orders.findFirst({ where: { odoo_order_ref: odooRef } });

    const orderData = {
      customer_id:               customerIds[i],
      building_id:                buildingIds[i],
      employee_id:                driver.id,
      order_status:               'Scheduled',
      odoo_order_ref:              odooRef,
      time_slot_id:                timeslot.id,
      scheduled_start_date_time:   start,
      scheduled_end_date_time:     end,
      truck_loading_sequence:      STOPS.length - i, // stop1=3, stop2=2, stop3=1
      delivery_address:            STOPS[i].address,
      assignment_status:           'approved',
      updated_at:                  now,
    };

    if (order) {
      order = await prisma.orders.update({ where: { id: order.id }, data: orderData });
      console.log(`Updated order ${odooRef} (${order.id})`);
    } else {
      order = await prisma.orders.create({ data: { ...orderData, created_at: now } });
      console.log(`Created order ${odooRef} (${order.id})`);

      await prisma.order_products.create({
        data: {
          order_id:            order.id,
          product_id:          product.id,
          quantity:            1,
          service_type:        'delivery',
          picking_status:      'pending',
          item_delivery_status: 'pending',
        },
      });
    }
    orderIds.push(order.id);
  }

  // 7. Route geometry on the time slot — hand-encoded polyline through
  //    warehouse -> stop1 -> stop2 -> stop3, with distance/duration derived
  //    from the same Haversine + road-factor estimate googleRoutingService.js
  //    uses for its fallback, so the numbers are internally consistent.
  const path = [WAREHOUSE, ...STOPS].map(p => [p.lat, p.lon]);
  const polyline = encodePolyline(path);

  let totalKm = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalKm += haversineKm(
      { lat: path[i][0], lon: path[i][1] },
      { lat: path[i + 1][0], lon: path[i + 1][1] }
    ) * 1.4; // road-winding factor, matches googleRoutingService fallback
  }
  const totalDurationSec = Math.round((totalKm / 30) * 3600); // 30 km/h conservative urban estimate

  await prisma.time_slots.update({
    where: { id: timeslot.id },
    data: {
      route_polyline:    polyline,
      route_distance_m:  Math.round(totalKm * 1000),
      route_duration_s:  totalDurationSec,
      route_computed_at: new Date(),
    },
  });

  console.log(`\nRoute geometry saved: ${totalKm.toFixed(1)} km, ${Math.round(totalDurationSec / 60)} min, polyline length ${polyline.length} chars`);

  console.log('\n=== Done ===');
  console.log(`Log in as driver "${driver.name}" <${driver.email}> and open the Route tab.`);
  console.log(`Time slot: ${date} 08:00-12:00 (id ${timeslot.id})`);
  console.log(`Orders: ${orderIds.join(', ')}`);
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
