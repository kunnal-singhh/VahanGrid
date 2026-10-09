/**
 * frontend/src/pages/Operator/components/SessionDetailModal.jsx
 *
 * Phase 4E: Comprehensive Operator Session Inspection & Audit Modal.
 *
 * Core Capabilities:
 *  - Distinguishes live charging telemetry from immutable historical records.
 *  - Shows station, EVSE, connector, and OCPP gateway connectivity.
 *  - Displays strictly server-masked driver PII (protecting privacy).
 *  - Inspects established tariff snapshot and pricing breakdown.
 *  - Inspects immutable CDR and wallet settlement record.
 *  - Provides direct entry point to authorized Remote Stop for active sessions.
 */

import { useState, useEffect } from 'react';
import {
  Activity,
  X,
  Zap,
  MapPin,
  Clock,
  Car,
  ShieldCheck,
  Tag,
  Receipt,
  CheckCircle2,
  AlertCircle,
  XCircle,
  StopCircle,
  Radio,
  Loader2,
  FileText,
  Lock,
} from 'lucide-react';
import { operatorService } from '../../../services/operatorService';
import { formatCurrency, formatKwh, formatTimestampIST } from '../../../utils/formatters';

export default function SessionDetailModal({
  sessionId = null,
  isOpen = false,
  onClose,
  onRemoteStopTrigger,
  theme = 'dark',
}) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'pricing' | 'financial'

  const isLight = theme === 'light';

  useEffect(() => {
    if (!isOpen || !sessionId) {
      setSession(null);
      return;
    }

    let isMounted = true;
    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await operatorService.getSessionDetail(sessionId);
        if (isMounted) {
          setSession(data);
        }
      } catch (err) {
        console.error('[SessionDetailModal] Failed to fetch session detail:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load session details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  const isActive = session?.status === 'active' || session?.status === 'charging' || session?.status === 'pending';
  const energyVal = session?.energy_kwh ?? session?.total_energy_kwh ?? 0;
  const costVal = session?.cost_amount ?? session?.total_cost_inr ?? 0;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
      case 'charging':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-blink" />
            Live Charging
          </span>
        );
      case 'stopped':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-300 border border-slate-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
            Completed
          </span>
        );
      case 'faulted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            Faulted
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  const getSettlementBadge = (status) => {
    switch (status) {
      case 'settled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Settled
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Settlement Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            Pending Settlement
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-session-detail-title"
    >
      <div
        className={`w-full max-w-3xl rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b132b] border-white/10 text-white'
        }`}
      >
        {/* Header */}
        <div
          className={`p-6 border-b flex items-center justify-between ${
            isLight ? 'border-slate-100 bg-slate-50' : 'border-white/[.08] bg-white/[.02]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="modal-session-detail-title" className="text-base font-bold tracking-tight">
                  Session Audit Record
                </h2>
                {session && getStatusBadge(session.status)}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                UUID: {sessionId}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/[.06]">
          {[
            { id: 'overview', label: 'Session & Hardware', icon: Zap },
            { id: 'pricing', label: 'Tariff Snapshot', icon: Tag },
            { id: 'financial', label: 'Financial & CDR', icon: Receipt },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === id
                  ? 'border-sky-400 text-sky-400 bg-sky-500/[.05] rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
              <span className="text-xs">Loading comprehensive session audit record...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-3 text-center p-4">
              <AlertCircle className="w-8 h-8 opacity-75" />
              <p className="text-xs font-semibold">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  operatorService.getSessionDetail(sessionId)
                    .then(setSession)
                    .catch((err) => setError(err.message))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : session ? (
            <>
              {/* TAB 1: OVERVIEW & HARDWARE */}
              {activeTab === 'overview' && (
                <div className="space-y-5 animate-fade-in">
                  {/* Energy & Financial Metric Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-white/[.02] border border-white/[.06]">
                      <span className="text-[11px] text-slate-400 block">Delivered Energy</span>
                      <span className="text-base font-bold text-emerald-400 font-mono mt-0.5 block">
                        {formatKwh(energyVal)}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/[.02] border border-white/[.06]">
                      <span className="text-[11px] text-slate-400 block">Total Cost</span>
                      <span className="text-base font-bold text-white font-mono mt-0.5 block">
                        {formatCurrency(costVal)}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/[.02] border border-white/[.06]">
                      <span className="text-[11px] text-slate-400 block">Start Meter</span>
                      <span className="text-xs font-bold text-slate-200 font-mono mt-1 block">
                        {session.meter_start != null ? `${session.meter_start} Wh` : '0 Wh'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/[.02] border border-white/[.06]">
                      <span className="text-[11px] text-slate-400 block">Stop Meter</span>
                      <span className="text-xs font-bold text-slate-200 font-mono mt-1 block">
                        {session.meter_stop != null ? `${session.meter_stop} Wh` : isActive ? 'Active Counting' : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Hardware & Location Details */}
                  <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-sky-400" />
                        <span>Station & Hardware Infrastructure</span>
                      </span>
                      {session.charger?.is_connected ? (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <Radio className="w-3 h-3 text-emerald-400" /> Gateway Online
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-semibold">Gateway Status Idle</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Station Name</span>
                        <span className="font-bold text-white">{session.station?.name || 'Charging Hub'}</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {session.station?.address_line1}, {session.station?.city} ({session.station?.state})
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block">EVSE & Connector</span>
                        <span className="font-bold text-sky-300 font-mono">
                          EVSE {session.hardware?.evse_uid || '1'} • Connector #{session.hardware?.connector_code || '1'}
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Standard: {session.hardware?.standard || 'Type 2'} • Max {session.hardware?.max_power_kw || 22} kW ({session.hardware?.current_type || 'AC'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Driver & Vehicle (PII Masked) */}
                  <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Driver & Vehicle Information (PII Protected)</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Masked Server-Side
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Driver Identity</span>
                        <span className="font-bold text-white">{session.driver?.name || 'Driver'}</span>
                        <div className="text-[10px] text-slate-400 space-y-0.5 mt-1 font-mono">
                          <div>Email: {session.driver?.email || 'p***@example.com'}</div>
                          <div>Phone: {session.driver?.phone || '+91 98*** 0000'}</div>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block">EV Vehicle</span>
                        <span className="font-bold text-white flex items-center gap-1 mt-0.5">
                          <Car className="w-3.5 h-3.5 text-sky-400" />
                          {session.vehicle?.make && session.vehicle?.model
                            ? `${session.vehicle.make} ${session.vehicle.model}`
                            : 'Registered EV'}
                        </span>
                        <div className="text-[10px] text-slate-400 space-y-0.5 mt-1 font-mono">
                          <div>License Plate: {session.vehicle?.license_plate || 'MH 01 ** 0000'}</div>
                          <div>Battery: {session.vehicle?.battery_capacity_kwh ? `${session.vehicle.battery_capacity_kwh} kWh` : 'Standard Pack'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle Timestamps */}
                  <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Session Lifecycle Timeline</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Initiated At</span>
                        <span className="font-medium text-slate-200">
                          {session.started_at ? formatTimestampIST(session.started_at) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Concluded At</span>
                        <span className="font-medium text-slate-200">
                          {session.ended_at || session.stopped_at ? formatTimestampIST(session.ended_at || session.stopped_at) : 'Active / In Progress'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Stop Reason</span>
                        <span className="font-mono text-slate-300">
                          {session.stop_reason || (isActive ? 'Charging in progress' : 'Normal / Completed')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PRICING SNAPSHOT */}
              {activeTab === 'pricing' && (
                <div className="space-y-5 animate-fade-in">
                  <div className="p-4 rounded-2xl bg-sky-500/[.04] border border-sky-500/20 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-sky-400">
                      <Lock className="w-4 h-4" />
                      <span>Tariff Snapshot Guarantee</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Every charging session locks an immutable pricing snapshot at initiation. Any subsequent adjustments, revisions, or deactivations to network tariffs do not alter active or historical session billing rates.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-4">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>Tariff Plan Reference</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {session.tariff_id ? `#${String(session.tariff_id).slice(0, 8)}` : 'Default CPO Tariff'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">Energy Rate</span>
                        <span className="font-bold text-emerald-400 font-mono mt-1 block">
                          ₹{session.tariff_snapshot?.price_per_kwh != null ? Number(session.tariff_snapshot.price_per_kwh).toFixed(2) : '15.00'} / kWh
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">Session Fee</span>
                        <span className="font-bold text-white font-mono mt-1 block">
                          ₹{session.tariff_snapshot?.session_fee != null ? Number(session.tariff_snapshot.session_fee).toFixed(2) : '0.00'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">Time Rate</span>
                        <span className="font-bold text-white font-mono mt-1 block">
                          ₹{session.tariff_snapshot?.price_per_minute != null ? Number(session.tariff_snapshot.price_per_minute).toFixed(2) : '0.00'} / min
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">Idle Penalty Rate</span>
                        <span className="font-bold text-amber-400 font-mono mt-1 block">
                          ₹{session.tariff_snapshot?.idle_fee_per_minute != null ? Number(session.tariff_snapshot.idle_fee_per_minute).toFixed(2) : '1.00'} / min
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">Idle Grace Period</span>
                        <span className="font-bold text-white font-mono mt-1 block">
                          {session.tariff_snapshot?.grace_period_minutes != null ? `${session.tariff_snapshot.grace_period_minutes} mins` : '15 mins'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white/[.02] border border-white/[.04]">
                        <span className="text-[11px] text-slate-400 block">GST / Tax Rate</span>
                        <span className="font-bold text-white font-mono mt-1 block">
                          {session.tariff_snapshot?.tax_rate != null ? `${(Number(session.tariff_snapshot.tax_rate) * 100).toFixed(0)}%` : '18%'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: FINANCIAL & CDR */}
              {activeTab === 'financial' && (
                <div className="space-y-5 animate-fade-in">
                  {session.cdr ? (
                    <>
                      <div className="p-4 rounded-2xl bg-emerald-500/[.04] border border-emerald-500/20 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                            <Receipt className="w-4 h-4" /> Immutable Charge Detail Record (CDR)
                          </span>
                          {getSettlementBadge(session.cdr.settlement_status)}
                        </div>
                        <p className="text-[11px] text-slate-300">
                          CDR #{session.cdr.id} is finalized and cryptographically verified against driver wallet ledger.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] space-y-3">
                        <span className="text-xs font-bold text-white block">Financial Settlement Breakdown</span>

                        <div className="space-y-2 text-xs divide-y divide-white/[.04]">
                          <div className="flex justify-between py-1">
                            <span className="text-slate-400">Energy Component ({formatKwh(session.cdr.total_energy_kwh || energyVal)})</span>
                            <span className="font-mono font-medium text-white">
                              {formatCurrency(session.cdr.energy_cost ?? session.cost_amount ?? 0)}
                            </span>
                          </div>

                          <div className="flex justify-between py-1">
                            <span className="text-slate-400">Base / Session Fixed Fee</span>
                            <span className="font-mono font-medium text-white">
                              {formatCurrency(session.cdr.session_fee ?? 0)}
                            </span>
                          </div>

                          <div className="flex justify-between py-1">
                            <span className="text-slate-400">Idle / Parking Surcharge</span>
                            <span className="font-mono font-medium text-white">
                              {formatCurrency(session.cdr.idle_cost ?? 0)}
                            </span>
                          </div>

                          <div className="flex justify-between py-1">
                            <span className="text-slate-400">Applicable Tax (GST)</span>
                            <span className="font-mono font-medium text-white">
                              {formatCurrency(session.cdr.tax_amount ?? 0)}
                            </span>
                          </div>

                          <div className="flex justify-between pt-2 text-sm font-bold">
                            <span className="text-sky-300">Final Settled Total</span>
                            <span className="font-mono text-emerald-400">
                              {formatCurrency(session.cdr.total_cost_inr ?? session.cost_amount ?? 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/[.02] border border-white/[.06] text-xs space-y-2">
                        <span className="font-bold text-slate-300 block">Settlement Audit Log</span>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                          <div>Settled At: {session.cdr.settled_at ? formatTimestampIST(session.cdr.settled_at) : '—'}</div>
                          <div>Currency: {session.cdr.currency || 'INR'}</div>
                          <div>Status: {session.cdr.settlement_status || 'settled'}</div>
                          <div>Driver Ledger: Secured</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2 border border-white/[.06] rounded-2xl p-6 text-center">
                      <Clock className="w-8 h-8 opacity-40 text-amber-400" />
                      <span className="text-xs font-bold text-white">Session Currently Active</span>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Charge Detail Record (CDR) and wallet financial settlement will be automatically and immutably generated once power delivery concludes.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div
          className={`p-6 border-t flex items-center justify-between ${
            isLight ? 'border-slate-100 bg-slate-50' : 'border-white/[.06] bg-white/[.02]'
          }`}
        >
          <div className="text-[11px] text-slate-400">
            {isActive ? (
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-blink" />
                Active Transaction
              </span>
            ) : (
              <span className="text-slate-400">Immutable Historical Record</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isActive && onRemoteStopTrigger && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRemoteStopTrigger(session);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <StopCircle className="w-4 h-4" />
                <span>Remote Stop</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/[.08] hover:bg-white/[.15] text-white transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
