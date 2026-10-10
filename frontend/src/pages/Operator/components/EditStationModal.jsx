/**
 * frontend/src/pages/Operator/components/EditStationModal.jsx
 *
 * Phase 4C: Operator Station Management Modal.
 *
 * Capabilities:
 *  - Full station details inspection (EVSEs, connectors, telemetry, CPO scope).
 *  - Controlled metadata editing (name, address, city, state, postal code, timezone, status, lat/lng).
 *  - Enforces client-side validation mirroring server-side rules.
 *  - Coordinated coordinates validation (lat & lng must be supplied together).
 *  - Strict dirty field tracking (only changed mutable fields are sent, NEVER immutable IDs).
 *  - Multi-tenant isolation indicators (CPO badge, ownership confirmation).
 *  - Real-time save with optimistic / synced state update to parent dashboard.
 *  - Duplicate submission prevention, session expiry handling (401), access denial (403).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MapPin,
  ShieldCheck,
  Zap,
  Clock,
  Layers,
  Settings,
  Info,
  Radio,
  Lock,
} from 'lucide-react';
import { operatorService } from '../../../services/operatorService';

export default function EditStationModal({
  stationId,
  onClose,
  onStationUpdated,
  theme = 'dark',
}) {
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'hardware' | 'audit'
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [stationData, setStationData] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    timezone: 'Asia/Kolkata',
    status: 'active',
    latitude: '',
    longitude: '',
  });

  const [initialData, setInitialData] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const draftKey = stationId ? `vahangrid_draft_station_${stationId}` : null;

  // Fetch single station detail on mount & check for saved drafts
  useEffect(() => {
    let isMounted = true;

    async function loadStation() {
      if (!stationId) return;
      try {
        setLoading(true);
        setFetchError(null);
        const data = await operatorService.getStationDetail(stationId);
        if (!isMounted) return;

        setStationData(data);
        const initial = {
          name: data.name || '',
          address_line1: data.address_line1 || '',
          address_line2: data.address_line2 || '',
          city: data.city || '',
          state: data.state || '',
          postal_code: data.postal_code || '',
          timezone: data.timezone || 'Asia/Kolkata',
          status: data.status || 'active',
          latitude: data.latitude != null ? String(data.latitude) : '',
          longitude: data.longitude != null ? String(data.longitude) : '',
        };

        // Check for preserved unsaved draft in sessionStorage across refreshes
        let formToUse = initial;
        let isRestored = false;
        if (draftKey) {
          try {
            const savedDraft = sessionStorage.getItem(draftKey);
            if (savedDraft) {
              const parsed = JSON.parse(savedDraft);
              const hasDiff = Object.keys(parsed).some(
                (k) => String(parsed[k] ?? '').trim() !== String(initial[k] ?? '').trim()
              );
              if (hasDiff) {
                formToUse = { ...initial, ...parsed };
                isRestored = true;
              }
            }
          } catch (e) {
            console.warn('[EditStationModal] Error reading draft from sessionStorage:', e);
          }
        }

        setFormData(formToUse);
        setInitialData(initial);
        setDraftRestored(isRestored);
      } catch (err) {
        if (!isMounted) return;
        console.error('[EditStationModal] Failed to fetch station:', err);
        setFetchError(err.message || 'Failed to load station details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadStation();

    return () => {
      isMounted = false;
    };
  }, [stationId, draftKey]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  // Compute dirty fields
  const dirtyFields = useMemo(() => {
    if (!initialData) return {};
    const changes = {};
    for (const [key, val] of Object.entries(formData)) {
      if (String(val).trim() !== String(initialData[key] || '').trim()) {
        changes[key] = val;
      }
    }
    return changes;
  }, [formData, initialData]);

  const hasChanges = Object.keys(dirtyFields).length > 0;

  // Persist unsaved draft to sessionStorage across page refreshes
  useEffect(() => {
    if (!draftKey || !initialData) return;
    try {
      if (hasChanges) {
        sessionStorage.setItem(draftKey, JSON.stringify(formData));
      } else {
        sessionStorage.removeItem(draftKey);
      }
    } catch (e) {
      console.warn('[EditStationModal] Failed to persist draft to sessionStorage:', e);
    }
  }, [draftKey, formData, initialData, hasChanges]);

  // Warn before browser unload if there are unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const handleDiscardDraft = () => {
    if (draftKey) {
      try {
        sessionStorage.removeItem(draftKey);
      } catch (_) {}
    }
    if (initialData) {
      setFormData(initialData);
    }
    setDraftRestored(false);
    setFieldErrors({});
    setSubmitError(null);
  };

  // Form field change handler
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return prev;
    });
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  // Client-side validation
  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Station name is required';
    } else if (formData.name.trim().length > 255) {
      errors.name = 'Station name cannot exceed 255 characters';
    }

    if (!formData.address_line1.trim()) {
      errors.address_line1 = 'Address Line 1 is required';
    } else if (formData.address_line1.trim().length > 255) {
      errors.address_line1 = 'Address Line 1 cannot exceed 255 characters';
    }

    if (formData.address_line2 && formData.address_line2.trim().length > 255) {
      errors.address_line2 = 'Address Line 2 cannot exceed 255 characters';
    }

    if (!formData.city.trim()) {
      errors.city = 'City is required';
    } else if (formData.city.trim().length > 100) {
      errors.city = 'City cannot exceed 100 characters';
    }

    if (!formData.state.trim()) {
      errors.state = 'State is required';
    } else if (formData.state.trim().length > 100) {
      errors.state = 'State cannot exceed 100 characters';
    }

    if (formData.postal_code && formData.postal_code.trim().length > 20) {
      errors.postal_code = 'Postal code cannot exceed 20 characters';
    }

    if (!formData.timezone.trim()) {
      errors.timezone = 'Timezone is required';
    } else if (formData.timezone.trim().length > 50) {
      errors.timezone = 'Timezone cannot exceed 50 characters';
    }

    if (!['active', 'inactive'].includes(formData.status)) {
      errors.status = 'Status must be active or inactive';
    }

    // Coordinate validation
    const latStr = String(formData.latitude).trim();
    const lngStr = String(formData.longitude).trim();

    if (latStr !== '' || lngStr !== '') {
      if (latStr === '' || lngStr === '') {
        errors.coordinates = 'Both latitude and longitude must be provided together';
      } else {
        const latNum = parseFloat(latStr);
        const lngNum = parseFloat(lngStr);

        if (isNaN(latNum) || latNum < -90 || latNum > 90) {
          errors.latitude = 'Latitude must be a valid number between -90 and 90';
        }
        if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
          errors.longitude = 'Longitude must be a valid number between -180 and 180';
        }
      }
    }

    return errors;
  };

  // Submit update
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!hasChanges) {
      setSubmitError('No changes detected to save.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    // Prepare payload with only changed mutable fields
    const payload = {};
    for (const [key, val] of Object.entries(dirtyFields)) {
      if (key === 'latitude' || key === 'longitude') {
        // Coordinates must be numbers if changed
        payload[key] = parseFloat(val);
      } else {
        payload[key] = typeof val === 'string' ? val.trim() : val;
      }
    }

    // If one coordinate changed, ensure both are included in payload for consistency
    if ('latitude' in payload || 'longitude' in payload) {
      payload.latitude = parseFloat(formData.latitude);
      payload.longitude = parseFloat(formData.longitude);
    }

    try {
      const updated = await operatorService.updateStation(stationId, payload);
      setSubmitSuccess('Station metadata updated successfully!');
      if (draftKey) {
        try {
          sessionStorage.removeItem(draftKey);
        } catch (_) {}
      }
      setDraftRestored(false);
      setInitialData({
        ...formData,
        latitude: String(payload.latitude ?? formData.latitude),
        longitude: String(payload.longitude ?? formData.longitude),
      });

      // Update local station data cache
      setStationData((prev) => ({
        ...prev,
        ...updated,
      }));

      // Notify parent component
      if (onStationUpdated) {
        onStationUpdated(updated);
      }
    } catch (err) {
      console.error('[EditStationModal] Update error:', err);
      if (err.status === 401) {
        setSubmitError('Your session has expired. Please sign in again.');
      } else if (err.status === 403) {
        setSubmitError('Access denied: You can only manage stations belonging to your CPO.');
      } else if (err.details && Array.isArray(err.details)) {
        setSubmitError(err.details.join(', '));
      } else {
        setSubmitError(err.message || 'Failed to update station metadata.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isLight = theme === 'light';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-station-title"
    >
      <div
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#070d1e] border-white/[.12]'
        }`}
      >
        {/* ── Modal Header ── */}
        <div
          className={`flex items-center justify-between px-6 py-4.5 border-b relative ${
            isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/[.08] bg-white/[.02]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="modal-station-title" className="text-base font-bold text-white tracking-tight">
                  {loading ? 'Loading Station Details...' : stationData?.name || 'Station Management'}
                </h2>
                {!loading && stationData && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      formData.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {formData.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {stationData?.cpo?.name || 'Operator Network'}
                  {stationData?.cpo?.short_code ? ` (${stationData.cpo.short_code})` : ''}
                </span>
                <span className="text-slate-500">•</span>
                <span className="font-mono text-[11px] text-slate-400">
                  ID: {stationId ? `${stationId.slice(0, 8)}...` : ''}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[.08] transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Sub-Navigation Tabs ── */}
        <div
          className={`flex items-center gap-2 px-6 py-2 border-b text-xs ${
            isLight ? 'border-slate-200 bg-slate-100/50' : 'border-white/[.06] bg-white/[.01]'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'edit'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Metadata & Location</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'hardware'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Hardware & Connectors ({stationData?.evses?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Audit & Isolation</span>
          </button>
        </div>

        {/* ── Modal Body Content ── */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <span className="text-xs">Fetching station details and EVSE status...</span>
            </div>
          ) : fetchError ? (
            <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-3 text-center">
              <AlertTriangle className="w-8 h-8 opacity-75" />
              <p className="text-xs font-semibold">{fetchError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  operatorService
                    .getStationDetail(stationId)
                    .then((data) => {
                      setStationData(data);
                      setFormData({
                        name: data.name || '',
                        address_line1: data.address_line1 || '',
                        address_line2: data.address_line2 || '',
                        city: data.city || '',
                        state: data.state || '',
                        postal_code: data.postal_code || '',
                        timezone: data.timezone || 'Asia/Kolkata',
                        status: data.status || 'active',
                        latitude: data.latitude != null ? String(data.latitude) : '',
                        longitude: data.longitude != null ? String(data.longitude) : '',
                      });
                      setFetchError(null);
                    })
                    .catch((err) => setFetchError(err.message))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 cursor-pointer"
              >
                Retry Load
              </button>
            </div>
          ) : (
            <>
              {/* Feedback Banners */}
              {draftRestored && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">Unsaved station edits restored from previous session.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition-colors cursor-pointer shrink-0"
                  >
                    Discard Draft
                  </button>
                </div>
              )}

              {submitSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {submitError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* ── TAB 1: Edit Form ── */}
              {activeTab === 'edit' && (
                <form id="edit-station-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {/* Name & Operational Status */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Station Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="e.g. Tata Power Fast Charger — Connaught Place"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                          fieldErrors.name
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.name && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.name}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Operational Status <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all cursor-pointer ${
                          fieldErrors.status
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      >
                        <option value="active" className="bg-slate-900 text-white">Active (Online)</option>
                        <option value="inactive" className="bg-slate-900 text-white">Inactive (Maintenance)</option>
                      </select>
                      {fieldErrors.status && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.status}</p>
                      )}
                    </div>
                  </div>

                  {/* Address Line 1 */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Address Line 1 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.address_line1}
                      onChange={(e) => handleChange('address_line1', e.target.value)}
                      placeholder="e.g. Block A, Inner Circle, Connaught Place"
                      className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                        fieldErrors.address_line1
                          ? 'border-rose-500 bg-rose-500/[.05] text-white'
                          : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                          : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                      }`}
                    />
                    {fieldErrors.address_line1 && (
                      <p className="text-[10px] text-rose-400">{fieldErrors.address_line1}</p>
                    )}
                  </div>

                  {/* Address Line 2 */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Address Line 2 (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.address_line2}
                      onChange={(e) => handleChange('address_line2', e.target.value)}
                      placeholder="e.g. Near Metro Gate 3"
                      className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                        fieldErrors.address_line2
                          ? 'border-rose-500 bg-rose-500/[.05] text-white'
                          : isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                          : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                      }`}
                    />
                    {fieldErrors.address_line2 && (
                      <p className="text-[10px] text-rose-400">{fieldErrors.address_line2}</p>
                    )}
                  </div>

                  {/* City, State, Postal Code */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        City <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                        placeholder="e.g. New Delhi"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                          fieldErrors.city
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.city && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.city}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        State <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => handleChange('state', e.target.value)}
                        placeholder="e.g. Delhi"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                          fieldErrors.state
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.state && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.state}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        value={formData.postal_code}
                        onChange={(e) => handleChange('postal_code', e.target.value)}
                        placeholder="e.g. 110001"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                          fieldErrors.postal_code
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.postal_code && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.postal_code}</p>
                      )}
                    </div>
                  </div>

                  {/* Timezone & Geo Coordinates */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Timezone <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.timezone}
                        onChange={(e) => handleChange('timezone', e.target.value)}
                        placeholder="Asia/Kolkata"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                          fieldErrors.timezone
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.timezone && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.timezone}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Latitude [-90, 90]
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formData.latitude}
                        onChange={(e) => handleChange('latitude', e.target.value)}
                        placeholder="e.g. 28.6304"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                          fieldErrors.latitude || fieldErrors.coordinates
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.latitude && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.latitude}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Longitude [-180, 180]
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formData.longitude}
                        onChange={(e) => handleChange('longitude', e.target.value)}
                        placeholder="e.g. 77.2177"
                        className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                          fieldErrors.longitude || fieldErrors.coordinates
                            ? 'border-rose-500 bg-rose-500/[.05] text-white'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                            : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                        }`}
                      />
                      {fieldErrors.longitude && (
                        <p className="text-[10px] text-rose-400">{fieldErrors.longitude}</p>
                      )}
                    </div>
                  </div>

                  {fieldErrors.coordinates && (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {fieldErrors.coordinates}
                    </p>
                  )}

                  <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>
                      Protected identifiers (Station UUID, CPO ID, source type) are immutable and cannot be modified.
                    </span>
                  </div>
                </form>
              )}

              {/* ── TAB 2: Hardware & Connectors ── */}
              {activeTab === 'hardware' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-white">EVSE Inventory & Telemetry</span>
                    <span>Total EVSEs: {stationData?.evses?.length || 0}</span>
                  </div>

                  {stationData?.evses && stationData.evses.length > 0 ? (
                    <div className="space-y-3">
                      {stationData.evses.map((evse, idx) => (
                        <div
                          key={evse.id || idx}
                          className="p-3.5 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center font-mono font-bold text-[10px]">
                                #{evse.evse_id || idx + 1}
                              </span>
                              <span className="font-bold text-white">EVSE ID: {evse.evse_id || evse.id?.slice(0, 8)}</span>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                evse.status === 'AVAILABLE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : evse.status === 'CHARGING'
                                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              }`}
                            >
                              {evse.status || 'AVAILABLE'}
                            </span>
                          </div>

                          {/* Connectors for this EVSE */}
                          {evse.connectors && evse.connectors.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {evse.connectors.map((conn) => (
                                <div
                                  key={conn.id}
                                  className="p-2 rounded-xl bg-white/[.02] border border-white/[.04] flex items-center justify-between"
                                >
                                  <div>
                                    <div className="font-semibold text-white text-[11px]">
                                      Connector #{conn.connector_id} ({conn.standard || 'CCS2'})
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      Max Power: <span className="text-slate-300 font-bold">{conn.max_power_kw || '—'} kW</span>
                                    </div>
                                  </div>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      conn.status === 'Available' || conn.status === 'AVAILABLE'
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : conn.status === 'Charging' || conn.status === 'CHARGING'
                                        ? 'bg-sky-500/10 text-sky-400'
                                        : 'bg-slate-500/10 text-slate-400'
                                    }`}
                                  >
                                    {conn.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">No physical connectors attached to this EVSE.</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 rounded-2xl border border-white/[.06]">
                      No EVSE hardware configured for this station.
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: Audit & Multi-Tenancy ── */}
              {activeTab === 'audit' && (
                <div className="space-y-3 text-xs">
                  <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-3">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-xs pb-1 border-b border-white/[.06]">
                      <Lock className="w-4 h-4" />
                      <span>Multi-Tenant Scoping & Immutability Rules</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-slate-500 text-[10px] block">CPO Ownership (Tenant ID)</span>
                        <span className="font-mono text-slate-200 text-[11px]">{stationData?.cpo_id || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Station Primary Key (UUID)</span>
                        <span className="font-mono text-slate-200 text-[11px]">{stationData?.id || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Source Integration Type</span>
                        <span className="font-semibold text-slate-200 capitalize">{stationData?.source_type || 'Internal'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">External Source Reference ID</span>
                        <span className="font-mono text-slate-200 text-[11px]">{stationData?.source_id || 'Internal DB'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Country Code</span>
                        <span className="font-semibold text-slate-200">{stationData?.country_code || 'IN'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Last Synchronized / Updated</span>
                        <span className="font-mono text-slate-200 text-[11px]">
                          {stationData?.updated_at ? new Date(stationData.updated_at).toLocaleString('en-IN') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-white/[.08] bg-white/[.02]'
          }`}
        >
          <div className="text-[11px] text-slate-400">
            {hasChanges ? (
              <span className="text-amber-400 font-semibold">
                ● {Object.keys(dirtyFields).length} unsaved changes
              </span>
            ) : (
              <span>All changes synced</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[.06] border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            {activeTab === 'edit' && (
              <button
                type="submit"
                form="edit-station-form"
                disabled={submitting || !hasChanges || loading}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
