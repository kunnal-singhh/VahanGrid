import {
  MapPin,
  Zap,
  Activity,
  IndianRupee,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { formatCurrency, formatKwh } from '../../../utils/formatters';

export default function OperatorOverviewCards({
  overviewData,
  loading = false,
  theme = 'dark',
}) {
  const stations = overviewData?.stations || { total: 0, online: 0, offline: 0 };
  const rawConnectors = overviewData?.connectors || {};
  const connectorTotal = rawConnectors.total || 0;
  const availCount = rawConnectors.available ?? rawConnectors.breakdown?.available ?? 0;
  const busyCount = rawConnectors.charging ?? rawConnectors.occupied ?? rawConnectors.breakdown?.occupied ?? 0;
  const faultCount = rawConnectors.faulted ?? rawConnectors.breakdown?.faulted ?? 0;
  const offCount = rawConnectors.offline ?? rawConnectors.unavailable ?? rawConnectors.breakdown?.unavailable ?? 0;

  const activeSessionsCount =
    overviewData?.active_sessions_count ??
    overviewData?.sessions?.active_now ??
    0;

  const metrics = overviewData?.metrics || {
    total_sessions: 0,
    total_energy_kwh: 0,
    total_revenue_inr: 0,
    settled_revenue_inr: 0,
    unsettled_revenue_inr: 0,
    settlement_rate_percent: 0,
  };

  const periodLabel = overviewData?.reporting_period || overviewData?.period || '30d';

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-36 rounded-2xl p-5 border ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-white/[.03] border-white/[.06]'
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Stations & Connectivity */}
        <div
          className={`glass-card rounded-2xl p-5 border transition-all ${
            theme === 'light' ? 'border-slate-200 bg-white/90' : 'border-white/[.08]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Total Stations</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              {stations.total}
            </span>
            <span className="text-xs text-slate-400 font-medium">Locations</span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/[.06] text-xs">
            <span className="flex items-center gap-1 font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-blink" />
              {stations.online} Online
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-400">
              {stations.offline} Offline
            </span>
          </div>
        </div>

        {/* Card 2: Connectors & State Distribution */}
        <div
          className={`glass-card rounded-2xl p-5 border transition-all ${
            theme === 'light' ? 'border-slate-200 bg-white/90' : 'border-white/[.08]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Connector Fleet</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              {connectorTotal}
            </span>
            <span className="text-xs text-slate-400 font-medium">Points</span>
          </div>

          {/* Mini progress bar of connector states */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 flex overflow-hidden my-2">
            <div
              style={{
                width: `${connectorTotal > 0 ? (availCount / connectorTotal) * 100 : 0}%`,
              }}
              className="bg-emerald-400 transition-all"
              title="Available"
            />
            <div
              style={{
                width: `${connectorTotal > 0 ? (busyCount / connectorTotal) * 100 : 0}%`,
              }}
              className="bg-sky-400 transition-all"
              title="Occupied"
            />
            <div
              style={{
                width: `${connectorTotal > 0 ? (faultCount / connectorTotal) * 100 : 0}%`,
              }}
              className="bg-rose-400 transition-all"
              title="Faulted"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span className="text-emerald-400 font-semibold">{availCount} Avail</span>
            <span className="text-sky-400 font-semibold">{busyCount} Busy</span>
            <span className="text-rose-400 font-semibold">{faultCount} Fault</span>
          </div>
        </div>

        {/* Card 3: Active Charging Now */}
        <div
          className={`glass-card rounded-2xl p-5 border transition-all ${
            theme === 'light' ? 'border-slate-200 bg-white/90' : 'border-white/[.08]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Live Charging Now</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl lg:text-3xl font-black text-amber-400 tracking-tight">
              {activeSessionsCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">Active Sessions</span>
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-white/[.06] text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-blink" />
            <span>Real-time drawing power across network</span>
          </div>
        </div>

        {/* Card 4: Energy Delivered (Period) */}
        <div
          className={`glass-card rounded-2xl p-5 border transition-all ${
            theme === 'light' ? 'border-slate-200 bg-white/90' : 'border-white/[.08]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Delivered Energy</span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              {formatKwh(metrics.total_energy_kwh)}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[.06] text-xs text-slate-400">
            <span>Period: {periodLabel}</span>
            <span className="font-semibold text-slate-200">{metrics.total_sessions} Sessions</span>
          </div>
        </div>
      </div>

      {/* Authoritative Financial Health & Settlement Banner */}
      <div
        className={`glass rounded-2xl p-5 border flex flex-col md:flex-row md:items-center justify-between gap-5 ${
          theme === 'light'
            ? 'border-emerald-500/20 bg-emerald-500/[.03]'
            : 'border-emerald-500/20 bg-gradient-to-r from-emerald-500/[.05] via-teal-500/[.03] to-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Authoritative Financial Revenue ({periodLabel})
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Immutable CDR Sourced
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified billing and automated wallet settlements across operator charging stations.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Total Billed
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatCurrency(metrics.total_revenue_inr)}
            </span>
          </div>

          <div className="border-l border-white/[.08] pl-6">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
              Settled Revenue
            </span>
            <span className="text-lg font-black text-emerald-400 font-mono">
              {formatCurrency(metrics.settled_revenue_inr)}
            </span>
          </div>

          <div className="border-l border-white/[.08] pl-6">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">
              Unsettled / Pending
            </span>
            <span className="text-lg font-black text-amber-400 font-mono">
              {formatCurrency(metrics.unsettled_revenue_inr)}
            </span>
          </div>

          <div className="border-l border-white/[.08] pl-6">
            <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider block">
              Settlement Rate
            </span>
            <span className="text-lg font-black text-sky-400 font-mono">
              {metrics.settlement_rate_percent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
