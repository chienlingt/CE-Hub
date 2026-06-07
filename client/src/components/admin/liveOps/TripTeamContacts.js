import { Phone, MessageCircle } from 'lucide-react';
import { callCustomer, openWhatsApp } from '../../../utils/phoneHelpers';

function buildWhatsAppMessage(contact, trip) {
  const window = [trip.time_window_start, trip.time_window_end].filter(Boolean).join('–');
  const truck  = trip.truck_plate ? ` (${trip.truck_plate})` : '';
  return `Hi ${contact.name}, checking on trip ${window}${truck}.`;
}

function RoleBadge({ role }) {
  const colorMap = {
    'Trip lead':    'bg-orange-100 text-orange-700',
    'Truck driver': 'bg-blue-100 text-blue-700',
    'Assistant':    'bg-purple-100 text-purple-700',
    'Delivery team':'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colorMap[role] || 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  );
}

function ContactRow({ contact, trip }) {
  const hasPhone = !!contact.phone;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {/* Avatar initial */}
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">
        {contact.name?.[0]?.toUpperCase() || '?'}
      </div>

      {/* Name + roles + phone */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {contact.roles.map(r => <RoleBadge key={r} role={r} />)}
          {!hasPhone && (
            <span className="text-xs text-gray-400 italic">No number</span>
          )}
          {hasPhone && (
            <span className="text-xs text-gray-400">{contact.phone}</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => callCustomer(contact.phone)}
          disabled={!hasPhone}
          title={hasPhone ? `Call ${contact.name}` : 'No phone number'}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => openWhatsApp(contact.phone, buildWhatsAppMessage(contact, trip))}
          disabled={!hasPhone}
          title={hasPhone ? `WhatsApp ${contact.name}` : 'No phone number'}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Shows deduped delivery team contacts (started_by, truck driver/assistant, team members).
 * @param {{ trip: object }}
 */
export default function TripTeamContacts({ trip }) {
  const contacts = trip.contacts || [];

  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Delivery Team</h3>
      {contacts.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No team contact numbers on file.</p>
      ) : (
        <div>
          {contacts.map(contact => (
            <ContactRow key={contact.id} contact={contact} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
