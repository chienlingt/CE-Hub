// server/utils/addressParser.js
// Utility to extract building/taman name from Malaysian addresses

/**
 * Extract building/taman name from customer address
 * Examples:
 * - "Unit 13-03, Random Condo" -> "Random Condo"
 * - "Tiara Damansara Jalan 17/1" -> "Tiara Damansara"
 * - "No 5, Taman Desa, Kuala Lumpur" -> "Taman Desa"
 * - "Universiti Malaya" -> "Universiti Malaya"
 *
 * @param {string} address - Full customer address
 * @returns {string} Building/taman name
 */
function extractBuildingName(address) {
  if (!address || typeof address !== 'string') {
    return 'Unknown Building';
  }

  const trimmedAddress = address.trim();
  const addressParts = trimmedAddress.split(',').map(part => part.trim()).filter(Boolean);

  // Pattern 0: Area codes like "SS2", "SS 15", "SS-15"
  const areaMatch = trimmedAddress.match(/\bSS[\s-]?\d{1,2}\b/i);
  if (areaMatch) {
    return areaMatch[0].replace(/[\s-]/g, '').toUpperCase();
  }

  // Pattern 1: "Unit X, Building Name" or "No X, Building Name"
  // Extract everything after the last comma
  if (trimmedAddress.includes(',')) {
    const parts = addressParts;
    // Get the part after the last comma (usually the building name)
    const buildingPart = parts[parts.length - 1].trim();

    // If it's just a unit number pattern, take the second-to-last part
    if (/^(Unit|No\.?|Lot)\s+[\d-]+$/i.test(buildingPart)) {
      if (parts.length >= 2) {
        return parts[parts.length - 2].trim();
      }
    }

    return buildingPart;
  }

  // Pattern 2: "Building Name Jalan/Street X"
  // Extract everything before "Jalan" or street indicators
  const streetIndicators = [
    /\s+Jalan\s+/i,
    /\s+Jln\s+/i,
    /\s+Lorong\s+/i,
    /\s+Street\s+/i,
    /\s+Road\s+/i
  ];

  for (const pattern of streetIndicators) {
    if (pattern.test(trimmedAddress)) {
      const parts = trimmedAddress.split(pattern);
      return parts[0].trim();
    }
  }

  // Pattern 3: No clear separator, return the whole address
  // Remove common prefixes like "Unit", "No", "Lot"
  const cleanedAddress = trimmedAddress
    .replace(/^(Unit|No\.?|Lot)\s+[\d-]+,?\s*/i, '')
    .trim();

  return cleanedAddress || trimmedAddress;
}

/**
 * Normalize building name for comparison
 * Removes extra spaces, converts to lowercase for matching
 *
 * @param {string} buildingName
 * @returns {string} Normalized building name
 */
function normalizeBuildingName(buildingName) {
  return buildingName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

module.exports = {
  extractBuildingName,
  normalizeBuildingName
};
