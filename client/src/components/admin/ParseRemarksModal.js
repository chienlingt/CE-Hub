import React, { useState } from 'react';
import {
  X, Sparkles, MapPin, Phone, User, FileText,
  CheckCircle, AlertTriangle, RefreshCw, Save
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

function FieldRow({ icon: Icon, label, originalValue, value, onChange, highlight }) {
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <Icon size={13} className={highlight ? 'text-blue-600' : 'text-gray-400'} />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        {highlight && (
          <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
            From remarks
          </span>
        )}
      </div>
      {highlight && originalValue && (
        <p className="text-xs text-gray-400 line-through pl-1">{originalValue}</p>
      )}
      <textarea
        rows={label === 'Delivery Address' || label === 'Driver Notes' ? 2 : 1}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-1.5 text-sm border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          highlight ? 'border-blue-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-500'
        }`}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    </div>
  );
}

export default function ParseRemarksModal({ order, onClose, onApplied }) {
  const [parsing,  setParsing]  = useState(false);
  const [applying, setApplying] = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [toast,    setToast]    = useState(null);

  const [editAddress, setEditAddress] = useState('');
  const [editPhone,   setEditPhone]   = useState('');
  const [editContact, setEditContact] = useState('');
  const [editNotes,   setEditNotes]   = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleParse = async () => {
    setParsing(true); setError(null); setResult(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orders/${order.id}/parse-remarks`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      const p = data.parsed;
      setResult(p);
      setEditAddress(p.applied_address || order.delivery_address || '');
      setEditPhone(p.applied_phone     || order.customers?.phone  || '');
      setEditContact(p.contact_name    || '');
      setEditNotes(p.driver_notes      || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/apply-parsed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_address: editAddress, phone: editPhone, contact_name: editContact, driver_notes: editNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('Parsed data saved to order.');
      setTimeout(() => { onApplied?.(); onClose(); }, 1200);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-10 mb-10">

        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {toast.type === 'error' ? <AlertTriangle size={15} className="mr-2" /> : <CheckCircle size={15} className="mr-2" />}
            {toast.msg}
          </div>
        )}

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" /> LLM Remark Parser
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()} — Groq / Gemini AI
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Raw Remark (from Odoo)</p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-900 italic">"{order.delivery_remarks}"</p>
            </div>
          </div>

          {!result && (
            <button onClick={handleParse} disabled={parsing || !order.delivery_remarks}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium text-sm disabled:opacity-50">
              {parsing ? <><RefreshCw size={15} className="animate-spin" /> Parsing...</> : <><Sparkles size={15} /> Parse Remarks</>}
            </button>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{error}
            </div>
          )}

          {result && (
            <>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                result.source === 'remarks' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {result.source === 'remarks'
                  ? <><CheckCircle size={14} /> Info found in remarks — shown below (editable)</>
                  : <><AlertTriangle size={14} /> No address or phone in remarks — defaults used</>}
              </div>

              <div className="space-y-3">
                <FieldRow icon={MapPin}   label="Delivery Address" originalValue={order.original_delivery_address || order.delivery_address} value={editAddress} onChange={setEditAddress} highlight={result.has_address} />
                <FieldRow icon={Phone}    label="Contact Phone"    originalValue={order.customers?.phone}                                    value={editPhone}   onChange={setEditPhone}   highlight={result.has_phone}   />
                <FieldRow icon={User}     label="Contact Person"   originalValue={null}                                                      value={editContact} onChange={setEditContact} highlight={!!result.contact_name} />
                <FieldRow icon={FileText} label="Driver Notes"     originalValue={null}                                                      value={editNotes}   onChange={setEditNotes}   highlight={!!result.driver_notes} />
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button onClick={handleParse} disabled={parsing}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl">
                  <RefreshCw size={13} /> Re-parse
                </button>
                <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl">
                  Discard
                </button>
                <button onClick={handleApply} disabled={applying}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  <Save size={14} /> {applying ? 'Saving...' : 'Apply to Order'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
