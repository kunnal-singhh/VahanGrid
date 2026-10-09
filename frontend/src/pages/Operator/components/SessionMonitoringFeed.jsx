/**
 * frontend/src/pages/Operator/components/SessionMonitoringFeed.jsx
 *
 * Phase 4E: Comprehensive Operator Charging Sessions Feed.
 *
 * Features:
 *  - Rich filters: Session status, Station, Settlement status, Date range, and Search.
 *  - High-visibility distinction between Live Active sessions and Immutable Completed records.
 *  - Server-side PII masking preservation (protecting driver privacy).
 *  - Interactive actions: "Inspect" audit modal and authorized "Remote Stop".
 *  - Preserves user filter input across auto-refreshes.
 */

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
  Search,
  Calendar,
  Eye,
  StopCircle,
  Building2,
  Receipt,
  Lock,
} from 'lucide-react';
import { formatCurrency, formatKwh, formatTimestampIST } from '../../../utils/formatters';

export default function SessionMonitoringFeed({
  sessions = [],
  pagination = { page: 1, limit: 20, total_count: 0, total_pages: 1 },
  loading = false,
  error = null,
  status = 'all',
  stationId = null,
  settlementStatus = 'all',
  search = '',
  fromDate = '',
  toDate = '',
  stations = [],
  onStatusChange,
  onStationChange,
  onSettlementStatusChange,
  onSearchChange,
  onDateRangeChange,
  onPageChange,
  onRetry,
  onInspectSession,
  onRemoteStopSession,
  theme = 'dark',
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(search || '');

  const isLight = theme === 'light';

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearchChange) {
      onSearchChange(searchInput);
    }
  };

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
        isLight ? 'border-slate-200 bg-white/90 shadow-sm text-slate-900' : 'border-white/[.08] bg-[#070d1e]/80 text-white'
      }`}
    >
      {/* Feed Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold tracking-tight">
                Charging Session Operations & Monitoring
              </h2>
              <p className="text-[11px] text-slate-400">
                Live charging telemetry, hardware status, immutable CDR settlement, and authorized operational actions
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search station, vehicle, ID..."
              className={`text-xs rounded-xl pl-8 pr-3 py-2 outline-none transition-colors w-44 sm:w-56 ${
                isLight
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 placeholder-slate-400'
                  : 'bg-white/[.04] border border-white/10 text-white placeholder-slate-500 focus:border-sky-500/40'
              }`}
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </form>

          {/* Toggle More Filters */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showFilters || stationId || settlementStatus !== 'all' || fromDate || toDate
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                : 'bg-white/[.04] text-slate-300 border-white/10 hover:bg-white/[.08]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>

          {/* Quick Status Filter */}
          <select
            value={status}
            onChange={(e) => onStatusChange && onStatusChange(e.target.value)}
            className={`text-xs rounded-xl px-3 py-2 outline-none transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 border border-slate-200 text-slate-900'
                : 'bg-white/[.04] border border-white/10 text-white focus:border-sky-500/40'
            }`}
          >
            <option value="all">All Statuses</option>
            <option value="active">Live Charging</option>
            <option value="stopped">Stopped</option>
            <option value="completed">Completed</option>
            <option value="faulted">Faulted</option>
          </select>

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

      {/* Expanded Filter Panel */}
      {showFilters && (
        <div className={`p-4 rounded-2xl border mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[.02] border-white/[.06]'
        }`}>
          {/* Station Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Station Filter
            </label>
            <select
              value={stationId || ''}
              onChange={(e) => onStationChange && onStationChange(e.target.value || null)}
              className={`w-full text-xs rounded-xl px-3 py-2 outline-none transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white border border-slate-200 text-slate-900'
                  : 'bg-slate-900/80 border border-white/10 text-white'
              }`}
            >
              <option value="">All Fleet Stations</option>
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.city || 'Station'})
                </option>
              ))}
            </select>
          </div>

          {/* Settlement Status Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Settlement Status
            </label>
            <select
              value={settlementStatus}
              onChange={(e) => onSettlementStatusChange && onSettlementStatusChange(e.target.value)}
              className={`w-full text-xs rounded-xl px-3 py-2 outline-none transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white border border-slate-200 text-slate-900'
                  : 'bg-slate-900/80 border border-white/10 text-white'
              }`}
            >
              <option value="all">All Settlement States</option>
              <option value="settled">Settled (Paid)</option>
              <option value="pending">Pending Settlement</option>
              <option value="failed">Settlement Failed</option>
              <option value="none">In Session (No CDR)</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Date Range (From — To)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => onDateRangeChange && onDateRangeChange({ from: e.target.value, to: toDate })}
                className={`w-1/2 text-xs rounded-xl px-2 py-1.5 outline-none ${
                  isLight
                    ? 'bg-white border border-slate-200 text-slate-900'
                    : 'bg-slate-900/80 border border-white/10 text-white'
                }`}
              />
              <span className="text-slate-400 text-xs">—</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => onDateRangeChange && onDateRangeChange({ from: fromDate, to: e.target.value })}
                className={`w-1/2 text-xs rounded-xl px-2 py-1.5 outline-none ${
                  isLight
                    ? 'bg-white border border-slate-200 text-slate-900'
                    : 'bg-slate-900/80 border border-white/10 text-white'
                }`}
              />
            </div>
          </div>
        </div>
      )}

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
          <span className="text-xs font-medium">No sessions match the selected filters.</span>
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
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.04]">
              {sessions.map((sess) => {
                const sessionId = sess.id || sess.session_id || 'sess';
                const isLive = sess.status === 'active' || sess.status === 'charging' || sess.status === 'pending';
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
                    className={`hover:bg-white/[.02] transition-colors ${
                      isLive ? 'bg-amber-500/[.02]' : ''
                    }`}
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
                        {stoppedTime ? `Ended: ${stoppedTime}` : (
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-blink" />
                            Live charging
                          </span>
                        )}
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

                    {/* Actions Column */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Inspect Button */}
                        <button
                          type="button"
                          onClick={() => onInspectSession && onInspectSession(sess)}
                          title="Inspect Session Audit Record"
                          className="p-1.5 rounded-lg bg-white/[.04] hover:bg-white/[.1] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Remote Stop Button (Active sessions only) */}
                        {isLive && onRemoteStopSession && (
                          <button
                            type="button"
                            onClick={() => onRemoteStopSession(sess)}
                            title="Remotely Stop Active Session"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                          >
                            <StopCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
