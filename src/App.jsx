import { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import Sidebar, { NAV_ITEMS } from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';
import StationDetailsModal from './components/stations/StationDetailsModal';
import ActiveChargingModal from './components/charging/ActiveChargingModal';

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
  const [theme, setTheme] = useState('dark');
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);

  // Core Data States
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [balance, setBalance] = useState(1450);
  const [transactions, setTransactions] = useState([]);
  const [userSoc, setUserSoc] = useState(72);

  // Active Charging Session State
  const [activeChargingSession, setActiveChargingSession] = useState(null);
  const [showChargingModal, setShowChargingModal] = useState(false);

  // Route State
  const [routeActive, setRouteActive] = useState(false);
  const [plannedRoutePath, setPlannedRoutePath] = useState([]);

  // Station Filter States
  const [filterOperator, setFilterOperator] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Initial Data Fetch via Services
  useEffect(() => {
    async function loadInitialData() {
      const [allStations, allVehicles, activeVeh, currentBal, allTx] = await Promise.all([
        stationService.getStations(),
        vehicleService.getVehicles(),
        vehicleService.getActiveVehicle(),
        walletService.getBalance(),
        walletService.getTransactions(),
      ]);

      setStations(allStations);
      setVehicles(allVehicles);
      setSelectedVehicle(activeVeh);
      setBalance(currentBal);
      setTransactions(allTx);
    }
    loadInitialData();
  }, []);

  // Theme Toggle Handler
  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  // Charging Session Handlers
  const handleStartCharge = useCallback(async (station) => {
    if (balance < 50) {
      alert('⚠️ Low VahanPass Balance. Please top up at least ₹50 to initiate charging.');
      return;
    }

    const session = await chargingService.startSession({
      station,
      startSoc: userSoc,
      isOffline: !isNetworkOnline,
    });

    setActiveChargingSession(session);
    setShowChargingModal(true);
    setSelectedStation(null);

    // Refresh station state
    const refreshed = await stationService.getStations();
    setStations(refreshed);
  }, [balance, userSoc, isNetworkOnline]);

  const handleStopCharge = useCallback(async ({ cost, kwh, soc }) => {
    if (!activeChargingSession) return;

    setUserSoc(soc);
    const result = await chargingService.stopSession({
      session: activeChargingSession,
      finalSoc: soc,
      kwh,
      cost,
    });

    if (result.success) {
      setActiveChargingSession(null);
      setShowChargingModal(false);

      // Refresh balance, transactions, and stations
      const [newBal, allTx, allStations] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions(),
        stationService.getStations(),
      ]);

      setBalance(newBal);
      setTransactions(allTx);
      setStations(allStations);
    }
  }, [activeChargingSession]);

  // Reservation Handlers
  const handleReserveStation = useCallback(async (station) => {
    await stationService.reserveSlot(station.id);
    const refreshed = await stationService.getStations();
    setStations(refreshed);
    setSelectedStation((prev) => (prev ? { ...prev, status: 'reserved', waitMin: 30 } : null));
    alert(`Slot confirmed at ${station.name}. Hold duration: 30 minutes.`);
  }, []);

  const handleCancelReservation = useCallback(async (station) => {
    await stationService.cancelReservation(station.id);
    const refreshed = await stationService.getStations();
    setStations(refreshed);
    setSelectedStation((prev) => (prev ? { ...prev, status: 'available', waitMin: 0 } : null));
  }, []);

  // Wallet Top-Up Handler
  const handleTopUp = useCallback(async (amt) => {
    const res = await walletService.topUp(amt);
    if (res.success) {
      setBalance(res.newBalance);
      const allTx = await walletService.getTransactions();
      setTransactions(allTx);
    }
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

  // Navigation Helper
  const handleNavigate = (pageId) => {
    setActivePage(pageId);
    setMobileDrawerOpen(false);
  };

  // Find active nav metadata
  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) || {
    id: activePage,
    label: activePage === 'ai' ? 'Mobility Copilot' : 'VahanGrid',
    icon: null,
  };

  // Compute CO2 aggregate
  const co2Total = (
    85.4 +
    transactions.reduce((acc, t) => acc + (typeof t.kwh === 'number' ? t.kwh : 0) * 0.71, 0)
  ).toFixed(1);

  return (
    <div
      className={`h-screen w-screen flex overflow-hidden transition-colors duration-200 ${
        theme === 'light' ? 'bg-[#f8fafc] text-slate-900 light-theme' : 'bg-[#050711] text-slate-200'
      }`}
    >
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
        onSelectVehicle={(id) => {
          const veh = vehicleService.setActiveVehicle(id);
          setSelectedVehicle(veh);
        }}
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
          onOpenChargingSession={() => setShowChargingModal(true)}
          onOpenMobileMenu={() => setMobileDrawerOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showSearch={activePage === 'stations'}
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
              onOpenChargingSession={() => setShowChargingModal(true)}
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
              onOpenChargingSession={() => setShowChargingModal(true)}
              onStopChargingSession={handleStopCharge}
              stations={stations}
              onStartCharge={handleStartCharge}
              onSelectStation={setSelectedStation}
            />
          )}

          {activePage === 'wallet' && (
            <WalletPage
              balance={balance}
              transactions={transactions}
              onTopUp={handleTopUp}
            />
          )}

          {activePage === 'history' && (
            <HistoryPage transactions={transactions} />
          )}

          {activePage === 'profile' && (
            <ProfilePage
              selectedVehicle={selectedVehicle}
              onSelectVehicle={(id) => {
                const veh = vehicleService.setActiveVehicle(id);
                setSelectedVehicle(veh);
              }}
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
          />
        )}

        {/* ─── Global Active Charging Modal ─── */}
        {showChargingModal && activeChargingSession && (
          <ActiveChargingModal
            session={activeChargingSession}
            onStop={handleStopCharge}
          />
        )}
      </div>
    </div>
  );
}
