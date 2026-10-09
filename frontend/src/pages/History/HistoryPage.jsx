import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Zap,
  Download,
  Receipt,
  ShieldCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  Car,
} from 'lucide-react';
import { chargingService } from '../../services/chargingService';
import { formatCurrency } from '../../utils/formatters';
import CdrReceiptModal from '../../components/charging/CdrReceiptModal';

function formatSessionTimestamp(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatSessionDuration(seconds) {
  if (!seconds || seconds <= 0) return '< 1 min';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatSessionStatusChip(status) {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        classes: 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse',
      };
    case 'completed':
      return {
        label: 'Completed',
        classes: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      };
    case 'stopped':
      return {
        label: 'Stopped',
        classes: 'bg-teal-500/15 text-teal-300 border border-teal-500/30',
      };
    case 'failed':
      return {
        label: 'Failed',
        classes: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        classes: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      };
    default:
      return {
        label: status ? status.replace(/_/g, ' ') : 'Unknown',
        classes: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
      };
  }
}

export default function HistoryPage({ onNavigateToWallet }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // CDR receipt modal state
  const [cdrModal, setCdrModal] = useState({ open: false, session: null, cdr: null, loading: false, error: null });

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await chargingService.getSessions();
      setSessions(data || []);
    } catch (err) {
      console.error('[HistoryPage] Error loading charging history:', err);
      setError('Unable to load charging history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalSessions = sessions.length;
  const totalDurationSecs = sessions.reduce((acc, s) => acc + (s.duration_seconds || s.durationSeconds || 0), 0);
  const activeCount = sessions.filter((s) => s.status === 'active').length;

  const handleViewInvoice = async (session) => {
    setCdrModal({ open: true, session, cdr: null, loading: true, error: null });
    try {
      const cdr = await chargingService.getSessionCdr(session.id);
      setCdrModal((prev) => ({ ...prev, cdr, loading: false }));
    } catch (err) {
      setCdrModal((prev) => ({ ...prev, loading: false, error: err.message || 'Failed to load CDR.' }));
    }
  };

  const handleCloseCdrModal = () => {
    setCdrModal({ open: false, session: null, cdr: null, loading: false, error: null });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Audit & Records
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            Charging Session History
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Verified charging detail records (CDRs) recorded in PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="p-2 rounded-xl bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Refresh History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `vahangrid-cdr-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export CDR Records</span>
          </button>
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Recorded Sessions</span>
            <Zap className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-black font-display text-white mt-1.5">
            {totalSessions}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {activeCount > 0 ? `${activeCount} currently active` : 'All sessions finalized'}
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Charging Time</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-display text-emerald-400 mt-1.5">
            {formatSessionDuration(totalDurationSecs)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Aggregate Session Duration
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Live Telemetry Status</span>
            <ShieldCheck className="w-4 h-4 text-teal-300" />
          </div>
          <div className="text-xl font-black font-display text-teal-300 mt-1.5">
            Phase 3G Active
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            OCPP 2.0.1 Audited — Settlement Linked
          </div>
        </div>
      </div>

      {/* Sessions Container */}
      <div className="glass rounded-3xl p-5 md:p-6 border border-white/[.08] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            User Charging Records ({sessions.length})
          </h2>
          <span className="text-[10px] text-slate-400">PostgreSQL Source of Truth</span>
        </div>

        {loading ? (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="w-7 h-7 text-sky-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Loading charging history...</p>
          </div>
        ) : error ? (
          <div className="text-center py-10 space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-xs text-slate-300 max-w-sm mx-auto">{error}</p>
            <button
              onClick={fetchHistory}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-sky-300 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/[.04] border border-white/[.08] flex items-center justify-center text-slate-400 mx-auto">
              <Zap className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-white">No charging sessions recorded yet.</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Start a charging session at any available station in the network to track your live sessions and history.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const stationName = session.location?.name || session.stationName || 'Charging Hub';
              const cpoName = session.cpo?.name || session.cpoName || 'Network CPO';
              const vehicleName = session.vehicle
                ? `${session.vehicle.manufacturer} ${session.vehicle.model}`
                : session.vehicleName || 'Registered EV';
              const connectorStandard = session.connector?.standard || session.connectorStandard || 'CCS2';
              const duration = formatSessionDuration(session.duration_seconds || session.durationSeconds);
              const chip = formatSessionStatusChip(session.status);
              const isSettled = session.settlement_status === 'settled';
              const isFailed = session.settlement_status === 'failed';
              const isTerminal = session.status === 'completed' || session.status === 'stopped';

              return (
                <div
                  key={session.id}
                  className="bg-white/[.02] border border-white/[.05] hover:border-sky-500/25 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-white">
                        {cpoName} — {stationName}
                      </span>
                      {/* Differentiated Session Status Chip */}
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${chip.classes}`}
                      >
                        {chip.label}
                      </span>

                      {/* Settlement Status Chip */}
                      {isTerminal && (
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                            isSettled
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : isFailed
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          }`}
                        >
                          {isSettled
                            ? 'Settled'
                            : isFailed
                            ? 'Settlement Failed'
                            : 'Settlement Pending'}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Car className="w-3 h-3 text-slate-400" />
                        <span>{vehicleName}</span>
                      </span>
                      <span>• Plug: {connectorStandard}</span>
                      <span>• Started: {formatSessionTimestamp(session.started_at)}</span>
                      <span>• Duration: {duration}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-300">
                        {session.energy_kwh > 0
                          ? `${Number(session.energy_kwh).toFixed(2)} kWh`
                          : 'Telemetry Pending'}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold font-display">
                        {session.cost_amount > 0
                          ? formatCurrency(session.cost_amount)
                          : 'Billing at Finalization'}
                      </div>
                    </div>

                    <button
                      onClick={() => handleViewInvoice(session)}
                      className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="View Session CDR Receipt"
                      aria-label={`View CDR receipt for session at ${stationName}`}
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CDR Receipt Modal */}
      {cdrModal.open && cdrModal.session && (
        <CdrReceiptModal
          session={cdrModal.session}
          cdr={cdrModal.cdr}
          loading={cdrModal.loading}
          error={cdrModal.error}
          onClose={handleCloseCdrModal}
          onOpenTopUp={() => {
            if (onNavigateToWallet) {
              onNavigateToWallet();
            }
          }}
          onSettlementUpdated={() => {
            fetchHistory();
          }}
        />
      )}
    </div>
  );
}
