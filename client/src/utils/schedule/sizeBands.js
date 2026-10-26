import { truckVolumeCm3 } from './capacityRules';

// Rough order sizes for "Find a slot". CE Hub holds no item master data, so a
// salesperson picks a band instead of typing dimensions. Bands come from the
// fleet itself, so there is no separate table to keep in step:
//   small  — up to a quarter of the smallest lorry's cargo volume
//   medium — more than that, still fits the smallest lorry
//   large  — needs a lorry bigger than the smallest
// `maxCm3` is the volume the recommender should assume for the band (null =
// "larger than the smallest lorry"; the recommender treats it as needing the
// next lorry size up).

const M3 = 1_000_000;
const fmtM3 = cm3 => `${(cm3 / M3).toFixed(1)} m³`;

export function sizeBands(trucks = []) {
  const volumes = trucks.map(truckVolumeCm3).filter(v => Number.isFinite(v) && v > 0);
  const smallest = volumes.length ? Math.min(...volumes) : null;
  if (!smallest) {
    return [
      { key: 'small', label: 'Small', maxCm3: null, hint: 'One or two items' },
      { key: 'medium', label: 'Medium', maxCm3: null, hint: 'A few items' },
      { key: 'large', label: 'Large', maxCm3: null, hint: 'A full load' },
    ];
  }
  return [
    { key: 'small', label: 'Small', maxCm3: smallest / 4, hint: `Up to ${fmtM3(smallest / 4)}` },
    { key: 'medium', label: 'Medium', maxCm3: smallest, hint: `Up to ${fmtM3(smallest)} — fits a ${fmtM3(smallest)} lorry` },
    { key: 'large', label: 'Large', maxCm3: null, hint: `Over ${fmtM3(smallest)} — needs a bigger lorry` },
  ];
}

/**
 * The cargo volume the recommender should reserve for a band. Large has no
 * ceiling, so it reserves twice the smallest lorry, which rules out the
 * smallest lorry and anything with less than that left.
 * @returns {number|null} cm³, or null when the fleet has no measured lorry
 */
export function bandDemandCm3(bandKey, trucks = []) {
  const volumes = trucks.map(truckVolumeCm3).filter(v => Number.isFinite(v) && v > 0);
  if (!volumes.length) return null;
  const smallest = Math.min(...volumes);
  if (bandKey === 'small') return smallest / 4;
  if (bandKey === 'medium') return smallest;
  if (bandKey === 'large') return smallest * 2;
  return null;
}
