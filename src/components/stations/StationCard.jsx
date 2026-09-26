import { Zap, Gauge, Clock, ShieldCheck, MapPin } from 'lucide-react';
import { OPERATORS } from '../../data/mockData';

const STATUS_BADGES = {
  available: { label: 'AVAILABLE', cls: 'chip-available' },
  occupied:  { label: 'OCCUPIED',  cls: 'chip-occupied' },
  reserved:  { label: 'RESERVED',  cls: 'chip-reserved' },
  offline:   { label: 'OFFLINE',   cls: 'chip-offline' },
};

export default function StationCard({ station, onSelect, isSelected = false }) {
  const op = OPERATORS.find((o) => o.id === station.operator);
  const badge = STATUS_BADGES[station.status] || STATUS_BADGES.offline;

  return (
    <div
      onClick={() => onSelect(station)}
      className={`group cursor-pointer rounded-2xl p-4 md:p-5 flex flex-col justify-between space-y-3.5 transition-all duration-200 border ${
        isSelected
          ? 'glass-highlight border-sky-500/50 shadow-lg shadow-sky-500/10'
          : 'glass hover:border-sky-500/30 hover:bg-white/[.04]'
      }`}
    >
      {/* Top Header: Operator & Status */}
      <div>
        <div className="flex justify-between items-start mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">{op?.logo || '⚡'}</span>
            <span
              className="text-[11px] font-bold uppercase tracking-wider truncate"
              style={{ color: op?.accent || '#38bdf8' }}
            >
              {op?.name || station.operator}
            </span>
          </div>

          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 tracking-wide ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>

        <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors line-clamp-1">
          {station.name.split('—')[1]?.trim() || station.name}
        </h3>

        {station.address && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1 truncate">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">{station.address}</span>
          </p>
        )}
      </div>

      {/* Metrics Row: Power, Price, Connector */}
      <div className="grid grid-cols-3 gap-2 bg-white/[.02] border border-white/[.05] rounded-xl p-2.5 text-center">
        <div>
          <div className="text-[9px] uppercase font-semibold text-slate-400">Power</div>
          <div className="text-xs font-bold text-white mt-0.5 flex items-center justify-center gap-0.5">
            <Zap className="w-3 h-3 text-sky-400" />
            <span>{station.power} kW</span>
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase font-semibold text-slate-400">Tariff</div>
          <div className="text-xs font-bold text-emerald-400 mt-0.5">
            ₹{station.price}/kWh
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase font-semibold text-slate-400">Plug</div>
          <div className="text-xs font-bold text-slate-200 mt-0.5">
            {station.connector}
          </div>
        </div>
      </div>

      {/* Bottom Telemetry & Wait time */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[.04] text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>
            {station.waitMin > 0 ? `Wait: ~${station.waitMin} min` : 'No Queue Wait'}
          </span>
        </div>

        <div className="flex items-center gap-1 font-semibold text-slate-300">
          <ShieldCheck className="w-3 h-3 text-sky-400" />
          <span>{station.uptime || 99}% Uptime</span>
        </div>
      </div>
    </div>
  );
}
