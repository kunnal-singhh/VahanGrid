import { useState } from 'react';
import {
  Zap,
  Filter,
  RefreshCw,
  Clock,
  Car,
  MapPin,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { formatCurrency, formatKwh, formatTimestampIST } from '../../../utils/formatters';

export default function SessionMonitoringFeed({
  sessions = [],
  pagination = { page: 1, limit: 20, total_count: 0, total_pages: 1 },
  loading = false,
  error = null,
  status = 'all',
  onStatusChange,
  onPageChange,
  onRetry,
  theme = 'dark',
}) {
  const getSettlementBadge = (cdr) => {
    if (!cdr) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
          In Session
        </span>
      );
    }

    switch (cdr.settlement_status) {
      case 'settled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Settled
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  const getStatusBadge = (sessionStatus) => {
    switch (sessionStatus) {
      case 'active':
      case 'charging':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-blink" />
            Charging
          </span>
        );
      case 'stopped':
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-300 border border-slate-500/20">
            Stopped
          </span>
        );
      case 'faulted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Faulted
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-400">
            {sessionStatus}
          </span>
        );
    }
  };

  return (
    <div
      className={`glass rounded-3xl p-5 md:p-6 border transition-all ${
        theme === 'light' ? 'border-slate-200 bg-white/90 shadow-sm' : 'border-white/[.08] bg-[#070d1e]/80'
      }`}
    >
      {/* Feed Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white tracking-tight">
                Charging Session Monitor
              </h2>
              <p className="text-[11px] text-slate-400">
                Audited charging events, energy delivered, and immutable CDR settlement verification
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={status}
              onChange={(e) => onStatusChange && onStatusChange(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2 outline-none transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900'
                  : 'bg-white/[.04] border border-white/10 text-white focus:border-sky-500/40'
              }`}
            >
              <option value="all">All Sessions</option>
              <option value="active">Charging (Live)</option>
              <option value="stopped">Stopped</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Refresh Button */}
          {onRetry && (
            <button
              onClick={onRetry}
              title="Refresh Sessions Feed"
              disabled={loading}
              className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] border border-white/10 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Table Content Area */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <span className="text-xs">Loading charging sessions...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-3 text-center p-4">
          <AlertCircle className="w-8 h-8 opacity-75" />
          <p className="text-xs font-semibold">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      ) : sessions.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Clock className="w-8 h-8 opacity-40" />
          <span className="text-xs font-medium">No sessions match the selected filter.</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Driver & Session</th>
                <th className="py-3 px-3">Vehicle & Hardware</th>
                <th className="py-3 px-3">Location & Station</th>
                <th className="py-3 px-3">Timeline</th>
                <th className="py-3 px-3">Energy & Cost</th>
                <th className="py-3 px-3 text-center">CDR Settlement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.04]">
              {sessions.map((sess) => {
                const sessionId = sess.id || sess.session_id || 'sess';
                const driverName = sess.driver?.name || sess.driver?.display_name || 'Driver';
                const vehicleDesc =
                  sess.driver?.vehicle ||
                  (sess.vehicle?.make && sess.vehicle?.model
                    ? `${sess.vehicle.make} ${sess.vehicle.model}`
                    : 'EV Model');

                const stationName = sess.station?.name || 'Charging Station';
                const city = sess.station?.city || '';

                const hardware = sess.hardware?.standard
                  ? `EVSE ${sess.hardware.evse_uid || '1'} • #${sess.hardware.connector_code || '1'} (${sess.hardware.standard})`
                  : sess.hardware
                  ? `EVSE ${sess.hardware.evse_id || '1'} • #${sess.hardware.connector_id || '1'} (${sess.hardware.connector_type || 'Type 2'})`
                  : 'Connector';

                const startedTime = sess.started_at ? formatTimestampIST(sess.started_at) : '—';
                const stoppedTime = sess.ended_at || sess.stopped_at ? formatTimestampIST(sess.ended_at || sess.stopped_at) : null;
                const energyVal = sess.energy_kwh ?? sess.total_energy_kwh ?? 0;
                const costVal = sess.cost_amount ?? sess.total_cost_inr ?? 0;

                return (
                  <tr
                    key={sessionId}
                    className="hover:bg-white/[.02] transition-colors"
                  >
                    {/* Masked Driver & State */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                          {driverName.slice(0, 1)}
                        </div>
                        <span className="font-bold text-white text-[13px]">{driverName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(sess.status)}
                        <span className="text-[10px] text-slate-500 font-mono">
                          #{String(sessionId).slice(0, 8)}
                        </span>
                      </div>
                    </td>

                    {/* Vehicle & Hardware Details */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-sky-400" />
                        <span>{vehicleDesc}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        {hardware}
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-white truncate max-w-[180px]">{stationName}</div>
                      {city && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-sky-400" />
                          <span>{city}</span>
                        </div>
                      )}
                    </td>

                    {/* Timeline */}
                    <td className="py-3.5 px-3">
                      <div className="text-[11px] text-slate-300 font-medium">
                        Started: {startedTime}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {stoppedTime ? `Ended: ${stoppedTime}` : 'Active drawing power'}
                      </div>
                    </td>

                    {/* Energy & Cost */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-emerald-400 font-mono">
                        {formatKwh(energyVal)}
                      </div>
                      <div className="text-[11px] font-bold text-white font-mono mt-0.5">
                        {formatCurrency(costVal)}
                      </div>
                    </td>

                    {/* Settlement Status */}
                    <td className="py-3.5 px-3 text-center">
                      {getSettlementBadge(sess.cdr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {!loading && !error && (pagination.total ?? pagination.total_count ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-4 border-t border-white/[.06] text-xs text-slate-400">
          <div>
            Showing Page <span className="font-bold text-white">{pagination.page}</span> of{' '}
            <span className="font-bold text-white">{pagination.total_pages}</span> ({pagination.total ?? pagination.total_count ?? 0} total sessions)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange && onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[.06] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => onPageChange && onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/[.06] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
