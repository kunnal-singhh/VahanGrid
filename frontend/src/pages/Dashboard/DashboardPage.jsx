import {
  Zap,
  MapPin,
  Navigation,
  Wallet,
  ShieldCheck,
  Leaf,
  Activity,
  ArrowRight,
  Sparkles,
  Bot
} from 'lucide-react';
import LiveMap from '../../components/map/LiveMap';
import MapLegend from '../../components/map/MapLegend';
import { formatCompactCurrency } from '../../utils/formatters';

export default function DashboardPage({
  stations = [],
  onSelectStation,
  onNavigate,
  selectedVehicle,
  balance,
  co2SavedKg,
  userSoc,
  theme,
  activeChargingSession,
  onOpenChargingSession,
}) {
  const onlineCount = stations.filter((s) => s.status !== 'offline').length;
  const availableCount = stations.filter((s) => s.status === 'available').length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Hero Welcome Banner */}
      <div className="glass rounded-3xl p-6 md:p-8 border border-sky-500/20 bg-gradient-to-r from-sky-500/[.06] via-indigo-500/[.04] to-emerald-500/[.05] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Unified EV Mobility Ecosystem
              </span>
              <span className="text-[10px] font-semibold text-emerald-400">
                Phase 1 Active
              </span>
            </div>

            <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
              One Platform. Multiple Charging Networks.
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Seamlessly discover charging hubs across Tata Power, Statiq, ChargeZone, and Jio-bp.
              Plan long-distance highway routes and pay through a unified VahanPass wallet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              onClick={() => onNavigate('route')}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:from-sky-400 hover:to-emerald-400 transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>Plan Highway Route</span>
            </button>

            <button
              onClick={() => onNavigate('stations')}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-all flex items-center gap-2 cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>Find Stations</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Session Spotlight Banner */}
      {activeChargingSession && activeChargingSession.status !== 'stopped' && activeChargingSession.status !== 'completed' && (
        <div
          onClick={onOpenChargingSession}
          className="glass rounded-2xl p-4 border border-sky-500/40 bg-gradient-to-r from-sky-500/10 via-emerald-500/10 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer hover:border-sky-500/60 transition-all shadow-lg shadow-sky-500/10 animate-fade-in"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Zap className="w-5 h-5 fill-sky-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                  Active Charging Session
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-blink" />
              </div>
              <h3 className="text-sm font-bold text-white">
                {activeChargingSession.location?.name || activeChargingSession.stationName || 'Charging Station'}
              </h3>
              <p className="text-[11px] text-slate-300">
                Hardware connected • Click to monitor live status & stop session
              </p>
            </div>
          </div>
          <button className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 transition-colors flex items-center gap-1 self-end sm:self-center">
            <span>View Session</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Core Ecosystem Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Network Stations</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl md:text-2xl font-black font-display text-white mt-2">
            {stations.length}
          </div>
          <div className="text-[10px] text-emerald-400 font-semibold mt-1">
            {onlineCount} Hubs Operational
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Available Plugs</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl md:text-2xl font-black font-display text-emerald-400 mt-2">
            {availableCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Zero queue time right now
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>VahanPass Balance</span>
            <Wallet className="w-4 h-4 text-teal-300" />
          </div>
          <div className="text-xl md:text-2xl font-black font-display text-white mt-2">
            {formatCompactCurrency(balance)}
          </div>
          <div className="text-[10px] text-sky-400 font-semibold mt-1">
            Works across 4 CPO networks
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>CO₂ Emission Offset</span>
            <Leaf className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl md:text-2xl font-black font-display text-emerald-400 mt-2">
            {co2SavedKg} kg
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Clean energy mobility
          </div>
        </div>
      </div>

      {/* Main Grid: Live Map Section & Vehicle Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Map Preview (8 cols) */}
        <div className="lg:col-span-8 glass rounded-3xl p-4 md:p-5 border border-white/[.08] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-400" /> Live Interoperable Grid Map
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time charger availability across North & West Indian transit corridors
              </p>
            </div>

            <button
              onClick={() => onNavigate('stations')}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Explore All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-[360px] md:h-[420px] rounded-2xl overflow-hidden relative border border-white/[.06]">
            <LiveMap
              mapId="dashboard-map"
              stations={stations}
              onSelectStation={onSelectStation}
              theme={theme}
            />

            <div className="absolute top-3 right-3 z-[1100]">
              <MapLegend />
            </div>
          </div>
        </div>

        {/* Right: Active Vehicle & Quick Shortcuts (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Vehicle Card */}
          <div className="glass rounded-3xl p-5 border border-white/[.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                Connected Vehicle
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full chip-available">
                READY
              </span>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">
                {selectedVehicle?.name || 'Tata Nexon EV Max'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rated Range: {selectedVehicle?.range || 437} km • Battery: {selectedVehicle?.battery || 40.5} kWh
              </p>
            </div>

            {/* Battery Indicator */}
            <div className="bg-white/[.02] border border-white/[.05] rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Current Battery SoC:</span>
                <span className="font-extrabold text-sky-400">{userSoc}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden bg-white/[.08]">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full"
                  style={{ width: `${userSoc}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
                <span>Estimated Range: ~{Math.round(((selectedVehicle?.range || 437) * userSoc) / 100)} km</span>
                <span>Plug: {selectedVehicle?.connector || 'CCS2'}</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('route')}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-white/[.04] hover:bg-white/[.08] border border-white/[.08] text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Test Range Along Route</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copilot AI Assistant Shortcut */}
          <div className="glass rounded-3xl p-5 border border-sky-500/20 bg-gradient-to-br from-indigo-500/[.06] to-sky-500/[.03] space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">VahanGrid Copilot</h4>
                <p className="text-[10px] text-slate-400">Instant AI Range & Route Feasibility</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              "Can I reach Agra with 40% battery from Lucknow without stopping?"
            </p>

            <button
              onClick={() => onNavigate('ai')}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ask Mobility Copilot</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
