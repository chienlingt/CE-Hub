// Suggested outcomes only: every scenario is seeded Scheduled / pending.
module.exports = [
  { ref: 'DEMO-DO-1020', slot: 'morning', sequence: 1, customer: 'lee', building: 'landed', products: ['fridge', 'fridge', 'fridge'], test: 'Three identical items with separate serials; unload all three and complete with POD. Alt: unload all three, flip one to Not delivered – Damaged, and complete as a partial delivery.' },
  { ref: 'DEMO-DO-1021', slot: 'morning', sequence: 2, customer: 'tan', building: 'landed', products: ['washer'], test: 'Full failure: customer unavailable. Leave item loaded and confirm Failed with a reason.' },
  { ref: 'DEMO-DO-1022', slot: 'afternoon', sequence: 2, customer: 'wong', building: 'condo', products: ['fridge', 'washer'], test: 'Partial delivery: unload fridge only; Update → Delivered, give a reason for the washer, add POD; order ends Delivered (partial) with the washer undelivered.' },
  { ref: 'DEMO-DO-1023', slot: 'night', sequence: 1, customer: 'siti', building: 'gated', products: ['mattress'], test: 'Single-item success: unload item, then complete with photo or signature POD.' },
  { ref: 'DEMO-DO-1024', slot: 'night', sequence: 2, customer: 'muthu', building: 'shoplot', products: ['tvConsole', 'tvConsole'], test: 'Two identical items: test duplicate scan, then full failure with both item outcomes failed.' },
];
