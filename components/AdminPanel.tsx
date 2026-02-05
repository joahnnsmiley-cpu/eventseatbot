import React, { useEffect, useState } from 'react';
import { EventData } from '../types';
import * as StorageService from '../services/storageService';

type FormState = {
  id?: string;
  title: string;
  description: string;
  date: string;
  imageUrl?: string;
  paymentPhone?: string;
  maxSeatsPerBooking?: number;
};

const emptyForm = (): FormState => ({ title: '', description: '', date: '', imageUrl: '', paymentPhone: '', maxSeatsPerBooking: 4 });

const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [events, setEvents] = useState<EventData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await StorageService.getAdminEvents();
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm());
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (evt: EventData) => {
    setForm({ id: evt.id, title: evt.title, description: evt.description, date: evt.date, imageUrl: evt.imageUrl, paymentPhone: evt.paymentPhone, maxSeatsPerBooking: evt.maxSeatsPerBooking });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validate = (values: FormState) => {
    const errs: Record<string, string> = {};
    if (!values.title || values.title.trim().length < 3) errs.title = 'Title is required (min 3 chars)';
    if (!values.description || values.description.trim().length < 10) errs.description = 'Description is required (min 10 chars)';
    if (!values.date || Number.isNaN(Date.parse(values.date))) errs.date = 'Valid date is required (YYYY-MM-DD)';
    if (typeof values.maxSeatsPerBooking !== 'undefined' && Number(values.maxSeatsPerBooking) < 1) errs.maxSeatsPerBooking = 'Must be at least 1';
    return errs;
  };

  const submit = async () => {
    setFormErrors({});
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await StorageService.updateAdminEvent(form.id, {
          title: form.title,
          description: form.description,
          date: form.date,
          imageUrl: form.imageUrl,
          paymentPhone: form.paymentPhone,
          maxSeatsPerBooking: form.maxSeatsPerBooking,
        });
      } else {
        await StorageService.createAdminEvent({
          title: form.title,
          description: form.description,
          date: form.date,
          imageUrl: form.imageUrl,
          paymentPhone: form.paymentPhone,
          maxSeatsPerBooking: form.maxSeatsPerBooking,
          tables: [],
        });
      }
      await load();
      setIsFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
  };

  const doDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      await StorageService.deleteAdminEvent(deletingId);
      setDeletingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Admin — Events</h1>
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-sm text-gray-600">Exit</button>
          )}
          <button onClick={openCreate} className="bg-blue-600 text-white px-3 py-2 rounded">New Event</button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading events…</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      {!loading && events && (
        <div className="grid grid-cols-1 gap-4">
          {events.map(evt => (
            <div key={evt.id} className="bg-white p-4 rounded shadow-sm border flex justify-between items-start gap-4">
              <div>
                <h2 className="font-bold text-lg">{evt.title}</h2>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{evt.description}</p>
                <div className="text-xs text-gray-500 mt-2">{evt.date}</div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => openEdit(evt)} className="px-3 py-1 bg-gray-100 rounded text-sm">Edit</button>
                <button onClick={() => confirmDelete(evt.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded shadow p-6">
            <h3 className="text-lg font-semibold mb-4">{form.id ? 'Edit Event' : 'Create Event'}</h3>
            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col">
                <span className="text-sm font-medium">Title</span>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="border p-2 rounded" />
                {formErrors.title && <span className="text-xs text-red-600">{formErrors.title}</span>}
              </label>

              <label className="flex flex-col">
                <span className="text-sm font-medium">Description</span>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border p-2 rounded" rows={4} />
                {formErrors.description && <span className="text-xs text-red-600">{formErrors.description}</span>}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col">
                  <span className="text-sm font-medium">Date</span>
                  <input value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} placeholder="YYYY-MM-DD" className="border p-2 rounded" />
                  {formErrors.date && <span className="text-xs text-red-600">{formErrors.date}</span>}
                </label>
                <label className="flex flex-col">
                  <span className="text-sm font-medium">Payment Phone</span>
                  <input value={form.paymentPhone} onChange={e => setForm({ ...form, paymentPhone: e.target.value })} className="border p-2 rounded" />
                </label>
              </div>

              <label className="flex flex-col">
                <span className="text-sm font-medium">Image URL</span>
                <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className="border p-2 rounded" />
              </label>

              <label className="flex flex-col">
                <span className="text-sm font-medium">Max Seats Per Booking</span>
                <input type="number" value={form.maxSeatsPerBooking} onChange={e => setForm({ ...form, maxSeatsPerBooking: Number(e.target.value) })} className="border p-2 rounded" />
                {formErrors.maxSeatsPerBooking && <span className="text-xs text-red-600">{formErrors.maxSeatsPerBooking}</span>}
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsFormOpen(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={submit} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white p-6 rounded shadow max-w-sm w-full">
            <h4 className="font-semibold mb-2">Delete event?</h4>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone. Are you sure you want to delete this event?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="px-3 py-2 border rounded">Cancel</button>
              <button onClick={doDelete} disabled={deleteLoading} className="px-3 py-2 bg-red-600 text-white rounded">{deleteLoading ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
// duplicate block removed to avoid redeclaration