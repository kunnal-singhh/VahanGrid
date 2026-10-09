import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Layers,
  Activity,
  BarChart3,
  ListFilter,
  CheckCircle2,
  Lock,
  LogIn,
  Home
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operatorService } from '../../services/operatorService';
import OperatorOverviewCards from './components/OperatorOverviewCards';
import OperatorAnalyticsChart from './components/OperatorAnalyticsChart';
import StationFleetTable from './components/StationFleetTable';
import SessionMonitoringFeed from './components/SessionMonitoringFeed';

const OVERVIEW_PERIODS = [
  { id: '24h', label: '24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: 'all', label: 'All Time' },
];

const ADMIN_CPO_OPTIONS = [
  { id: null, name: 'Platform-Wide (All CPOs)' },
  { id: 'a0000001-0000-0000-0000-000000000001', name: 'Tata Power EZ Charge' },
  { id: 'a0000001-0000-0000-0000-000000000002', name: 'Statiq India' },
  { id: 'a0000001-0000-0000-0000-000000000003', name: 'Kazam EV' },
];

export default function OperatorDashboardPage({ theme = 'dark', onNavigate }) {
  const { user, isAuthenticated } = useAuth();

  const isOperator = user?.role === 'operator';
  const isAdmin = user?.role === 'admin';
  const isAuthorized = isOperator || isAdmin;

  // Selected CPO for Admin inspection (null = platform-wide)
  const [selectedAdminCpoId, setSelectedAdminCpoId] = useState(null);
  const activeCpoId = isAdmin ? selectedAdminCpoId : null;

  // Global Period Filter for Overview
  const [overviewPeriod, setOverviewPeriod] = useState('30d');
  const [analyticsPeriod, setAnalyticsPeriod] = useState('7d');

  // Overview State
  const [overviewData, setOverviewData] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState(null);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  // Station Fleet State
  const [stations, setStations] = useState([]);
  const [stationPagination, setStationPagination] = useState({ page: 1, limit: 10, total_count: 0, total_pages: 1 });
  const [stationSearch, setStationSearch] = useState('');
  const [stationStatus, setStationStatus] = useState('all');
  const [stationPage, setStationPage] = useState(1);
  const [loadingStations, setLoadingStations] = useState(false);
  const [stationsError, setStationsError] = useState(null);

  // Session Feed State
  const [sessions, setSessions] = useState([]);
  const [sessionPagination, setSessionPagination] = useState({ page: 1, limit: 20, total_count: 0, total_pages: 1 });
  const [sessionStatus, setSessionStatus] = useState('all');
  const [sessionPage, setSessionPage] = useState(1);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);

  // Active view tab
  const [activeSection, setActiveSection] = useState('all'); // 'all' | 'stations' | 'sessions' | 'analytics'

  // Polling State (Auto-refresh every 30s)
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef(null);

  // ── Fetch Overview ──
  const fetchOverview = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoadingOverview(true);
      setOverviewError(null);
      const data = await operatorService.getOverview({
        period: overviewPeriod,
        cpoId: activeCpoId,
      });
      setOverviewData(data);
    } catch (err) {
      console.error('[OperatorDashboard] Error loading overview:', err);
      setOverviewError(err.message || 'Failed to load operator overview.');
    } finally {
      setLoadingOverview(false);
    }
  }, [isAuthorized, overviewPeriod, activeCpoId]);

  // ── Fetch Analytics ──
  const fetchAnalytics = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoadingAnalytics(true);
      setAnalyticsError(null);
      const data = await operatorService.getAnalytics({
        period: analyticsPeriod,
        cpoId: activeCpoId,
      });
      setAnalyticsData(data);
    } catch (err) {
      console.error('[OperatorDashboard] Error loading analytics:', err);
      setAnalyticsError(err.message || 'Failed to load analytics.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [isAuthorized, analyticsPeriod, activeCpoId]);

  // ── Fetch Stations ──
  const fetchStations = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoadingStations(true);
      setStationsError(null);
      const res = await operatorService.getStations({
        page: stationPage,
        limit: 10,
        status: stationStatus,
        search: stationSearch,
        cpoId: activeCpoId,
      });
      setStations(res.stations);
      setStationPagination(res.meta);
    } catch (err) {
      console.error('[OperatorDashboard] Error loading stations:', err);
      setStationsError(err.message || 'Failed to load fleet stations.');
    } finally {
      setLoadingStations(false);
    }
  }, [isAuthorized, stationPage, stationStatus, stationSearch, activeCpoId]);

  // ── Fetch Sessions ──
  const fetchSessions = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoadingSessions(true);
      setSessionsError(null);
      const res = await operatorService.getSessions({
        page: sessionPage,
        limit: 20,
        status: sessionStatus,
        cpoId: activeCpoId,
      });
      setSessions(res.sessions);
      setSessionPagination(res.meta);
    } catch (err) {
      console.error('[OperatorDashboard] Error loading sessions:', err);
      setSessionsError(err.message || 'Failed to load sessions.');
    } finally {
      setLoadingSessions(false);
    }
  }, [isAuthorized, sessionPage, sessionStatus, activeCpoId]);

  // Refresh all sections
  const handleRefreshAll = useCallback(() => {
    fetchOverview();
    fetchAnalytics();
    fetchStations();
    fetchSessions();
  }, [fetchOverview, fetchAnalytics, fetchStations, fetchSessions]);

  // Initial load on mount or parameter changes
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Auto-Refresh Timer with Tab Visibility Pause ──
  useEffect(() => {
    if (!autoRefresh || !isAuthorized) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalId = setInterval(() => {
      // Pause polling if document is hidden to conserve resources
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      handleRefreshAll();
    }, 30000);

    timerRef.current = intervalId;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, isAuthorized, handleRefreshAll]);

  // Reset pagination when search or status filters change
  const handleStationSearchChange = (val) => {
    setStationSearch(val);
    setStationPage(1);
  };

  const handleStationStatusChange = (val) => {
    setStationStatus(val);
    setStationPage(1);
  };

  const handleSessionStatusChange = (val) => {
    setSessionStatus(val);
    setSessionPage(1);
  };

  // ── Authorization Guard View ──
  if (!isAuthenticated || !isAuthorized) {
    return (
      <div className="p-6 md:p-12 max-w-2xl mx-auto space-y-6 animate-fade-in text-center mt-12">
        <div className="glass rounded-3xl p-8 md:p-10 border border-rose-500/30 bg-rose-500/[.04] space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
              Operator Access Restricted
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-2 leading-relaxed">
              The Operator Fleet Management portal is strictly restricted to authorized Charge Point Operators
              (CPOs) and platform administrators. Driver accounts are not permitted to inspect or operate network hardware.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onNavigate && onNavigate('dashboard')}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/[.08] hover:bg-white/[.15] text-white border border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Driver Dashboard</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate('auth')}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In as Operator</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cpoName = overviewData?.cpo?.name || (isAdmin ? 'Platform-Wide Fleet' : 'Charging Network');
  const cpoShortCode = overviewData?.cpo?.short_code || (isAdmin ? 'ADMIN' : 'CPO');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* ─── Header & CPO Identity Banner ─── */}
      <div className="glass rounded-3xl p-6 border border-sky-500/20 bg-gradient-to-r from-sky-500/[.06] via-indigo-500/[.04] to-emerald-500/[.05] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> {cpoShortCode}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Multi-Tenant Secured
              </span>
              {isAdmin && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Super Admin
                </span>
              )}
            </div>

            <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
              {cpoName}
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 leading-relaxed">
              Real-time charging fleet operations, live OCPP connection states, and immutable CDR financial settlement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Admin CPO Inspection Switcher */}
            {isAdmin && (
              <div className="flex items-center gap-2 bg-white/[.04] border border-white/10 rounded-xl px-3 py-1.5">
                <span className="text-[11px] text-slate-400 font-semibold">Scope:</span>
                <select
                  value={selectedAdminCpoId || ''}
                  onChange={(e) => setSelectedAdminCpoId(e.target.value || null)}
                  className="bg-transparent text-xs text-white outline-none cursor-pointer font-bold"
                >
                  {ADMIN_CPO_OPTIONS.map((opt) => (
                    <option key={opt.id || 'all'} value={opt.id || ''} className="bg-slate-900 text-white">
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Overview Period Filter */}
            <div className="flex rounded-xl p-1 bg-white/[.04] border border-white/[.06]">
              {OVERVIEW_PERIODS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setOverviewPeriod(id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    overviewPeriod === id
                      ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Auto-Refresh Toggle & Manual Refresh Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh((v) => !v)}
                title="Toggle 30s Live Auto-Refresh (Pauses when tab hidden)"
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  autoRefresh
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-white/[.04] text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-blink' : 'bg-slate-500'}`} />
                <span>Live 30s</span>
              </button>

              <button
                onClick={handleRefreshAll}
                disabled={loadingOverview || loadingStations || loadingSessions}
                title="Refresh All Dashboard Telemetry"
                className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.1] border border-white/10 text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loadingOverview || loadingStations || loadingSessions ? 'animate-spin text-sky-400' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section Navigation Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-white/[.06] pb-2 overflow-x-auto">
        {[
          { id: 'all', label: 'Overview & All Sections', icon: Layers },
          { id: 'analytics', label: 'Analytics Charts', icon: BarChart3 },
          { id: 'stations', label: 'Station Fleet', icon: Building2 },
          { id: 'sessions', label: 'Session Monitor', icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeSection === id
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[.02]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ─── Error State Banner if Overview Failed ─── */}
      {overviewError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
          <span>{overviewError}</span>
          <button
            onClick={fetchOverview}
            className="px-3 py-1 rounded-lg bg-rose-500/20 font-bold hover:bg-rose-500/30 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Section 1: Fleet Overview KPI Cards ─── */}
      {(activeSection === 'all' || activeSection === 'analytics') && (
        <OperatorOverviewCards
          overviewData={overviewData}
          loading={loadingOverview}
          theme={theme}
        />
      )}

      {/* ─── Section 2: Time-Series Analytics Charts ─── */}
      {(activeSection === 'all' || activeSection === 'analytics') && (
        <OperatorAnalyticsChart
          analyticsData={analyticsData}
          loading={loadingAnalytics}
          error={analyticsError}
          period={analyticsPeriod}
          onPeriodChange={setAnalyticsPeriod}
          theme={theme}
        />
      )}

      {/* ─── Section 3: Station Fleet Inventory Table ─── */}
      {(activeSection === 'all' || activeSection === 'stations') && (
        <StationFleetTable
          stations={stations}
          pagination={stationPagination}
          loading={loadingStations}
          error={stationsError}
          search={stationSearch}
          onSearchChange={handleStationSearchChange}
          status={stationStatus}
          onStatusChange={handleStationStatusChange}
          onPageChange={setStationPage}
          onRetry={fetchStations}
          theme={theme}
        />
      )}

      {/* ─── Section 4: Session Monitoring Feed ─── */}
      {(activeSection === 'all' || activeSection === 'sessions') && (
        <SessionMonitoringFeed
          sessions={sessions}
          pagination={sessionPagination}
          loading={loadingSessions}
          error={sessionsError}
          status={sessionStatus}
          onStatusChange={handleSessionStatusChange}
          onPageChange={setSessionPage}
          onRetry={fetchSessions}
          theme={theme}
        />
      )}
    </div>
  );
}
