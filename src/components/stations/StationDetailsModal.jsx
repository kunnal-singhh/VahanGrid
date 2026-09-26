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
  AlertCircle
} from 'lucide-react';
import { OPERATORS } from '../../data/mockData';

const STATUS_LABELS = {
  available: { text: 'Available Now', cls: 'chip-available' },
  occupied:  { text: 'In Use', cls: 'chip-occupied' },
  reserved:  { text: 'Slot Reserved', cls: 'chip-reserved' },
  offline:   { text: 'Offline / Edge Mode', cls: 'chip-offline' },
};

export default function StationDetailsModal({
  station,
  onClose,
  onStartCharge,
  onReserve,
  onCancelReservation,
  isCharging = false,
}) {
  if (!station) return null;

  const op = OPERATORS.find((o) => o.id === station.operator);
  const statusInfo = STATUS_LABELS[station.status] || STATUS_LABELS.offline;
  const forecast = station.forecast || [20, 30, 50, 70, 40, 20];
  const peakHourIndex = forecast.findIndex((v) => v === Math.max(...forecast));

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="panel-surface border border-white/[.12] rounded-3xl p-5 md:p-7 w-full max-w-[460px] max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up relative"
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

        {/* Connector Specs */}
        <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-3.5 mb-5 space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-400">
            <span>Connector Standard</span>
            <span className="font-bold text-white bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded text-[11px]">
              {station.connector}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Operating Voltage / Current</span>
            <span className="font-medium text-slate-200">
              {station.voltage || 415}V / {station.current || 0}A
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Operational Temperature</span>
            <span className="font-medium text-slate-200">{station.temp || 32}°C</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Roaming Protocol</span>
            <span className="font-medium text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> OCPI 2.2.1 Unified
            </span>
          </div>
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
        <div className="flex gap-3 pt-1">
          {station.status === 'available' && (
            <>
              <button
                onClick={() => onStartCharge(station)}
                disabled={isCharging}
                className="flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 hover:from-sky-300 hover:to-emerald-300 transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98] cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-slate-950" /> Start Session
              </button>
              <button
                onClick={() => onReserve(station)}
                className="h-12 px-5 rounded-xl font-bold text-sm bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-all active:scale-[0.98] cursor-pointer"
              >
                Reserve Slot
              </button>
            </>
          )}

          {station.status === 'occupied' && (
            <div className="w-full py-3.5 px-4 rounded-xl text-center text-sm font-semibold bg-white/[.03] border border-white/[.06] text-slate-400 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Charger currently occupied — ~{station.waitMin} min remaining</span>
            </div>
          )}

          {station.status === 'reserved' && (
            <div className="w-full flex gap-2">
              <div className="flex-1 py-3 px-3 rounded-xl text-center text-xs font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Reserved for you (30m hold)
              </div>
              <button
                onClick={() => onCancelReservation(station)}
                className="px-4 rounded-xl text-xs font-bold bg-white/[.06] border border-white/[.1] text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {station.status === 'offline' && (
            <button
              onClick={() => onStartCharge(station)}
              disabled={isCharging}
              className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-all cursor-pointer"
            >
              <WifiOff className="w-4 h-4" /> Start Charge (Edge Gateway Mode)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
