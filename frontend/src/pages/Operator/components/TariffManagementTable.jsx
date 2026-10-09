/**
 * frontend/src/pages/Operator/components/TariffManagementTable.jsx
 *
 * Phase 4D: Operator Tariff Management Table Component.
 *
 * Capabilities:
 *  - Displays CPO tariffs with real-time multi-tenant scoping.
 *  - Detailed pricing breakdowns (energy rate, session fee, duration fee, idle penalty, grace period, GST).
 *  - Distinguishes Network-Wide CPO Default tariffs from Station-Specific overrides.
 *  - Filters: Search by plan/station name, Status (Active/Inactive), Scope (Network-Wide / Station-Specific).
 *  - Actions: Create New Tariff, Edit Tariff, Quick Activate/Deactivate Toggle.
 *  - Loading, empty, and error states with responsive layout and theme compatibility.
 */

import { useState, useMemo } from 'react';
import {
  Tag,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Coins,
  Percent,
  Calendar,
  Layers,
  Power,
  X,
  Info
} from 'lucide-react';
import { formatTimestampIST } from '../../../utils/formatters';

export default function TariffManagementTable({
  tariffs = [],
  loading = false,
  error = null,
  onRefresh,
  onOpenCreateTariff,
  onEditTariff,
  onToggleTariffStatus,
  theme = 'dark',
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'network' | 'station'

  // Filtered Tariffs
  const filteredTariffs = useMemo(() => {
    return tariffs.filter((t) => {
      // Status Filter
      if (statusFilter === 'active' && !t.is_active) return false;
      if (statusFilter === 'inactive' && t.is_active) return false;

      // Scope Filter
      if (scopeFilter === 'network' && t.location_id) return false;
      if (scopeFilter === 'station' && !t.location_id) return false;

      // Search Query
      if (search.trim()) {
        const query = search.toLowerCase();
        const nameMatch = (t.name || '').toLowerCase().includes(query);
        const locMatch = (t.location_name || '').toLowerCase().includes(query);
        const descMatch = (t.description || '').toLowerCase().includes(query);
        if (!nameMatch && !locMatch && !descMatch) return false;
      }

      return true;
    });
  }, [tariffs, search, statusFilter, scopeFilter]);

  const isLight = theme === 'light';

  return (
    <div
      className={`glass rounded-3xl p-5 md:p-6 border transition-all ${
        isLight ? 'border-slate-200 bg-white/90 shadow-sm' : 'border-white/[.08] bg-[#070d1e]/80'
      }`}
    >
      {/* ── Table Header & Controls ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white tracking-tight">
                Tariff Plans & Pricing Rules
              </h2>
              <p className="text-[11px] text-slate-400">
                Manage base energy pricing, session activation fees, idle penalty rates, and station overrides
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[200px] sm:min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search plan or station..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full text-xs rounded-xl pl-9 pr-8 py-2 outline-none transition-all ${
                isLight
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 focus:border-amber-500'
                  : 'bg-white/[.04] border border-white/10 text-white focus:border-amber-500/40'
              }`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2 outline-none cursor-pointer ${
                isLight
                  ? 'bg-slate-100 border border-slate-200 text-slate-900'
                  : 'bg-white/[.04] border border-white/10 text-white focus:border-amber-500/40'
              }`}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Scope Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className={`text-xs rounded-xl px-3 py-2 outline-none cursor-pointer ${
                isLight
                  ? 'bg-slate-100 border border-slate-200 text-slate-900'
                  : 'bg-white/[.04] border border-white/10 text-white focus:border-amber-500/40'
              }`}
            >
              <option value="all">All Scopes</option>
              <option value="network">Network-Wide Default</option>
              <option value="station">Station-Specific</option>
            </select>
          </div>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Tariff Plans"
              disabled={loading}
              className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] border border-white/10 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          )}

          {/* + Create New Tariff Button */}
          {onOpenCreateTariff && (
            <button
              onClick={onOpenCreateTariff}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tariff</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Table Content Area ── */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <span className="text-xs">Loading CPO tariff plans...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-3 text-center p-4">
          <AlertTriangle className="w-8 h-8 opacity-75" />
          <p className="text-xs font-semibold">{error}</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      ) : filteredTariffs.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Tag className="w-8 h-8 opacity-40 text-amber-400" />
          <span className="text-xs font-medium">No tariff plans match the selected criteria.</span>
          {search || statusFilter !== 'all' || scopeFilter !== 'all' ? (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setScopeFilter('all');
              }}
              className="mt-2 text-xs text-amber-400 hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          ) : (
            onOpenCreateTariff && (
              <button
                onClick={onOpenCreateTariff}
                className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer"
              >
                + Create First Tariff Plan
              </button>
            )
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Plan Name & Scope</th>
                <th className="py-3 px-3">Energy & Session Rates</th>
                <th className="py-3 px-3">Duration & Idle Fees</th>
                <th className="py-3 px-3">Tax (GST)</th>
                <th className="py-3 px-3">Validity Window</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.04]">
              {filteredTariffs.map((t) => {
                const isStationSpecific = Boolean(t.location_id);
                const pricePerKwh = Number(t.price_per_kwh || 0).toFixed(2);
                const sessionFee = Number(t.session_fee || 0).toFixed(2);
                const pricePerMin = Number(t.price_per_minute || 0).toFixed(2);
                const idleFee = Number(t.idle_fee_per_minute || 0).toFixed(2);
                const taxPercent = (Number(t.tax_rate ?? 0.18) * 100).toFixed(1);

                const validFromStr = t.valid_from ? formatTimestampIST(t.valid_from) : 'Immediate';
                const validToStr = t.valid_to ? formatTimestampIST(t.valid_to) : 'Indefinite';

                return (
                  <tr key={t.id} className="hover:bg-white/[.02] transition-colors">
                    {/* Plan Name & Scope */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-white text-[13px]">{t.name}</div>
                      {t.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {t.description}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-1.5">
                        {isStationSpecific ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            <Building2 className="w-3 h-3" />
                            <span>Station: {t.location_name || 'Assigned Station'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Layers className="w-3 h-3" />
                            <span>Network-Wide Default (All Hubs)</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Energy & Session Rates */}
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-emerald-400 text-xs">
                        ₹{pricePerKwh} <span className="text-[10px] text-slate-400 font-normal">/ kWh</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Session Fee: <span className="text-slate-200 font-medium">₹{sessionFee}</span>
                      </div>
                    </td>

                    {/* Duration & Idle Rates */}
                    <td className="py-3.5 px-3">
                      <div className="text-[11px] text-slate-300">
                        Duration: <span className="font-semibold text-white">₹{pricePerMin}</span>/min
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Idle: <span className="text-amber-400 font-semibold">₹{idleFee}</span>/min
                        {t.grace_period_minutes > 0 && (
                          <span className="text-slate-500"> ({t.grace_period_minutes}m grace)</span>
                        )}
                      </div>
                    </td>

                    {/* Tax (GST) */}
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {taxPercent}% GST
                      </span>
                    </td>

                    {/* Validity Window */}
                    <td className="py-3.5 px-3 text-[11px] text-slate-400 font-mono">
                      <div>From: <span className="text-slate-300">{validFromStr}</span></div>
                      <div>To: <span className="text-slate-300">{validToStr}</span></div>
                    </td>

                    {/* Status Pill */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          t.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Toggle Active Button */}
                        {onToggleTariffStatus && (
                          <button
                            type="button"
                            onClick={() => onToggleTariffStatus(t)}
                            title={t.is_active ? 'Deactivate Tariff' : 'Activate Tariff'}
                            className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                              t.is_active
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Edit Button */}
                        {onEditTariff && (
                          <button
                            type="button"
                            onClick={() => onEditTariff(t)}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Edit Tariff Pricing & Scope"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
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

      {/* Footer Info Notice */}
      <div className="mt-4 pt-3 border-t border-white/[.06] text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Tariff precedence: Connector &gt; EVSE &gt; Station &gt; Network Default &gt; Global Fallback. Historical sessions remain immutable.
          </span>
        </div>
        <div className="text-slate-500 font-mono text-[10px]">
          Showing {filteredTariffs.length} of {tariffs.length} plans
        </div>
      </div>
    </div>
  );
}
