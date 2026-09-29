import { useState, useMemo } from 'react';
import {
  Zap,
  Clock,
  Wifi,
  WifiOff,
  Gauge,
  CalendarClock,
  X,
  MapPin,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Car,
  ChevronRight,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { OPERATORS } from '../../data/mockData';

const STATUS_LABELS = {
  available: { text: 'Available Now', cls: 'chip-available' },
  occupied:  { text: 'In Use', cls: 'chip-occupied' },
  reserved:  { text: 'Slot Reserved', cls: 'chip-reserved' },
  offline:   { text: 'Offline / Edge Mode', cls: 'chip-offline' },
};

const CONNECTOR_STATUS_LABELS = {
  available:   { text: 'Available', cls: 'chip-available', selectable: true },
  charging:    { text: 'In Use (Charging)', cls: 'chip-occupied', selectable: false },
  occupied:    { text: 'Occupied', cls: 'chip-occupied', selectable: false },
  reserved:    { text: 'Reserved', cls: 'chip-reserved', selectable: false },
  faulted:     { text: 'Faulted', cls: 'bg-rose-500/15 text-rose-400 border border-rose-500/25', selectable: false },
  offline:     { text: 'Offline', cls: 'chip-offline', selectable: false },
  unavailable: { text: 'Unavailable', cls: 'chip-offline', selectable: false },
};

export default function StationDetailsModal({
  station,
  onClose,
  onStartCharge,
  onReserve,
  onCancelReservation,
  isCharging = false,
  vehicles = [],
  selectedVehicle = null,
  onSelectVehicle,
  onNavigate,
}) {
  if (!station) return null;

  // Flatten all connectors across EVSEs
  const allConnectors = useMemo(() => {
    const list = [];
    if (Array.isArray(station.evses)) {
      for (const evse of station.evses) {
        if (Array.isArray(evse.connectors)) {
          for (const conn of evse.connectors) {
            list.push({
              ...conn,
              evseUid: evse.evse_uid,
              physicalRef: evse.physical_reference || evse.evse_code || evse.evse_uid,
              powerKw: conn.max_power_kw || evse.max_power_kw || station.power || 50,
            });
          }
        }
      }
    }
    return list;
  }, [station]);

  // First available connector
  const initialConnectorId = useMemo(() => {
    const availableConn = allConnectors.find((c) => c.status === 'available');
    return availableConn ? availableConn.id : allConnectors[0]?.id || null;
  }, [allConnectors]);

  const [selectedConnectorId, setSelectedConnectorId] = useState(initialConnectorId);
  const [chosenVehicleId, setChosenVehicleId] = useState(
    selectedVehicle?.id || (vehicles.length > 0 ? vehicles[0].id : null)
  );
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const op = OPERATORS.find((o) => o.id === station.operator);
  const statusInfo = STATUS_LABELS[station.status] || STATUS_LABELS.offline;
  const forecast = station.forecast || [20, 30, 50, 70, 40, 20];
  const peakHourIndex = forecast.findIndex((v) => v === Math.max(...forecast));

  const activeChosenVehicle = vehicles.find((v) => v.id === chosenVehicleId) || selectedVehicle || vehicles[0] || null;
  const activeChosenConnector = allConnectors.find((c) => c.id === selectedConnectorId) || allConnectors[0] || null;

  const isConnectorAvailable = activeChosenConnector?.status === 'available';

  const handleStartSessionClick = async () => {
    if (!activeChosenConnector) {
      setStartError('Please select a charging connector.');
      return;
    }
    if (!activeChosenVehicle) {
      setStartError('Please add or select a vehicle first.');
      return;
    }
    if (!isConnectorAvailable) {
      setStartError('This connector is not currently available for charging.');
      return;
    }

    try {
      setIsStarting(true);
      setStartError(null);
      await onStartCharge({
        connectorId: activeChosenConnector.id,
        vehicleId: activeChosenVehicle.id,
        station,
      });
    } catch (err) {
      console.error('[StationDetailsModal] Start charge failed:', err);
      setStartError(err.message || 'Failed to start charging session.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="panel-surface border border-white/[.12] rounded-3xl p-5 md:p-7 w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400 rounded-t-3xl" />

        {/* Header */}
        <div className="flex items-start justify-between mb-5 mt-1">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xl">{op?.logo || '⚡'}</span>
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: op?.accent || '#38bdf8' }}
              >
                {op?.name || station.operator}
              </span>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusInfo.cls}`}>
                {statusInfo.text}
              </span>
            </div>

            <h2 className="text-lg font-extrabold text-white leading-snug">
              {station.name}
            </h2>

            {station.address && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{station.address}</span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Stat Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-3 text-center">
            <Zap className="w-4 h-4 mx-auto mb-1 text-sky-400 opacity-80" />
            <div className="text-sm font-extrabold text-sky-400">{station.power} kW</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Speed</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-3 text-center">
            <Gauge className="w-4 h-4 mx-auto mb-1 text-emerald-400 opacity-80" />
            <div className="text-sm font-extrabold text-emerald-400">₹{station.price}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">per kWh</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-3 text-center">
            <Clock className="w-4 h-4 mx-auto mb-1 text-amber-400 opacity-80" />
            <div className="text-sm font-extrabold text-slate-200">
              {station.waitMin > 0 ? `${station.waitMin}m` : '0m'}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Wait Time</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-3 text-center">
            {station.latency > 0 ? (
              <Wifi className="w-4 h-4 mx-auto mb-1 text-sky-400 opacity-80" />
            ) : (
              <WifiOff className="w-4 h-4 mx-auto mb-1 text-rose-400 opacity-80" />
            )}
            <div className="text-sm font-extrabold text-slate-200">
              {station.latency > 0 ? `${station.latency}ms` : 'Edge'}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Telemetry</div>
          </div>
        </div>

        {/* ── Start Charging Session Setup: Connector & Vehicle Selection ── */}
        <div className="bg-white/[.02] border border-white/[.08] rounded-2xl p-4 mb-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[.06] pb-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-400" /> Start Charging Setup
            </h3>
            <span className="text-[10px] text-slate-400">Live PostgreSQL Backend</span>
          </div>

          {/* 1. Connector Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-300 block">
              1. Select Connector / Charging Bay:
            </label>

            {allConnectors.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No connector information available.</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {allConnectors.map((c) => {
                  const statusCfg = CONNECTOR_STATUS_LABELS[c.status] || CONNECTOR_STATUS_LABELS.unavailable;
                  const isSelected = selectedConnectorId === c.id;
                  const isAvailable = statusCfg.selectable;

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (isAvailable) {
                          setSelectedConnectorId(c.id);
                          setStartError(null);
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                        !isAvailable
                          ? 'opacity-50 bg-white/[.01] border-white/[.04] cursor-not-allowed'
                          : isSelected
                          ? 'bg-sky-500/15 border-sky-500/50 text-white shadow-sm cursor-pointer'
                          : 'bg-white/[.03] border-white/[.06] hover:border-white/[.15] text-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                            isSelected && isAvailable
                              ? 'border-sky-400 bg-sky-400'
                              : 'border-slate-500'
                          }`}
                        >
                          {isSelected && isAvailable && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                        </div>
                        <div>
                          <span className="font-bold text-white mr-1.5">{c.standard}</span>
                          <span className="text-[10px] text-slate-400">
                            ({c.powerKw} kW • {c.power_type || 'DC'} • {c.physicalRef})
                          </span>
                        </div>
                      </div>

                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>
                        {statusCfg.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Vehicle Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-300 block">
              2. Select Connected EV:
            </label>

            {vehicles.length === 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2 text-amber-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Add a vehicle before starting a charging session.</span>
                    <p className="text-[11px] text-amber-300/80 mt-0.5">
                      VahanGrid requires a registered vehicle to validate charging protocols and monitor capacity.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onNavigate) onNavigate('profile');
                  }}
                  className="w-full py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Car className="w-3.5 h-3.5" /> Go to Profile & Add Vehicle
                </button>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={chosenVehicleId || ''}
                  onChange={(e) => {
                    setChosenVehicleId(e.target.value);
                    if (onSelectVehicle) onSelectVehicle(e.target.value);
                    setStartError(null);
                  }}
                  className="w-full bg-white/[.04] border border-white/[.1] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500/50 cursor-pointer"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                      {v.manufacturer} {v.model} {v.variant ? `(${v.variant})` : ''} — {v.connector_type} ({v.battery_capacity_kwh} kWh)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {startError && (
            <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3 flex items-start gap-2 text-rose-400 text-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Cannot Start Session</span>
                <p className="text-[11px] text-rose-300/80 mt-0.5">{startError}</p>
              </div>
              <button
                onClick={() => setStartError(null)}
                className="text-rose-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 6-Hour Occupancy Forecast */}
        {station.status !== 'offline' && (
          <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 mb-5">
            <div className="flex justify-between items-center text-xs mb-3">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-sky-400" /> Hourly Hub Utilization
              </span>
              <span className="text-slate-400 text-[10px]">
                Queue: {station.queue || 0} waiting
              </span>
            </div>

            <div className="flex items-end gap-1.5 h-16 pt-2">
              {forecast.map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className="w-full rounded-t-sm transition-all"
                    style={{
                      height: `${Math.max(val, 6)}%`,
                      backgroundColor:
                        val > 70
                          ? 'rgba(244, 63, 94, 0.7)'
                          : val > 40
                          ? 'rgba(245, 158, 11, 0.7)'
                          : 'rgba(16, 185, 129, 0.7)',
                    }}
                  />
                  <span className="text-[9px] text-slate-400 font-medium">+{idx + 1}h</span>
                </div>
              ))}
            </div>

            {peakHourIndex >= 0 && (
              <p className="text-[10px] text-slate-400 mt-2.5">
                Peak expected in {peakHourIndex + 1} hr ({Math.max(...forecast)}% load).
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {isCharging ? (
            <div className="w-full py-3 px-4 rounded-xl text-center text-xs font-semibold bg-sky-500/15 border border-sky-500/30 text-sky-300 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <span>You already have an active charging session ongoing.</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleStartSessionClick}
                disabled={isStarting || vehicles.length === 0 || !isConnectorAvailable}
                className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] ${
                  isStarting || vehicles.length === 0 || !isConnectorAvailable
                    ? 'bg-slate-700/50 text-slate-400 border border-white/[.06] cursor-not-allowed'
                    : 'bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 hover:from-sky-300 hover:to-emerald-300 shadow-sky-500/20 cursor-pointer'
                }`}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Starting charging session...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Start Session</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onReserve && onReserve(station)}
                className="h-12 px-5 rounded-xl font-bold text-sm bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-all active:scale-[0.98] cursor-pointer"
              >
                Reserve Slot
              </button>
            </div>
          )}

          {station.status === 'occupied' && (
            <div className="w-full py-2.5 px-3 rounded-xl text-center text-xs font-medium bg-white/[.02] border border-white/[.05] text-slate-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Charger currently occupied — ~{station.waitMin} min remaining</span>
            </div>
          )}

          {station.status === 'reserved' && (
            <div className="w-full flex gap-2">
              <div className="flex-1 py-2 px-3 rounded-xl text-center text-xs font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Reserved for you (30m hold)
              </div>
              <button
                type="button"
                onClick={() => onCancelReservation && onCancelReservation(station)}
                className="px-3 rounded-xl text-xs font-bold bg-white/[.06] border border-white/[.1] text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
