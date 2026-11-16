// server/seedItemPoints.js
//
// Dummy items for Information > Item: an item name and its points per item.
//
// Additive and re-runnable: it adds items that are missing and updates the rate
// of listed items that exist. It never deletes anything or touches any other
// table. Requires migration 20261116010000_item_point_rates.
//
//   node seedItemPoints.js            dry run (default): shows what would change
//   node seedItemPoints.js --apply    write the items
//
// Uses DATABASE_URL from server/.env (the sandbox) like the other seed scripts.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const prisma = require('./prismaClient');
const { itemKey } = require('./services/incentiveService');

const ITEMS = [
  { name: 'NOVA 3-Seater L-Shape Sofa', rate: 8 },
  { name: 'NOVA 6-Seater Dining Set', rate: 8 },
  { name: 'NOVA TV Console 1.8m', rate: 3 },
  { name: 'Samsung 380L Top Freezer Fridge', rate: 6 },
  { name: 'Samsung 65" QLED Smart TV', rate: 5 },
  { name: 'LG 9kg Front Load Washer', rate: 6 },
  { name: 'Panasonic 7kg Heat Pump Dryer', rate: 5 },
  { name: 'Daikin 1.5HP Inverter Aircond', rate: 10 },
  { name: 'Restonic Comfort Queen Mattress', rate: 4 },
  { name: '4-Door Sliding Wardrobe', rate: 8 },
  { name: 'Queen Bed Frame', rate: 4 },
  { name: 'Bedside Table', rate: 2 },
  { name: 'Curtain Rail Set', rate: 1 },
  // Unreviewed: 0 points, highlighted for admin review (as if found on a new order).
  { name: 'Samsung 55" Crystal UHD TV', rate: 0, review: true },
  { name: 'Electrolux 8kg Heat Pump Dryer', rate: 0, review: true },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const host = (() => { try { const url = new URL(process.env.DATABASE_URL); return `${url.hostname}${url.pathname}`; } catch { return 'unknown database'; } })();
  console.log(`Target: ${host}${apply ? '' : '  (dry run)'}`);

  const rows = await prisma.item_point_rates.findMany();
  const existing = new Map(rows.map(row => [row.item_key, row.points_per_item]));
  let added = 0, changed = 0;
  for (const item of ITEMS) {
    const key = itemKey(item.name);
    const state = !existing.has(key) ? 'new' : (!item.review && existing.get(key) !== item.rate) ? 'changed' : 'unchanged';
    if (state === 'new') added += 1;
    if (state === 'changed') changed += 1;
    console.log(`${state.padEnd(9)} ${String(item.rate).padStart(3)}  ${item.name}${item.review ? '  (needs review)' : ''}`);
    if (apply && state !== 'unchanged') await prisma.item_point_rates.upsert({
      where: { item_key: key },
      create: { item_key: key, item_name: item.name, points_per_item: item.rate, needs_review: !!item.review },
      // Never overwrite an admin's work: unreviewed demo items are only ever created.
      update: { points_per_item: item.rate },
    });
  }
  console.log(`${apply ? 'Done' : 'Would add'}: ${added} new item(s), ${changed} changed rate(s).`);
  if (!apply) console.log('Dry run: nothing written. Re-run with --apply.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
