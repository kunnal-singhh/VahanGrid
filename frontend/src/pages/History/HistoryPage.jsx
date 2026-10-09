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
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { chargingService } from '../../services/chargingService';
import { formatCurrency, formatKwh, formatDuration } from '../../utils/formatters';

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

function formatInrAmount(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return `\u20B9${Number(amount).toFixed(2)}`;
}

/**
 * CDR Receipt Modal — displays the authoritative finalized CDR for a session.
 */
function CdrReceiptModal({ session, cdr, loading, error, onClose }) {
  const stationName = session.location?.name || session.stationName || 'Charging Station';
  const cpoName = session.cpo?.name || session.cpoName || 'Network CPO';
  const vehicleName = session.vehicle
    ? `${session.vehicle.manufacturer} ${session.vehicle.model}`
    : session.vehicleName || 'Registered EV';
  const sessionId = session.id?.slice(0, 8) ?? 'N/A';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Session CDR Receipt"
    >
      <div className="w-full max-w-md glass border border-white/[.12] rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Session Receipt</h2>
              <p className="text-[10px] text-slate-400">#{sessionId}…</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close receipt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Session meta */}
          <div className="space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Station</span>
              <span className="text-slate-200 font-medium">{cpoName} — {stationName}</span>
            </div>
            <div className="flex justify-between">
              <span>Vehicle</span>
              <span className="text-slate-200 font-medium">{vehicleName}</span>
            </div>
            <div className="flex justify-between">
              <span>Started</span>
              <span className="text-slate-200">{formatSessionTimestamp(session.started_at)}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="text-slate-200">{formatSessionDuration(session.duration_seconds || session.durationSeconds)}</span>
            </div>
          </div>

          <div className="border-t border-white/[.06]" />

          {loading ? (
            <div className="text-center py-6 space-y-2">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading CDR record…</p>
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300">CDR could not be retrieved.</p>
              <p className="text-[10px] text-slate-500">{error}</p>
            </div>
          ) : cdr ? (
            <>
              {/* CDR line items */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Energy delivered</span>
                  <span className="text-slate-200 font-medium">
                    {Number(cdr.total_energy_kwh ?? cdr.energy_kwh ?? session.energy_kwh ?? 0).toFixed(3)} kWh
                  </span>
                </div>
                {cdr.energy_cost != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Energy cost</span>
                    <span className="text-slate-200">{formatInrAmount(cdr.energy_cost)}</span>
                  </div>
                )}
                {cdr.session_fee != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Session fee</span>
                    <span className="text-slate-200">{formatInrAmount(cdr.session_fee)}</span>
                  </div>
                )}
                {cdr.time_cost != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Time cost</span>
                    <span className="text-slate-200">{formatInrAmount(cdr.time_cost)}</span>
                  </div>
                )}
                {cdr.subtotal != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="text-slate-200">{formatInrAmount(cdr.subtotal)}</span>
                  </div>
                )}
                {cdr.tax_amount != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>GST ({((Number(cdr.tax_rate ?? 0.18)) * 100).toFixed(0)}%)</span>
                    <span className="text-slate-200">{formatInrAmount(cdr.tax_amount)}</span>
                  </div>
                )}
                <div className="border-t border-white/[.06] pt-2 flex justify-between font-bold">
                  <span className="text-white">Total charged</span>
                  <span className="text-emerald-400 text-sm">
                    {formatInrAmount(cdr.total_cost ?? cdr.cost_amount ?? session.cost_amount)}
                  </span>
                </div>
              </div>

              {/* Settlement status */}
              <div className="bg-white/[.03] border border-white/[.06] rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {cdr.settlement_status === 'settled' || cdr.wallet_settled ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-emerald-300 font-medium">Wallet settled</span>
                    </>
                  ) : cdr.settlement_status === 'failed' ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span className="text-rose-300 font-medium">Settlement failed — contact support</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
                      <span className="text-amber-300 font-medium">Settlement pending</span>
                    </>
                  )}
                </div>
                {cdr.cdr_id && (
                  <p className="text-[10px] text-slate-500 pl-6 break-all">CDR ID: {cdr.cdr_id}</p>
                )}
                <p className="text-[10px] text-slate-500 pl-6">
                  Source: Immutable PostgreSQL CDR — OCPP 2.0.1 Audited
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-6 space-y-2">
              <FileText className="w-6 h-6 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-300">
                {session.energy_kwh > 0
                  ? 'CDR is being finalized — check back shortly.'
                  : 'No billing record available for this session.'}
              </p>
              {session.energy_kwh > 0 && (
                <p className="text-[10px] text-slate-500">
                  Energy: {Number(session.energy_kwh).toFixed(3)} kWh ·{' '}
                  {session.cost_amount > 0 ? formatInrAmount(session.cost_amount) : 'Pending'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[.06]">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
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
            Phase 3F
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            OCPP 2.0.1 Audited — Live Telemetry
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
              const isActive = session.status === 'active';

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
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isActive
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse'
                            : 'chip-available'
                        }`}
                      >
                        {isActive ? 'Active' : 'Completed'}
                      </span>
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
                          ? `${session.energy_kwh} kWh`
                          : 'Telemetry Pending'}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold">
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
        />
      )}
    </div>
  );
}
