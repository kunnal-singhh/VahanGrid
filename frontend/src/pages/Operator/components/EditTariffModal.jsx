/**
 * frontend/src/pages/Operator/components/EditTariffModal.jsx
 *
 * Phase 4D: Operator Tariff Management Modal.
 *
 * Capabilities:
 *  - Create new CPO-wide or station-specific tariff plan.
 *  - Edit mutable tariff pricing components (base rate, session fee, minute rate, idle penalty, grace period, GST, validity dates).
 *  - Station fleet selector (fetches owned stations so operator can attach tariff to a specific station or make it network-wide).
 *  - Strict client-side input validation mirroring server rules (non-negative rates, 0-1 tax fraction, date ordering).
 *  - Dirty tracking for edits: sends only modified fields to prevent accidental overwrites.
 *  - Explains snapshot immutability: past sessions & settled CDRs are never retroactively repriced.
 *  - Duplicate submission prevention, session expiry handling (401), access denial handling (403).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  X,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  Info,
  Clock,
  ShieldCheck,
  Coins,
  Percent,
  Calendar,
  Layers,
} from 'lucide-react';
import { tariffService } from '../../../services/tariffService';
import { operatorService } from '../../../services/operatorService';

export default function EditTariffModal({
  tariff = null, // null for create mode, or tariff object for edit mode
  isOpen = true,
  onClose,
  onTariffSaved,
  theme = 'dark',
}) {
  const isEdit = Boolean(tariff?.id);

  // Station fleet options for scoping
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: tariff?.name || '',
    description: tariff?.description || '',
    location_id: tariff?.location_id || '',
    currency: tariff?.currency || 'INR',
    price_per_kwh: tariff?.price_per_kwh != null ? String(tariff.price_per_kwh) : '15.00',
    session_fee: tariff?.session_fee != null ? String(tariff.session_fee) : '0.00',
    price_per_minute: tariff?.price_per_minute != null ? String(tariff.price_per_minute) : '0.00',
    idle_fee_per_minute: tariff?.idle_fee_per_minute != null ? String(tariff.idle_fee_per_minute) : '1.00',
    grace_period_minutes: tariff?.grace_period_minutes != null ? String(tariff.grace_period_minutes) : '15',
    tax_rate: tariff?.tax_rate != null ? String(tariff.tax_rate) : '0.1800',
    is_active: tariff?.is_active ?? true,
    valid_from: tariff?.valid_from ? new Date(tariff.valid_from).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    valid_to: tariff?.valid_to ? new Date(tariff.valid_to).toISOString().slice(0, 16) : '',
  });

  const [initialData, setInitialData] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const draftKey = `vahangrid_draft_tariff_${tariff?.id || 'new'}`;

  // Load operator stations fleet for the location scope selector
  useEffect(() => {
    let isMounted = true;
    async function loadStations() {
      try {
        setLoadingStations(true);
        const res = await operatorService.getStations({ limit: 50 });
        if (isMounted) {
          setStations(res.stations || []);
        }
      } catch (err) {
        console.error('[EditTariffModal] Failed to load stations fleet:', err);
      } finally {
        if (isMounted) setLoadingStations(false);
      }
    }
    loadStations();
    return () => {
      isMounted = false;
    };
  }, []);

  // Set initial data on mount / tariff change and restore preserved draft
  useEffect(() => {
    const init = {
      name: tariff?.name || '',
      description: tariff?.description || '',
      location_id: tariff?.location_id || '',
      currency: tariff?.currency || 'INR',
      price_per_kwh: tariff?.price_per_kwh != null ? String(tariff.price_per_kwh) : '15.00',
      session_fee: tariff?.session_fee != null ? String(tariff.session_fee) : '0.00',
      price_per_minute: tariff?.price_per_minute != null ? String(tariff.price_per_minute) : '0.00',
      idle_fee_per_minute: tariff?.idle_fee_per_minute != null ? String(tariff.idle_fee_per_minute) : '1.00',
      grace_period_minutes: tariff?.grace_period_minutes != null ? String(tariff.grace_period_minutes) : '15',
      tax_rate: tariff?.tax_rate != null ? String(tariff.tax_rate) : '0.1800',
      is_active: tariff?.is_active ?? true,
      valid_from: tariff?.valid_from ? new Date(tariff.valid_from).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      valid_to: tariff?.valid_to ? new Date(tariff.valid_to).toISOString().slice(0, 16) : '',
    };

    let formToUse = init;
    let isRestored = false;
    try {
      const savedDraft = sessionStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        const hasDiff = Object.keys(parsed).some(
          (k) => String(parsed[k] ?? '').trim() !== String(init[k] ?? '').trim()
        );
        if (hasDiff) {
          formToUse = { ...init, ...parsed };
          isRestored = true;
        }
      }
    } catch (e) {
      console.warn('[EditTariffModal] Error reading draft from sessionStorage:', e);
    }

    setFormData(formToUse);
    setInitialData(init);
    setDraftRestored(isRestored);
  }, [tariff, draftKey]);

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

  // Track dirty fields for updates
  const dirtyFields = useMemo(() => {
    if (!initialData || !isEdit) return formData;
    const changes = {};
    for (const [key, val] of Object.entries(formData)) {
      if (String(val).trim() !== String(initialData[key] || '').trim()) {
        changes[key] = val;
      }
    }
    return changes;
  }, [formData, initialData, isEdit]);

  const hasChanges = isEdit
    ? Object.keys(dirtyFields).length > 0
    : Boolean(formData.name.trim() || formData.description.trim() || formData.location_id);

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
      console.warn('[EditTariffModal] Failed to persist draft to sessionStorage:', e);
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
    try {
      sessionStorage.removeItem(draftKey);
    } catch (_) {}
    if (initialData) {
      setFormData(initialData);
    }
    setDraftRestored(false);
    setFieldErrors({});
    setSubmitError(null);
  };

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
      errors.name = 'Tariff plan name is required.';
    } else if (formData.name.trim().length > 255) {
      errors.name = 'Name cannot exceed 255 characters.';
    }

    const priceKwh = Number(formData.price_per_kwh);
    if (isNaN(priceKwh) || priceKwh < 0) {
      errors.price_per_kwh = 'Energy rate must be a non-negative number (₹/kWh).';
    }

    const sessionFee = Number(formData.session_fee);
    if (isNaN(sessionFee) || sessionFee < 0) {
      errors.session_fee = 'Session fee must be a non-negative number (₹).';
    }

    const priceMin = Number(formData.price_per_minute);
    if (isNaN(priceMin) || priceMin < 0) {
      errors.price_per_minute = 'Time rate must be a non-negative number (₹/min).';
    }

    const idleFee = Number(formData.idle_fee_per_minute);
    if (isNaN(idleFee) || idleFee < 0) {
      errors.idle_fee_per_minute = 'Idle fee must be a non-negative number (₹/min).';
    }

    const graceMin = Number(formData.grace_period_minutes);
    if (isNaN(graceMin) || !Number.isInteger(graceMin) || graceMin < 0) {
      errors.grace_period_minutes = 'Grace period must be a non-negative integer (minutes).';
    }

    const taxRate = Number(formData.tax_rate);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 1.0) {
      errors.tax_rate = 'Tax rate must be a fraction between 0.00 and 1.00 (e.g. 0.18 for 18% GST).';
    }

    if (formData.valid_from && formData.valid_to) {
      const fromDate = new Date(formData.valid_from);
      const toDate = new Date(formData.valid_to);
      if (toDate < fromDate) {
        errors.valid_to = "'Valid Until' cannot be earlier than 'Valid From'.";
      }
    }

    return errors;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (isEdit && !hasChanges) {
      setSubmitError('No changes detected to save.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      if (isEdit) {
        // Send only modified mutable fields
        const payload = {};
        for (const [key, val] of Object.entries(dirtyFields)) {
          if (['price_per_kwh', 'session_fee', 'price_per_minute', 'idle_fee_per_minute', 'tax_rate'].includes(key)) {
            payload[key] = Number(val);
          } else if (key === 'grace_period_minutes') {
            payload[key] = parseInt(val, 10);
          } else if (key === 'location_id') {
            payload[key] = val ? val : null;
          } else if (key === 'valid_to') {
            payload[key] = val ? new Date(val).toISOString() : null;
          } else if (key === 'valid_from') {
            payload[key] = val ? new Date(val).toISOString() : null;
          } else if (key === 'is_active') {
            payload[key] = Boolean(val);
          } else {
            payload[key] = typeof val === 'string' ? val.trim() : val;
          }
        }

        const updated = await tariffService.updateTariff(tariff.id, payload);
        setSubmitSuccess('Tariff plan updated successfully!');
        try {
          sessionStorage.removeItem(draftKey);
        } catch (_) {}
        setDraftRestored(false);
        if (onTariffSaved) onTariffSaved(updated);
        setTimeout(() => onClose(), 600);
      } else {
        // Create mode
        const payload = {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          location_id: formData.location_id ? formData.location_id : null,
          currency: 'INR',
          price_per_kwh: Number(formData.price_per_kwh),
          session_fee: Number(formData.session_fee),
          price_per_minute: Number(formData.price_per_minute),
          idle_fee_per_minute: Number(formData.idle_fee_per_minute),
          grace_period_minutes: parseInt(formData.grace_period_minutes, 10),
          tax_rate: Number(formData.tax_rate),
          is_active: Boolean(formData.is_active),
          valid_from: formData.valid_from ? new Date(formData.valid_from).toISOString() : new Date().toISOString(),
          valid_to: formData.valid_to ? new Date(formData.valid_to).toISOString() : null,
        };

        const created = await tariffService.createTariff(payload);
        setSubmitSuccess('New tariff plan created successfully!');
        try {
          sessionStorage.removeItem(draftKey);
        } catch (_) {}
        setDraftRestored(false);
        if (onTariffSaved) onTariffSaved(created);
        setTimeout(() => onClose(), 600);
      }
    } catch (err) {
      console.error('[EditTariffModal] Save error:', err);
      if (err.status === 401) {
        setSubmitError('Your session has expired. Please log in again.');
      } else if (err.status === 403) {
        setSubmitError('Access denied: You cannot create or modify tariffs for another CPO.');
      } else if (err.details && Array.isArray(err.details)) {
        setSubmitError(err.details.join(', '));
      } else {
        setSubmitError(err.message || 'Failed to save tariff plan.');
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
      aria-labelledby="modal-tariff-title"
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
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="modal-tariff-title" className="text-base font-bold text-white tracking-tight">
                  {isEdit ? `Edit Tariff: ${tariff.name}` : 'Create New Tariff Plan'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    formData.is_active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {formData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Multi-Tenant CPO Scoped</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400">
                  {formData.location_id ? 'Station-Specific Plan' : 'Network-Wide Default'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[.08] transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modal Body / Form ── */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {/* Feedback Banners */}
          {draftRestored && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Unsaved tariff edits restored from previous session.</span>
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

          <form id="edit-tariff-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* ── Section A: Plan Identity & Scope ── */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Plan Identity & Target Scope</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Tariff Plan Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g. Peak Highway Fast-Charge Rate"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                      fieldErrors.name
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.name && <p className="text-[10px] text-rose-400">{fieldErrors.name}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Applicable Scope (Station or Network-Wide)
                  </label>
                  <select
                    value={formData.location_id}
                    onChange={(e) => handleChange('location_id', e.target.value)}
                    disabled={loadingStations}
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  >
                    <option value="" className="bg-slate-900 text-white">
                      ● Network-Wide Default (All CPO Stations)
                    </option>
                    {stations.map((st) => (
                      <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                        📍 {st.name} ({st.city || 'Station'})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400">
                    Station-specific tariffs override the CPO-wide default tariff for that hub.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Plan Description (Optional)
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="e.g. Standard daytime rate applicable across 60kW DC chargers"
                  className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                      : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                  }`}
                />
              </div>
            </div>

            {/* ── Section B: Pricing Components ── */}
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                <span>Pricing Components (INR)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Price per kWh */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Energy Rate (₹/kWh) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price_per_kwh}
                    onChange={(e) => handleChange('price_per_kwh', e.target.value)}
                    placeholder="15.00"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.price_per_kwh
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.price_per_kwh && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.price_per_kwh}</p>
                  )}
                </div>

                {/* Session Fee */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Session Activation Fee (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.session_fee}
                    onChange={(e) => handleChange('session_fee', e.target.value)}
                    placeholder="0.00"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.session_fee
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.session_fee && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.session_fee}</p>
                  )}
                </div>

                {/* Price per minute */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Duration Rate (₹/min)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price_per_minute}
                    onChange={(e) => handleChange('price_per_minute', e.target.value)}
                    placeholder="0.00"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.price_per_minute
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.price_per_minute && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.price_per_minute}</p>
                  )}
                </div>
              </div>

              {/* Idle Fees & Taxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Idle Fee per minute */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Post-Charge Idle Fee (₹/min)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.idle_fee_per_minute}
                    onChange={(e) => handleChange('idle_fee_per_minute', e.target.value)}
                    placeholder="1.00"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.idle_fee_per_minute
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.idle_fee_per_minute && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.idle_fee_per_minute}</p>
                  )}
                </div>

                {/* Grace Period */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Idle Grace Period (mins)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.grace_period_minutes}
                    onChange={(e) => handleChange('grace_period_minutes', e.target.value)}
                    placeholder="15"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.grace_period_minutes
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.grace_period_minutes && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.grace_period_minutes}</p>
                  )}
                </div>

                {/* Tax Rate */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    GST / Tax Rate (0.18 = 18%)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    max="1"
                    value={formData.tax_rate}
                    onChange={(e) => handleChange('tax_rate', e.target.value)}
                    placeholder="0.1800"
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all font-mono ${
                      fieldErrors.tax_rate
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.tax_rate && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.tax_rate}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section C: Validity Window & Status ── */}
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Validity Period & Activation Status</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Valid From (IST) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.valid_from}
                    onChange={(e) => handleChange('valid_from', e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Valid Until (Leave blank for indefinite)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.valid_to}
                    onChange={(e) => handleChange('valid_to', e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all ${
                      fieldErrors.valid_to
                        ? 'border-rose-500 bg-rose-500/[.05] text-white'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  />
                  {fieldErrors.valid_to && (
                    <p className="text-[10px] text-rose-400">{fieldErrors.valid_to}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Plan Status
                  </label>
                  <select
                    value={formData.is_active ? 'true' : 'false'}
                    onChange={(e) => handleChange('is_active', e.target.value === 'true')}
                    className={`w-full text-xs rounded-xl px-3 py-2 outline-none border transition-all cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-white/[.04] border-white/10 text-white focus:border-sky-500/50'
                    }`}
                  >
                    <option value="true" className="bg-slate-900 text-white">Active (In Effect)</option>
                    <option value="false" className="bg-slate-900 text-white">Inactive (Deactivated)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Immutability & Financial Non-Retroactivity Notice */}
            <div className="p-3 rounded-2xl bg-sky-500/[.06] border border-sky-500/20 text-sky-300 text-[11px] flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
              <span>
                <strong>Financial Snapshot Protection:</strong> Updates to this tariff apply strictly to new charging sessions. Ongoing sessions and settled CDR records retain their immutable pricing snapshots and are never retroactively recalculated.
              </span>
            </div>
          </form>
        </div>

        {/* ── Modal Footer ── */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-white/[.08] bg-white/[.02]'
          }`}
        >
          <div className="text-[11px] text-slate-400">
            {isEdit ? (
              hasChanges ? (
                <span className="text-amber-400 font-semibold">
                  ● {Object.keys(dirtyFields).length} unsaved changes
                </span>
              ) : (
                <span>No changes made</span>
              )
            ) : (
              <span>New Tariff Plan</span>
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

            <button
              type="submit"
              form="edit-tariff-form"
              disabled={submitting || (isEdit && !hasChanges)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Plan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isEdit ? 'Save Changes' : 'Create Tariff'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
