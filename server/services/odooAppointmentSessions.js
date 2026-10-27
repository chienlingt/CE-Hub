// server/services/odooAppointmentSessions.js
//
// Appointment sessions from FRD v1.2 §05 ("current example"), MYT wall-clock.
// Kept in its own module so the payload builder and the appointment service can
// both use it without a require cycle.

const APPOINTMENT_SESSIONS = {
  morning:   ['10:00', '13:00'],
  afternoon: ['14:00', '17:00'],
  evening:   ['17:00', '19:00'],
};

// Session for a CE Hub slot window start ("HH:MM"): the first session that has
// not ended yet, so an 09:00 slot still reports as morning. null after 19:00.
function sessionForWindow(start) {
  if (!start) return null;
  const hhmm = String(start).slice(0, 5);
  return Object.keys(APPOINTMENT_SESSIONS).find(key => hhmm < APPOINTMENT_SESSIONS[key][1]) || null;
}

module.exports = { APPOINTMENT_SESSIONS, sessionForWindow };
