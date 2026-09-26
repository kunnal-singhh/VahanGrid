import { Zap, WifiOff, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import ChargingSessionCard from '../../components/charging/ChargingSessionCard';
import StationCard from '../../components/stations/StationCard';

export default function ChargingPage({
  activeChargingSession,
  onOpenChargingSession,
  onStopChargingSession,
  stations = [],
  onStartCharge,
  onSelectStation,
}) {
  const availableStations = stations.filter((s) => s.status === 'available').slice(0, 3);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Top Banner */}
      <div className="glass rounded-3xl p-6 md:p-8 border border-white/[.08] relative overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Live Charging Hub
          </span>
          <span className="text-[10px] font-semibold text-emerald-400">
            OCPP 2.0.1 Ready
          </span>
        </div>

        <h1 className="text-xl md:text-2xl font-black text-white">
          EV Session Management & Diagnostics
        </h1>
        <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
          Monitor real-time energy delivery, power curves, voltage, and session costs.
          Seamlessly plug and charge across all partner CPOs.
        </p>
      </div>

      {/* Active Session Spotlight */}
      {activeChargingSession ? (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            Current Ongoing Session
          </h2>
          <ChargingSessionCard
            session={activeChargingSession}
            onOpenDetail={onOpenChargingSession}
            onStop={onStopChargingSession}
          />
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 border border-white/[.08] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mx-auto">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Active Charging Session</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Select an available charger from the list below or from the Live Map to begin session simulation.
          </p>
        </div>
      )}

      {/* Quick Launch Charging Stations */}
      {!activeChargingSession && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Available Fast DC Chargers Nearby
            </h2>
            <span className="text-[10px] text-slate-400">Instant Authorization</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {availableStations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onSelect={(st) => onStartCharge && onStartCharge(st)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Technical Standards & Connector Guide */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> VahanGrid Hardware Interoperability
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-white/[.02] border border-white/[.05] rounded-2xl p-4 space-y-1">
            <div className="font-bold text-sky-400 text-sm">CCS Type 2 (DC)</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Standard for high-power DC fast charging in India. Up to 150 kW for passenger EVs.
            </p>
          </div>

          <div className="bg-white/[.02] border border-white/[.05] rounded-2xl p-4 space-y-1">
            <div className="font-bold text-emerald-400 text-sm">Type 2 (AC)</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Standard 3-phase AC charging up to 22 kW. Ideal for workplace and destination hubs.
            </p>
          </div>

          <div className="bg-white/[.02] border border-white/[.05] rounded-2xl p-4 space-y-1">
            <div className="font-bold text-amber-400 text-sm">Offline Edge Protocol</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Enables local RFID token authorization and encrypted energy metering during highway cellular blackouts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
