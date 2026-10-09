import { useState } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Radio,
  Layers,
  Activity,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building2,
  X
} from 'lucide-react';
import { formatTimestampIST } from '../../../utils/formatters';

export default function StationFleetTable({
  stations = [],
  pagination = { page: 1, limit: 10, total_count: 0, total_pages: 1 },
  loading = false,
  error = null,
  search = '',
  onSearchChange,
  status = 'all',
  onStatusChange,
  onPageChange,
  onRetry,
  theme = 'dark',
}) {
  const [searchInput, setSearchInput] = useState(search);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearchChange) onSearchChange(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    if (onSearchChange) onSearchChange('');
  };

  return (
    <div
      className={`glass rounded-3xl p-5 md:p-6 border transition-all ${
        theme === 'light' ? 'border-slate-200 bg-white/90 shadow-sm' : 'border-white/[.08] bg-[#070d1e]/80'
      }`}
    >
      {/* Table Header & Search/Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white tracking-tight">
                Charging Station Inventory
              </h2>
              <p className="text-[11px] text-slate-400">
                Live EVSE telemetry, connector capacity, and OCPP communication status
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative min-w-[220px] sm:min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search station name or city..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={`w-full text-xs rounded-xl pl-9 pr-8 py-2 outline-none transition-all ${
                theme === 'light'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 focus:border-sky-500'
                  : 'bg-white/[.04] border border-white/10 text-white focus:border-sky-500/40'
              }`}
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Operational Status Filter */}
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
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Refresh Button */}
          {onRetry && (
            <button
              onClick={onRetry}
              title="Refresh Station Fleet"
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
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <span className="text-xs">Loading fleet stations...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-3 text-center p-4">
          <AlertTriangle className="w-8 h-8 opacity-75" />
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
      ) : stations.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <MapPin className="w-8 h-8 opacity-40" />
          <span className="text-xs font-medium">No stations match the selected filters.</span>
          {searchInput && (
            <button
              onClick={handleClearSearch}
              className="mt-2 text-xs text-sky-400 hover:underline cursor-pointer"
            >
              Clear search query
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Station & Location</th>
                <th className="py-3 px-3">OCPP Connectivity</th>
                <th className="py-3 px-3">Hardware Capacity</th>
                <th className="py-3 px-3">Connector Status Breakdown</th>
                <th className="py-3 px-3 text-center">Active Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.04]">
              {stations.map((st) => {
                const ocppOnline = Boolean(
                  st.ocpp?.ws_connected || st.ocpp?.status === 'online' || st.ocpp?.is_online
                );
                const chargePointId = st.ocpp?.charge_point_id || st.ocpp?.station_charge_point_id || 'N/A';
                const lastSeen = st.ocpp?.last_seen_at || st.ocpp?.last_heartbeat
                  ? formatTimestampIST(st.ocpp.last_seen_at || st.ocpp.last_heartbeat)
                  : 'Never';

                const breakdown = {
                  available: st.connectors_breakdown?.available ?? 0,
                  busy: st.connectors_breakdown?.charging ?? st.connectors_breakdown?.occupied ?? 0,
                  faulted: st.connectors_breakdown?.faulted ?? 0,
                  offline: st.connectors_breakdown?.offline ?? st.connectors_breakdown?.unavailable ?? 0,
                };

                const cityName = st.address?.city || st.city || '—';
                const stateName = st.address?.state || st.state || '';

                return (
                  <tr
                    key={st.id}
                    className="hover:bg-white/[.02] transition-colors"
                  >
                    {/* Station Name & City */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-white text-[13px]">{st.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-sky-400" />
                        <span>{cityName}{stateName ? `, ${stateName}` : ''}</span>
                      </div>
                    </td>

                    {/* OCPP Status & ID */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            ocppOnline ? 'bg-emerald-400 animate-blink' : 'bg-slate-500'
                          }`}
                        />
                        <span
                          className={`font-bold ${
                            ocppOnline ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {ocppOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        CP-ID: <span className="text-slate-300 font-semibold">{chargePointId}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        Last seen: {lastSeen}
                      </div>
                    </td>

                    {/* Capacity */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-white">
                        {st.evse_count} {st.evse_count === 1 ? 'EVSE' : 'EVSEs'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {st.connector_count} {st.connector_count === 1 ? 'Connector' : 'Connectors'}
                      </div>
                    </td>

                    {/* Connector Status Breakdown Chips */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {breakdown.available} Avail
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          {breakdown.busy} Busy
                        </span>
                        {breakdown.faulted > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {breakdown.faulted} Fault
                          </span>
                        )}
                        {breakdown.offline > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            {breakdown.offline} Offline
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Active Sessions */}
                    <td className="py-3.5 px-3 text-center">
                      {st.active_sessions_count > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Activity className="w-3 h-3 animate-pulse" />
                          {st.active_sessions_count} Live
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">0</span>
                      )}
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
            <span className="font-bold text-white">{pagination.total_pages}</span> ({pagination.total ?? pagination.total_count ?? 0} total stations)
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
