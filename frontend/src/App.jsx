import { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import Sidebar, { NAV_ITEMS } from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';
import StationDetailsModal from './components/stations/StationDetailsModal';
import ActiveChargingModal from './components/charging/ActiveChargingModal';
import AuthPage from './pages/Auth/AuthPage';
import { useAuth } from './context/AuthContext';
import { Zap } from 'lucide-react';

// Pages
import DashboardPage from './pages/Dashboard/DashboardPage';
import StationsPage from './pages/Stations/StationsPage';
import RoutePlannerPage from './pages/RoutePlanner/RoutePlannerPage';
import ChargingPage from './pages/Charging/ChargingPage';
import WalletPage from './pages/Wallet/WalletPage';
import HistoryPage from './pages/History/HistoryPage';
import ProfilePage from './pages/Profile/ProfilePage';
import AIChatbot from './components/ai/AIChatbot';

// Services
import { stationService } from './services/stationService';
import { walletService } from './services/walletService';
import { vehicleService } from './services/vehicleService';
import { chargingService } from './services/chargingService';

export default function App() {
  const { user, isAuthenticated, loading } = useAuth();

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('vahangrid_theme');
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
      localStorage.setItem('vahangrid_theme', theme);
    } catch (e) {
      console.warn('[App] LocalStorage theme error:', e);
    }
  }, [theme]);
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [guestMode, setGuestMode] = useState(false);

  // Core Data States
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [balance, setBalance] = useState(0);
  const [userSoc, setUserSoc] = useState(72);

  // Active Charging Session State
  const [activeChargingSession, setActiveChargingSession] = useState(null);
  const [modalChargingSession, setModalChargingSession] = useState(null);
  const [showChargingModal, setShowChargingModal] = useState(false);

  // Route State
  const [routeActive, setRouteActive] = useState(false);
  const [plannedRoutePath, setPlannedRoutePath] = useState([]);

  // Station Filter States
  const [filterOperator, setFilterOperator] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── 1. Load Public Station Data ──
  useEffect(() => {
    async function loadPublicData() {
      try {
        const allStations = await stationService.getStations();
        setStations(allStations || []);
      } catch (err) {
        console.error('[App] Error loading public station data:', err);
      }
    }
    loadPublicData();
  }, []);

  // ── 2. Load Authenticated Vehicles from Real REST API ──
  useEffect(() => {
    async function loadUserVehicles() {
      if (!isAuthenticated) {
        setVehicles([]);
        setSelectedVehicle(null);
        return;
      }

      try {
        const userVehicles = await vehicleService.getVehicles();
        setVehicles(userVehicles);

        const savedActiveId = vehicleService.getActiveVehicleId();
        const active =
          userVehicles.find((v) => v.id === savedActiveId) ||
          userVehicles[0] ||
          null;

        setSelectedVehicle(active);
      } catch (err) {
        console.error('[App] Error fetching authenticated user vehicles:', err);
        setVehicles([]);
        setSelectedVehicle(null);
      }
    }
    loadUserVehicles();
  }, [isAuthenticated]);

  // Vehicle Selection Handler
  const handleSelectVehicle = useCallback(
    (id) => {
      const veh = vehicles.find((v) => v.id === id) || null;
      setSelectedVehicle(veh);
      vehicleService.setActiveVehicleId(id);
    },
    [vehicles]
  );

  // Vehicle Collection Change Handler (Add / Edit / Delete)
  const handleVehiclesChange = useCallback((updatedVehicles) => {
    setVehicles(updatedVehicles);
    setSelectedVehicle((prev) => {
      if (!prev) return updatedVehicles[0] || null;
      const stillExists = updatedVehicles.find((v) => v.id === prev.id);
      return stillExists || updatedVehicles[0] || null;
    });
  }, []);

  // Theme Toggle Handler
  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // ── 3. Load Active Charging Session from Real REST API ──
  const [loadingActiveSession, setLoadingActiveSession] = useState(false);

  useEffect(() => {
    async function loadActiveSession() {
      if (!isAuthenticated) {
        setActiveChargingSession(null);
        return;
      }

      try {
        setLoadingActiveSession(true);
        const active = await chargingService.getActiveSession();
        setActiveChargingSession(active);
      } catch (err) {
        console.error('[App] Error checking active charging session:', err);
        setActiveChargingSession(null);
      } finally {
        setLoadingActiveSession(false);
      }
    }
    loadActiveSession();
  }, [isAuthenticated]);

  // ── 4. Load Authenticated User Wallet ──
  useEffect(() => {
    async function loadUserWallet() {
      if (!isAuthenticated) {
        setBalance(0);
        return;
      }
      try {
        const wallet = await walletService.getWallet();
        if (wallet) {
          setBalance(wallet.balance ?? 0);
        }
      } catch (err) {
        console.error('[App] Error loading authenticated user wallet:', err);
        setBalance(0);
      }
    }
    loadUserWallet();
  }, [isAuthenticated]);

  // Charging Session Handlers (Real PostgreSQL REST API)
  const handleStartCharge = useCallback(
    async (startParams) => {
      if (!isAuthenticated) {
        setGuestMode(false);
        return;
      }

      // Extract connectorId and vehicleId
      let connectorId = startParams?.connectorId;
      let vehicleId = startParams?.vehicleId;

      // Fallback if called with just a station object (e.g., from quick-launch or map)
      if (!connectorId && startParams) {
        const targetStation = startParams.station || startParams;
        if (Array.isArray(targetStation.evses)) {
          const allConns = targetStation.evses.flatMap((e) => e.connectors || []);
          const avail = allConns.find((c) => c.status === 'available');
          connectorId = avail?.id || allConns[0]?.id;
        }
      }

      if (!vehicleId) {
        vehicleId = selectedVehicle?.id || (vehicles.length > 0 ? vehicles[0].id : null);
      }

      if (!vehicleId) {
        throw new Error('Add a vehicle before starting a charging session.');
      }

      if (!connectorId) {
        throw new Error('Please select an available connector.');
      }

      const session = await chargingService.startChargingSession(connectorId, vehicleId);
      setActiveChargingSession(session);
      setModalChargingSession(session);
      setShowChargingModal(true);
      setSelectedStation(null);

      // Refresh station records so connector status updates (available -> charging)
      try {
        const refreshedStations = await stationService.getStations();
        setStations(refreshedStations);
      } catch (stErr) {
        console.warn('[App] Could not refresh stations after start:', stErr);
      }

      return session;
    },
    [isAuthenticated, selectedVehicle, vehicles]
  );

  const handleOpenChargingModal = useCallback(
    (sessionToOpen) => {
      const s = sessionToOpen || activeChargingSession || modalChargingSession;
      if (s) {
        setModalChargingSession(s);
        setShowChargingModal(true);
      }
    },
    [activeChargingSession, modalChargingSession]
  );

  const handleStopCharge = useCallback(
    async (sessionIdToStop, isAlreadyStopped = false) => {
      const id =
        sessionIdToStop ||
        activeChargingSession?.id ||
        activeChargingSession?.sessionId ||
        modalChargingSession?.id;
      if (!id) return;

      let stoppedSession = null;
      if (!isAlreadyStopped) {
        try {
          stoppedSession = await chargingService.stopChargingSession(id);
        } catch (err) {
          // If already stopped (409 / SESSION_ALREADY_STOPPED), treat as successfully stopped
          if (err?.code !== 'SESSION_ALREADY_STOPPED' && err?.status !== 409) {
            console.warn('[App] Error stopping session:', err);
          }
        }
      }

      // Immediately clear active state so navbar, header, dashboard, and charging page update
      setActiveChargingSession(null);

      // Refresh wallet balance so deduction is immediately reflected
      try {
        const wallet = await walletService.getWallet();
        if (wallet) {
          setBalance(wallet.balance ?? 0);
        }
      } catch (wErr) {
        console.warn('[App] Could not refresh wallet after stop:', wErr);
      }

      // Refresh station records so connector status updates (charging -> available)
      try {
        const refreshedStations = await stationService.getStations();
        setStations(refreshedStations);
      } catch (stErr) {
        console.warn('[App] Could not refresh stations after stop:', stErr);
      }

      // If stopped from outside the modal (e.g. from session card on Charging page), close modal
      if (!isAlreadyStopped) {
        setShowChargingModal(false);
        setModalChargingSession(null);
      }

      return stoppedSession;
    },
    [activeChargingSession, modalChargingSession]
  );

  // Reservation Handlers
  const handleReserveStation = useCallback(async (station) => {
    if (!isAuthenticated) {
      setGuestMode(false);
      return;
    }
    await stationService.reserveSlot(station.id);
    const refreshed = await stationService.getStations();
    setStations(refreshed);
    setSelectedStation((prev) => (prev ? { ...prev, status: 'reserved', waitMin: 30 } : null));
    alert(`Slot confirmed at ${station.name}. Hold duration: 30 minutes.`);
  }, [isAuthenticated]);

  const handleCancelReservation = useCallback(async (station) => {
    await stationService.cancelReservation(station.id);
    const refreshed = await stationService.getStations();
    setStations(refreshed);
    setSelectedStation((prev) => (prev ? { ...prev, status: 'available', waitMin: 0 } : null));
  }, []);

  // Route Planning Handlers
  const handlePlanRoute = useCallback((path) => {
    setPlannedRoutePath(path);
    setRouteActive(true);
  }, []);

  const handleClearRoute = useCallback(() => {
    setPlannedRoutePath([]);
    setRouteActive(false);
  }, []);

  // Navigation Helper with Route Protection
  const handleNavigate = (pageId) => {
    if (pageId === 'auth') {
      setGuestMode(false);
      return;
    }

    const protectedPages = ['dashboard', 'charging', 'wallet', 'history', 'profile'];
    if (!isAuthenticated && protectedPages.includes(pageId)) {
      setGuestMode(false);
      return;
    }

    setActivePage(pageId);
    setMobileDrawerOpen(false);
  };

  // ── 1. Initial Authentication Check Loading State (Avoid Flash) ──
  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#050711] flex flex-col items-center justify-center text-slate-200 select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 p-[2px] shadow-2xl shadow-sky-500/30 animate-pulse mb-4">
          <div className="w-full h-full bg-[#070c1d] rounded-[14px] flex items-center justify-center">
            <Zap className="w-7 h-7 text-sky-400 fill-sky-400" />
          </div>
        </div>
        <p className="text-xs font-semibold text-slate-400 tracking-widest uppercase animate-pulse">
          Connecting to VahanGrid...
        </p>
      </div>
    );
  }

  // ── 2. Unauthenticated UI: AuthPage unless user explicitly explores in guest mode ──
  if (!isAuthenticated && !guestMode) {
    return (
      <AuthPage
        onExploreGuest={() => {
          setGuestMode(true);
          setActivePage('stations');
        }}
      />
    );
  }

  // Find active nav metadata
  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) || {
    id: activePage,
    label: activePage === 'ai' ? 'Mobility Copilot' : 'VahanGrid',
    icon: null,
  };

  // Compute CO2 aggregate
  // Note: wallet transactions are loaded inside WalletPage, not at App level.
  // Use an empty array as the default so this never throws a ReferenceError.
  const co2Total = (
    85.4 +
    (typeof transactions !== 'undefined' ? transactions : [])
      .reduce((acc, t) => acc + (typeof t.kwh === 'number' ? t.kwh : 0) * 0.71, 0)
  ).toFixed(1);

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden transition-colors duration-200 ${
        theme === 'light' ? 'bg-[#f8fafc] text-slate-900 light-theme' : 'bg-[#050711] text-slate-200'
      }`}
    >
      {/* ─── Guest Mode Notice Banner ─── */}
      {!isAuthenticated && guestMode && (
        <div
          id="guest-mode-banner"
          className="bg-gradient-to-r from-sky-600 via-indigo-600 to-emerald-600 px-4 py-2 text-white flex items-center justify-between text-xs font-medium z-50 shrink-0 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-blink" />
            <span className="font-semibold">Guest Mode</span>
            <span className="hidden sm:inline text-sky-100">• Exploring Public Stations & Map</span>
          </div>
          <button
            onClick={() => setGuestMode(false)}
            id="btn-guest-signin"
            className="px-3 py-1 rounded-lg bg-white text-slate-950 font-bold hover:bg-slate-100 transition-colors cursor-pointer text-[11px] shadow-sm"
          >
            Sign In / Register
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ─── Sidebar (Desktop) & Mobile Drawer ─── */}
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          mobileDrawerOpen={mobileDrawerOpen}
          onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
          theme={theme}
          selectedVehicle={selectedVehicle}
          vehicles={vehicles}
          onSelectVehicle={handleSelectVehicle}
          co2SavedKg={co2Total}
          activeChargingSession={activeChargingSession}
        />

        {/* ─── Main Content Canvas ─── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Top Header */}
          <Header
            activePage={activePage}
            pageTitle={currentNav.label}
            pageIcon={currentNav.icon}
            theme={theme}
            onToggleTheme={toggleTheme}
            isNetworkOnline={isNetworkOnline}
            onToggleNetwork={() => setIsNetworkOnline((v) => !v)}
            activeChargingSession={activeChargingSession}
            onOpenChargingSession={() => handleOpenChargingModal()}
            onOpenMobileMenu={() => setMobileDrawerOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={activePage === 'stations'}
            onNavigate={handleNavigate}
          />

          {/* Dynamic Page Container */}
          <main className="flex-1 overflow-y-auto relative">
            {activePage === 'dashboard' && (
              <DashboardPage
                stations={stations}
                onSelectStation={setSelectedStation}
                onNavigate={handleNavigate}
                selectedVehicle={selectedVehicle}
                balance={balance}
                co2SavedKg={co2Total}
                userSoc={userSoc}
                theme={theme}
                activeChargingSession={activeChargingSession}
                onOpenChargingSession={() => handleOpenChargingModal()}
              />
            )}

            {activePage === 'stations' && (
              <StationsPage
                stations={stations}
                selectedStation={selectedStation}
                onSelectStation={setSelectedStation}
                theme={theme}
                filterOperator={filterOperator}
                onOperatorChange={setFilterOperator}
                filterStatus={filterStatus}
                onStatusChange={setFilterStatus}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            )}

            {activePage === 'route' && (
              <RoutePlannerPage
                stations={stations}
                routeActive={routeActive}
                onPlanRoute={handlePlanRoute}
                onClearRoute={handleClearRoute}
                onStartCharge={handleStartCharge}
                onSelectStation={setSelectedStation}
                selectedStation={selectedStation}
                userSoc={userSoc}
                onSocChange={setUserSoc}
                selectedVehicle={selectedVehicle}
                theme={theme}
                plannedRoutePath={plannedRoutePath}
              />
            )}

            {activePage === 'charging' && (
              <ChargingPage
                activeChargingSession={activeChargingSession}
                onOpenChargingSession={() => handleOpenChargingModal()}
                onStopChargingSession={handleStopCharge}
                stations={stations}
                onSelectStation={setSelectedStation}
                isLoadingActive={loadingActiveSession}
              />
            )}

            {activePage === 'wallet' && (
              <WalletPage onBalanceSync={setBalance} theme={theme} />
            )}

            {activePage === 'history' && (
              <HistoryPage onNavigateToWallet={() => handleNavigate('wallet')} />
            )}

            {activePage === 'profile' && (
              <ProfilePage
                selectedVehicle={selectedVehicle}
                onSelectVehicle={handleSelectVehicle}
                vehicles={vehicles}
                onVehiclesChange={handleVehiclesChange}
              />
            )}

            {activePage === 'ai' && (
              <div className="p-4 md:p-6 max-w-4xl mx-auto pb-20 md:pb-8">
                <AIChatbot
                  userSoc={userSoc}
                  selectedVehicle={selectedVehicle}
                  balance={balance}
                />
              </div>
            )}
          </main>

          {/* ─── Mobile Bottom Navigation ─── */}
          <BottomNav
            activePage={activePage}
            onNavigate={handleNavigate}
            theme={theme}
            activeChargingSession={activeChargingSession}
          />

          {/* ─── Global Station Details Modal ─── */}
          {selectedStation && (
            <StationDetailsModal
              station={selectedStation}
              onClose={() => setSelectedStation(null)}
              onStartCharge={handleStartCharge}
              onReserve={handleReserveStation}
              onCancelReservation={handleCancelReservation}
              isCharging={!!activeChargingSession}
              vehicles={vehicles}
              selectedVehicle={selectedVehicle}
              onSelectVehicle={handleSelectVehicle}
              onNavigate={handleNavigate}
            />
          )}

          {/* ─── Global Active Charging Modal ─── */}
          {showChargingModal && (modalChargingSession || activeChargingSession) && (
            <ActiveChargingModal
              session={modalChargingSession || activeChargingSession}
              onStop={handleStopCharge}
              onClose={() => {
                setShowChargingModal(false);
                setModalChargingSession(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
