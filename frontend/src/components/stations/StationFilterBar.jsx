import { Search, X, SlidersHorizontal } from 'lucide-react';
import { OPERATORS } from '../../data/mockData';

export default function StationFilterBar({
  filterOperator,
  onOperatorChange,
  filterStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
}) {
  return (
    <div className="space-y-2.5">
      {/* Search and Operator Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Search */}
        <div className="flex-1 flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-2 focus-within:border-sky-500/40 transition-all">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search by city, highway, operator, or hub name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status quick toggle: All vs Available */}
        <div className="flex bg-white/[.04] border border-white/[.08] rounded-xl p-1 gap-1 shrink-0">
          <button
            onClick={() => onStatusChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Status
          </button>
          <button
            onClick={() => onStatusChange(filterStatus === 'available' ? 'all' : 'available')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterStatus === 'available'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Available Only
          </button>
        </div>
      </div>

      {/* Operator Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => onOperatorChange('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all cursor-pointer ${
            filterOperator === 'all'
              ? 'bg-sky-500/15 border-sky-500/30 text-sky-400'
              : 'bg-white/[.02] border-white/[.06] text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/[.04]'
          }`}
        >
          All Networks
        </button>

        {OPERATORS.map((op) => (
          <button
            key={op.id}
            onClick={() => onOperatorChange(filterOperator === op.id ? 'all' : op.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              filterOperator === op.id
                ? 'bg-sky-500/15 border-sky-500/30 text-sky-400 shadow-sm'
                : 'bg-white/[.02] border-white/[.06] text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/[.04]'
            }`}
          >
            <span>{op.logo}</span>
            <span>{op.shortName || op.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
