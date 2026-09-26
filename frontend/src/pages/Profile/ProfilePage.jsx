import { User, Car, ShieldCheck, CreditCard, Sparkles, CheckCircle2, ExternalLink } from 'lucide-react';
import { VEHICLES } from '../../data/mockData';

export default function ProfilePage({
  selectedVehicle,
  onSelectVehicle,
}) {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
            Driver & Fleet Settings
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-black text-white">
          Driver Profile & Vehicle Portfolio
        </h1>
        <p className="text-xs text-slate-300 mt-0.5">
          Manage your electric vehicles, VahanPass roaming credentials, and interoperability preferences.
        </p>
      </div>

      {/* Driver Card */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 flex items-center justify-center text-xl font-black text-white shadow-xl shadow-sky-500/20 shrink-0">
            VG
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">VahanGrid EV Pilot</h2>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                VERIFIED DRIVER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">driver.pilot@vahangrid.in • +91 98765 43210</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
              VahanPass RFID ID: RFID-VG-IN-889104
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Roaming Clearance</div>
          <div className="text-xs font-bold text-sky-400 flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>All Indian CPO Networks</span>
          </div>
        </div>
      </div>

      {/* Registered Electric Vehicles */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Car className="w-4 h-4 text-sky-400" /> Registered Electric Vehicles
          </h3>
          <span className="text-[10px] text-slate-400">Tap to set active vehicle</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {VEHICLES.map((vehicle) => {
            const isSelected = selectedVehicle?.id === vehicle.id;
            return (
              <div
                key={vehicle.id}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`cursor-pointer rounded-2xl p-4 border transition-all ${
                  isSelected
                    ? 'glass-highlight border-sky-500/50 shadow-lg shadow-sky-500/15'
                    : 'bg-white/[.02] border-white/[.05] hover:border-white/[.12]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-xs font-bold text-white truncate">{vehicle.name}</h4>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>

                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Rated Range:</span>
                    <span className="font-bold text-sky-400">{vehicle.range} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Battery Capacity:</span>
                    <span className="font-medium text-slate-200">{vehicle.battery} kWh</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connector:</span>
                    <span className="font-medium text-slate-200">{vehicle.connector}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Architectural Principles Box */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Phase 1 Architecture Principles
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          VahanGrid decouples the presentation layer from business logic and data access.
          All stations and mock records are isolated behind <code className="text-sky-300">src/services/</code>.
          Future phases will directly integrate PostgreSQL + PostGIS, OCPI 2.2.1 roaming endpoints, and OCPP 2.0.1 charger communication without altering visual React components.
        </p>
      </div>
    </div>
  );
}
