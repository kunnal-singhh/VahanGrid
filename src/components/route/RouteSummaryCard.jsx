import { Navigation, Clock, Zap, IndianRupee, ShieldCheck } from 'lucide-react';
import { formatDistance, formatDuration, formatKwh, formatCurrency } from '../../utils/formatters';

export default function RouteSummaryCard({
  distanceKm,
  durationMins,
  stopsCount,
  totalEnergyKwh,
  estimatedCost,
  fromLabel,
  toLabel,
}) {
  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-sky-500/20 bg-gradient-to-br from-sky-500/[.03] to-emerald-500/[.02] space-y-4">
      {/* Route Corridor Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[.06]">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
            <Navigation className="w-3 h-3" /> Planned EV Corridor
          </span>
          <div className="flex items-center gap-2 mt-1 text-sm md:text-base font-extrabold text-white truncate">
            <span className="truncate">{fromLabel}</span>
            <span className="text-slate-500">→</span>
            <span className="truncate">{toLabel}</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-2.5 text-center">
          <div className="text-[9px] uppercase font-semibold text-slate-400">Total Distance</div>
          <div className="text-xs md:text-sm font-extrabold text-white mt-0.5">
            {formatDistance(distanceKm)}
          </div>
        </div>

        <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-2.5 text-center">
          <div className="text-[9px] uppercase font-semibold text-slate-400">Drive Time</div>
          <div className="text-xs md:text-sm font-extrabold text-sky-400 mt-0.5">
            {formatDuration(durationMins)}
          </div>
        </div>

        <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-2.5 text-center">
          <div className="text-[9px] uppercase font-semibold text-slate-400">Charging Stops</div>
          <div className="text-xs md:text-sm font-extrabold text-amber-400 mt-0.5">
            {stopsCount} {stopsCount === 1 ? 'Stop' : 'Stops'}
          </div>
        </div>

        <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-2.5 text-center">
          <div className="text-[9px] uppercase font-semibold text-slate-400">Est. Energy</div>
          <div className="text-xs md:text-sm font-extrabold text-emerald-400 mt-0.5">
            {formatKwh(totalEnergyKwh)}
          </div>
        </div>
      </div>
    </div>
  );
}
