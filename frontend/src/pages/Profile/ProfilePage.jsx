import { useState, useEffect } from 'react';
import {
  Car,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  X,
  Zap,
  BatteryCharging
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { vehicleService } from '../../services/vehicleService';

const CONNECTOR_OPTIONS = [
  { value: 'CCS2', label: 'CCS2 (Combined Charging System Type 2 - Standard Fast DC)' },
  { value: 'Type2', label: 'Type 2 (Mennekes - Standard AC Fast)' },
  { value: 'CHAdeMO', label: 'CHAdeMO (DC Fast)' },
  { value: 'Bharat DC-001', label: 'Bharat DC-001 (15-20 kW DC)' },
  { value: 'Bharat AC-001', label: 'Bharat AC-001 (10 kW AC)' },
  { value: 'CCS1', label: 'CCS1 (Type 1 Combo)' },
];

export default function ProfilePage({
  selectedVehicle,
  onSelectVehicle,
  vehicles = [],
  onVehiclesChange,
}) {
  const { user, logout } = useAuth();

  // Local component states
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal states (Add / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    manufacturer: '',
    model: '',
    variant: '',
    battery_capacity_kwh: '',
    connector_type: 'CCS2',
    max_dc_power_kw: '',
    max_ac_power_kw: '',
  });
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation state
  const [vehicleToDelete, setVehicleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Sync with prop when parent updates
  useEffect(() => {
    setLocalVehicles(vehicles);
  }, [vehicles]);

  // Initial fetch if parent provided empty list
  const loadVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await vehicleService.getVehicles();
      setLocalVehicles(data);
      if (onVehiclesChange) {
        onVehiclesChange(data);
      }
    } catch (err) {
      setError(err.message || 'Unable to load vehicles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VG';

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      })
    : '2026';

  // ── Modal Handlers ────────────────────────────────────────────────────────
  const openAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setFormData({
      manufacturer: '',
      model: '',
      variant: '',
      battery_capacity_kwh: '',
      connector_type: 'CCS2',
      max_dc_power_kw: '',
      max_ac_power_kw: '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (e, vehicle) => {
    e.stopPropagation();
    setModalMode('edit');
    setEditingId(vehicle.id);
    setFormData({
      manufacturer: vehicle.manufacturer || '',
      model: vehicle.model || '',
      variant: vehicle.variant || '',
      battery_capacity_kwh: vehicle.battery_capacity_kwh || vehicle.battery || '',
      connector_type: vehicle.connector_type || vehicle.connector || 'CCS2',
      max_dc_power_kw: vehicle.max_dc_power_kw !== null && vehicle.max_dc_power_kw !== undefined ? vehicle.max_dc_power_kw : '',
      max_ac_power_kw: vehicle.max_ac_power_kw !== null && vehicle.max_ac_power_kw !== undefined ? vehicle.max_ac_power_kw : '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleFormChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (formError) setFormError(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validations
    if (!formData.manufacturer.trim()) {
      setFormError('Manufacturer is required.');
      return;
    }
    if (!formData.model.trim()) {
      setFormError('Model is required.');
      return;
    }
    const batteryVal = parseFloat(formData.battery_capacity_kwh);
    if (isNaN(batteryVal) || batteryVal <= 0) {
      setFormError('Battery capacity must be a positive number greater than 0.');
      return;
    }

    const payload = {
      manufacturer: formData.manufacturer.trim(),
      model: formData.model.trim(),
      variant: formData.variant.trim() || undefined,
      battery_capacity_kwh: batteryVal,
      connector_type: formData.connector_type,
      max_dc_power_kw: formData.max_dc_power_kw !== '' ? parseFloat(formData.max_dc_power_kw) : undefined,
      max_ac_power_kw: formData.max_ac_power_kw !== '' ? parseFloat(formData.max_ac_power_kw) : undefined,
    };

    setSubmitting(true);
    try {
      if (modalMode === 'add') {
        const newVehicle = await vehicleService.createVehicle(payload);
        const updated = [newVehicle, ...localVehicles];
        setLocalVehicles(updated);
        if (onVehiclesChange) onVehiclesChange(updated);
        if (localVehicles.length === 0 && onSelectVehicle) {
          onSelectVehicle(newVehicle.id);
        }
      } else {
        const updatedVehicle = await vehicleService.updateVehicle(editingId, payload);
        const updated = localVehicles.map((v) => (v.id === editingId ? updatedVehicle : v));
        setLocalVehicles(updated);
        if (onVehiclesChange) onVehiclesChange(updated);
        if (selectedVehicle?.id === editingId && onSelectVehicle) {
          onSelectVehicle(updatedVehicle.id);
        }
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err.message || 'Operation failed. Please check your input.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete Handlers ───────────────────────────────────────────────────────
  const promptDelete = (e, vehicle) => {
    e.stopPropagation();
    setVehicleToDelete(vehicle);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    setDeleting(true);
    try {
      await vehicleService.deleteVehicle(vehicleToDelete.id);
      const updated = localVehicles.filter((v) => v.id !== vehicleToDelete.id);
      setLocalVehicles(updated);
      if (onVehiclesChange) onVehiclesChange(updated);

      if (selectedVehicle?.id === vehicleToDelete.id) {
        if (updated.length > 0 && onSelectVehicle) {
          onSelectVehicle(updated[0].id);
        } else if (onSelectVehicle) {
          onSelectVehicle(null);
        }
      }
      setVehicleToDelete(null);
    } catch (err) {
      alert(`Failed to delete vehicle: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Title & Sign Out */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Driver & Fleet Settings
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            Driver Profile & Vehicle Portfolio
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Manage your electric vehicles, VahanPass roaming credentials, and account settings.
          </p>
        </div>

        <button
          onClick={logout}
          id="btn-logout-profile"
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-950/20"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-400" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Driver Card */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 flex items-center justify-center text-xl font-black text-white shadow-xl shadow-sky-500/20 shrink-0">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white" id="profile-user-name">
                {user?.name || 'VahanGrid EV Pilot'}
              </h2>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                VERIFIED DRIVER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5" id="profile-user-contact">
              {user?.email || 'driver.pilot@vahangrid.in'} {user?.phone ? `• ${user.phone}` : ''}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Driver ID: {user?.id || 'VG-PILOT'} • Member since {memberSince}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Roaming Clearance</div>
          <div className="text-xs font-bold text-sky-400 flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>All Indian CPO Networks</span>
          </div>
        </div>
      </div>

      {/* Registered Electric Vehicles Section */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Car className="w-4 h-4 text-sky-400" /> Registered Electric Vehicles
            </h3>
            <span className="text-[10px] text-slate-400">
              {localVehicles.length > 0 ? 'Click a card to set as your active EV' : 'Your registered EV garage'}
            </span>
          </div>

          <button
            onClick={openAddModal}
            id="btn-add-vehicle"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Vehicle</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">Loading vehicles...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs text-rose-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadVehicles}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-bold text-[11px] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && localVehicles.length === 0 && (
          <div
            id="empty-vehicles-state"
            className="py-12 px-4 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-3 bg-white/[.01]"
          >
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">No vehicles added yet.</p>
              <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                Register your electric vehicle to automatically filter compatible charging stations, monitor battery range, and track energy usage.
              </p>
            </div>
            <button
              onClick={openAddModal}
              id="btn-add-first-vehicle"
              className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20 hover:opacity-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Vehicle</span>
            </button>
          </div>
        )}

        {/* Vehicle Cards Grid */}
        {!loading && !error && localVehicles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {localVehicles.map((vehicle) => {
              const isSelected = selectedVehicle?.id === vehicle.id;
              const displayName = vehicle.name || `${vehicle.manufacturer} ${vehicle.model}`;
              const batteryKwh = vehicle.battery_capacity_kwh || vehicle.battery || 0;
              const rangeKm = vehicle.range || Math.round(batteryKwh * 8.5);
              const plugType = vehicle.connector_type || vehicle.connector || 'CCS2';

              return (
                <div
                  key={vehicle.id}
                  onClick={() => onSelectVehicle && onSelectVehicle(vehicle.id)}
                  className={`cursor-pointer rounded-2xl p-4 border transition-all relative group ${
                    isSelected
                      ? 'glass-highlight border-sky-500/50 shadow-lg shadow-sky-500/15'
                      : 'bg-white/[.02] border-white/[.05] hover:border-white/[.15]'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 pr-12">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate" title={displayName}>
                        {displayName}
                      </h4>
                      {vehicle.variant && (
                        <p className="text-[10px] text-slate-400 truncate">{vehicle.variant}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions (Edit / Delete / Active Badge) */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Active</span>
                      </span>
                    )}

                    <button
                      onClick={(e) => openEditModal(e, vehicle)}
                      title="Edit Vehicle"
                      className="p-1 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => promptDelete(e, vehicle)}
                      title="Delete Vehicle"
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Vehicle Spec Metrics */}
                  <div className="space-y-1.5 text-[11px] text-slate-400 mt-3 pt-3 border-t border-white/[.06]">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-sky-400" /> Rated Range:
                      </span>
                      <span className="font-bold text-sky-400">{rangeKm} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1">
                        <BatteryCharging className="w-3 h-3 text-emerald-400" /> Battery:
                      </span>
                      <span className="font-medium text-slate-200">{batteryKwh} kWh</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Connector:</span>
                      <span className="font-medium text-slate-200">{plugType}</span>
                    </div>
                    {(vehicle.max_dc_power_kw || vehicle.max_ac_power_kw) && (
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Max Charging:</span>
                        <span>
                          {vehicle.max_dc_power_kw ? `${vehicle.max_dc_power_kw}kW DC` : ''}
                          {vehicle.max_dc_power_kw && vehicle.max_ac_power_kw ? ' • ' : ''}
                          {vehicle.max_ac_power_kw ? `${vehicle.max_ac_power_kw}kW AC` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Vehicle Modal ────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg glass rounded-3xl p-6 md:p-8 border border-white/[.12] shadow-2xl space-y-5 animate-fade-in relative my-8">
            <div className="flex justify-between items-center border-b border-white/[.08] pb-4">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {modalMode === 'add' ? 'Register New Electric Vehicle' : 'Edit Vehicle Details'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Backed by VahanGrid PostgreSQL vehicle ledger.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/[.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Manufacturer *
                  </label>
                  <input
                    type="text"
                    id="input-vehicle-manufacturer"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleFormChange}
                    placeholder="e.g. Tata, MG, Hyundai"
                    required
                    className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Model *
                  </label>
                  <input
                    type="text"
                    id="input-vehicle-model"
                    name="model"
                    value={formData.model}
                    onChange={handleFormChange}
                    placeholder="e.g. Nexon EV, ZS EV"
                    required
                    className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Variant / Trim <span className="text-slate-500 lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  id="input-vehicle-variant"
                  name="variant"
                  value={formData.variant}
                  onChange={handleFormChange}
                  placeholder="e.g. Max XZ+ Lux, Long Range"
                  className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Battery Capacity (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    id="input-vehicle-battery"
                    name="battery_capacity_kwh"
                    value={formData.battery_capacity_kwh}
                    onChange={handleFormChange}
                    placeholder="e.g. 40.5"
                    required
                    className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Primary Plug Standard *
                  </label>
                  <select
                    id="select-vehicle-connector"
                    name="connector_type"
                    value={formData.connector_type}
                    onChange={handleFormChange}
                    className="w-full bg-[#0d1326] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500/50"
                  >
                    {CONNECTOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Max DC Fast Power (kW) <span className="text-slate-500 lowercase">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    id="input-vehicle-max-dc"
                    name="max_dc_power_kw"
                    value={formData.max_dc_power_kw}
                    onChange={handleFormChange}
                    placeholder="e.g. 50"
                    className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Max AC Power (kW) <span className="text-slate-500 lowercase">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    id="input-vehicle-max-ac"
                    name="max_ac_power_kw"
                    value={formData.max_ac_power_kw}
                    onChange={handleFormChange}
                    placeholder="e.g. 7.2"
                    className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/[.08]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-vehicle"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? 'Saving...'
                    : modalMode === 'add'
                    ? 'Register Vehicle'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass rounded-3xl p-6 border border-white/[.12] shadow-2xl space-y-4 animate-fade-in text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Delete Vehicle?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to remove{' '}
                <span className="text-white font-semibold">
                  {vehicleToDelete.manufacturer} {vehicleToDelete.model}
                </span>{' '}
                from your VahanGrid account? Past charging audit records will remain preserved.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                className="flex-1 py-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-vehicle"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Architectural Principles Box */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> PostgreSQL Vehicle Ledger
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your vehicles are stored in the PostgreSQL database with strict user-scoped authorization.
          The active vehicle profile informs charging station compatibility and route battery estimation across all Indian CPO networks.
        </p>
      </div>
    </div>
  );
}
