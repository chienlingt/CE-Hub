const scanFields = ['handling_status', 'assigned_serial', 'loaded_serial', 'loaded_at', 'loaded_by', 'unloaded_serial', 'unloaded_at', 'unloaded_by'];

function unitsFor(item) {
  const quantity = Math.max(1, item.quantity || 1);
  return Array.from({ length: quantity }, (_, index) => {
    const saved = Array.isArray(item.unit_scans) ? item.unit_scans[index] : null;
    if (saved) return { ...saved };
    return Object.fromEntries(scanFields.map(field => [field,
      field === 'handling_status' ? (Array.isArray(item.unit_scans) ? 'pending' : item.handling_status || 'pending')
        : field === 'assigned_serial' && item.assigned_serials?.length ? item.assigned_serials[index] || null
        : field.endsWith('_serial') && index > 0 ? null
        : item[field] instanceof Date ? item[field].toISOString() : item[field] ?? null,
    ]));
  });
}

function expandUnits(item) {
  return unitsFor(item).map((unit, index) => ({
    ...item, ...unit, unit_scans: undefined,
    id: (item.quantity || 1) > 1 ? `${item.id}:${index + 1}` : item.id,
    order_product_id: item.id, unit_number: index + 1, quantity: 1,
  }));
}

function summarizeUnits(units) {
  const allUnloaded = units.every(unit => unit.handling_status === 'unloaded');
  const allLoaded = units.every(unit => ['loaded', 'unloaded'].includes(unit.handling_status));
  return {
    unit_scans: units,
    handling_status: allUnloaded ? 'unloaded' : allLoaded ? 'loaded' : 'pending',
    ...Object.fromEntries(scanFields.filter(field => field !== 'handling_status').map(field => [field, units[0][field] ?? null])),
  };
}

module.exports = { unitsFor, expandUnits, summarizeUnits };
