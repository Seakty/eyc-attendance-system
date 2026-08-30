/**
 * Calculates the distance between two GPS points in meters using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (e.g. Teacher's GPS)
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2 (e.g. School GPS)
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_METERS = 6371000; // Earth's radius in meters

  // Convert degrees to radians
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Checks if a user is within the allowed geofence radius.
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} targetLat
 * @param {number} targetLng
 * @param {number} maxRadiusMeters
 * @returns {boolean} True if inside radius, false otherwise
 */
function isWithinGeofence(
  userLat,
  userLng,
  targetLat,
  targetLng,
  maxRadiusMeters = 50,
) {
  const distance = calculateDistanceMeters(
    userLat,
    userLng,
    targetLat,
    targetLng,
  );
  return {
    isInside: distance <= maxRadiusMeters,
    distanceMeters: distance,
  };
}

module.exports = {
  calculateDistanceMeters,
  isWithinGeofence,
};
