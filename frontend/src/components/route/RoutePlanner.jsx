import { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  MapPin,
  Battery,
  Zap,
  ArrowUpDown,
  Search,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { routeService } from '../../services/routeService';
import { formatDistance, formatDuration, formatKwh, formatCurrency } from '../../utils/formatters';

export default function RoutePlanner({
  stations = [],
  routeActive,
  onPlanRoute,
  onClearRoute,
  onStartCharge,
  onSelectStation,
  userSoc = 75,
  onSocChange,
  selectedVehicle,
  onStopsComputed,
}) {
  const [fromQuery, setFromQuery] = useState('Lucknow, Uttar Pradesh');
  const [toQuery, setToQuery] = useState('New Delhi, India');
  const [fromCoords, setFromCoords] = useState({ lat: 26.8467, lng: 80.9462 });
  const [toCoords, setToCoords] = useState({ lat: 28.6139, lng: 77.2090 });

  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);

  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [plannedStops, setPlannedStops] = useState([]);

  // Debounced Place Searches
  useEffect(() => {
    if (!fromQuery || fromQuery.length < 2) {
      setFromSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingFrom(true);
      const results = await routeService.searchPlaces(fromQuery);
      setFromSuggestions(results);
      setIsSearchingFrom(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [fromQuery]);

  useEffect(() => {
    if (!toQuery || toQuery.length < 2) {
      setToSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingTo(true);
      const results = await routeService.searchPlaces(toQuery);
      setToSuggestions(results);
      setIsSearchingTo(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [toQuery]);

  // Execute Route Computation
  const handleCalculateRoute = async () => {
    if (!fromCoords || !toCoords) return;

    setIsCalculatingRoute(true);
    const result = await routeService.fetchRoute(fromCoords, toCoords);

    if (result && result.routeCoords) {
      setRouteData(result);

      // Compute recommended stops
      const stops = routeService.planEVStops({
        routeCoords: result.routeCoords,
        totalDistanceKm: result.distanceKm,
        startSoc: userSoc,
        stationsList: stations,
        vehicle: selectedVehicle,
      });

      setPlannedStops(stops);
      if (onStopsComputed) onStopsComputed(stops);
      if (onPlanRoute) onPlanRoute(result.routeCoords);
    }
    setIsCalculatingRoute(false);
  };

  const handleSwap = () => {
    const tempQuery = fromQuery;
    const tempCoords = fromCoords;
    setFromQuery(toQuery);
    setFromCoords(toCoords);
    setToQuery(tempQuery);
    setToCoords(tempCoords);
  };

  const handleClear = () => {
    setRouteData(null);
    setPlannedStops([]);
    if (onClearRoute) onClearRoute();
  };

  return (
    <div className="space-y-4">
      {/* Search Header Form */}
      <div className="glass rounded-2xl p-4 md:p-5 border border-white/[.08] space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-2">
            <Navigation className="w-4 h-4 text-sky-400" /> Plan EV Highway Transit
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            Corridor Intelligence
          </span>
        </div>

        {/* Origin Input */}
        <div className="relative">
          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-emerald-400" /> Starting Point
          </label>
          <div className="flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-2 focus-within:border-sky-500/40">
            <input
              type="text"
              value={fromQuery}
              onChange={(e) => setFromQuery(e.target.value)}
              placeholder="Enter departure city / town..."
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
            {isSearchingFrom && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />}
          </div>

          {/* Suggestions Dropdown */}
          {fromSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-50 border border-white/[.1] shadow-2xl">
              {fromSuggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setFromQuery(item.shortName || item.displayName);
                    setFromCoords({ lat: item.lat, lng: item.lng });
                    setFromSuggestions([]);
                  }}
                  className="px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-sky-500/20 cursor-pointer border-b border-white/[.04] last:border-0"
                >
                  <div className="font-semibold">{item.shortName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{item.displayName}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-1">
          <button
            onClick={handleSwap}
            type="button"
            className="p-1.5 rounded-lg bg-white/[.05] hover:bg-white/[.1] text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Swap Origin and Destination"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Destination Input */}
        <div className="relative">
          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-rose-400" /> Destination
          </label>
          <div className="flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-2 focus-within:border-sky-500/40">
            <input
              type="text"
              value={toQuery}
              onChange={(e) => setToQuery(e.target.value)}
              placeholder="Enter destination..."
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
            {isSearchingTo && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />}
          </div>

          {/* Suggestions Dropdown */}
          {toSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-50 border border-white/[.1] shadow-2xl">
              {toSuggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setToQuery(item.shortName || item.displayName);
                    setToCoords({ lat: item.lat, lng: item.lng });
                    setToSuggestions([]);
                  }}
                  className="px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-sky-500/20 cursor-pointer border-b border-white/[.04] last:border-0"
                >
                  <div className="font-semibold">{item.shortName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{item.displayName}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Battery Slider */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <Battery className="w-3.5 h-3.5 text-sky-400" /> Departure Battery SoC:
            </span>
            <span className="font-bold text-sky-400">{userSoc}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={userSoc}
            onChange={(e) => onSocChange && onSocChange(Number(e.target.value))}
            className="w-full h-1.5"
          />
        </div>

        {/* Action Button */}
        <div className="pt-2 flex gap-2">
          <button
            onClick={handleCalculateRoute}
            disabled={isCalculatingRoute}
            className="flex-1 h-11 rounded-xl font-bold text-xs md:text-sm bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:from-sky-400 hover:to-emerald-400 transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isCalculatingRoute ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing Highway Chargers...
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" /> Compute Highway Route
              </>
            )}
          </button>

          {routeActive && (
            <button
              onClick={handleClear}
              className="px-3.5 h-11 rounded-xl text-xs font-semibold bg-white/[.05] hover:bg-white/[.1] border border-white/[.08] text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Recommended Intermediate Stops */}
      {plannedStops.length > 0 && (
        <div className="glass rounded-2xl p-4 md:p-5 border border-white/[.08] space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Recommended Stops ({plannedStops.length})
            </h3>
            <span className="text-[10px] text-slate-400">Optimal SoC: 80%</span>
          </div>

          <div className="space-y-2.5">
            {plannedStops.map((stop, i) => (
              <div
                key={stop.id || i}
                onClick={() => onSelectStation && onSelectStation(stop)}
                className="bg-white/[.02] hover:bg-white/[.05] border border-white/[.05] hover:border-sky-500/30 rounded-xl p-3 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                      Stop {i + 1} • km {stop.kmAlongRoute || stop.km || 80}
                    </span>
                    <h4 className="text-xs font-bold text-white mt-0.5 truncate max-w-[220px]">
                      {stop.name}
                    </h4>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full chip-available shrink-0">
                    {stop.power} kW DC
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/[.04] text-center text-[10px]">
                  <div>
                    <div className="text-slate-500">Arrival SoC</div>
                    <div className="font-bold text-amber-400 mt-0.5">
                      {stop.arrivalSoc || 24}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Top-Up Needed</div>
                    <div className="font-bold text-emerald-400 mt-0.5">
                      {formatKwh(stop.energyNeededKwh || 22.5)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Charge Duration</div>
                    <div className="font-bold text-sky-400 mt-0.5">
                      ~{stop.chargeTimeMins || 20}m
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
