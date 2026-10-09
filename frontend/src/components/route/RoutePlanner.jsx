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
  ChevronRight,
  X,
} from 'lucide-react';
import { routeService } from '../../services/routeService';
import { formatDistance, formatDuration, formatKwh, formatCurrency } from '../../utils/formatters';

const POPULAR_CORRIDORS = [
  { from: 'Lucknow', to: 'New Delhi', fc: { lat: 26.8467, lng: 80.9462 }, tc: { lat: 28.6139, lng: 77.2090 } },
  { from: 'Delhi', to: 'Jaipur', fc: { lat: 28.6139, lng: 77.2090 }, tc: { lat: 26.9124, lng: 75.7873 } },
  { from: 'Mumbai', to: 'Pune', fc: { lat: 19.0760, lng: 72.8777 }, tc: { lat: 18.5204, lng: 73.8567 } },
  { from: 'Bengaluru', to: 'Chennai', fc: { lat: 12.9716, lng: 77.5946 }, tc: { lat: 13.0827, lng: 80.2707 } },
];

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
  onRouteCalculated,
}) {
  const [fromQuery, setFromQuery] = useState('Lucknow, Uttar Pradesh');
  const [toQuery, setToQuery] = useState('New Delhi, India');
  const [fromCoords, setFromCoords] = useState({ lat: 26.8467, lng: 80.9462 });
  const [toCoords, setToCoords] = useState({ lat: 28.6139, lng: 77.2090 });

  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [isFromOpen, setIsFromOpen] = useState(false);
  const [isToOpen, setIsToOpen] = useState(false);
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);

  const fromContainerRef = useRef(null);
  const toContainerRef = useRef(null);
  const hasTypedFrom = useRef(false);
  const hasTypedTo = useRef(false);

  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [plannedStops, setPlannedStops] = useState([]);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      if (fromContainerRef.current && !fromContainerRef.current.contains(e.target)) {
        setIsFromOpen(false);
      }
      if (toContainerRef.current && !toContainerRef.current.contains(e.target)) {
        setIsToOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Place Searches: ONLY runs when user actively types (NOT on initial load)
  useEffect(() => {
    if (!hasTypedFrom.current || !fromQuery || fromQuery.trim().length < 2) {
      setFromSuggestions([]);
      setIsFromOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingFrom(true);
      const results = await routeService.searchPlaces(fromQuery);
      setFromSuggestions(results || []);
      setIsSearchingFrom(false);
      setIsFromOpen((results || []).length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [fromQuery]);

  useEffect(() => {
    if (!hasTypedTo.current || !toQuery || toQuery.trim().length < 2) {
      setToSuggestions([]);
      setIsToOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingTo(true);
      const results = await routeService.searchPlaces(toQuery);
      setToSuggestions(results || []);
      setIsSearchingTo(false);
      setIsToOpen((results || []).length > 0);
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
      if (onRouteCalculated) {
        onRouteCalculated({
          fromLabel: fromQuery.split(',')[0].trim() || 'Origin',
          toLabel: toQuery.split(',')[0].trim() || 'Destination',
          distanceKm: result.distanceKm,
          durationMins: result.durationMins,
        });
      }
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
    setFromSuggestions([]);
    setToSuggestions([]);
    setIsFromOpen(false);
    setIsToOpen(false);
    hasTypedFrom.current = false;
    hasTypedTo.current = false;
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
        <div className="relative" ref={fromContainerRef}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-400" /> Starting Point
            </label>
            {fromCoords && (
              <span className="text-[9px] text-emerald-400 font-medium">Point set</span>
            )}
          </div>
          <div className="flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-2 focus-within:border-sky-500/40 transition-colors">
            <input
              type="text"
              value={fromQuery}
              onChange={(e) => {
                hasTypedFrom.current = true;
                setFromQuery(e.target.value);
              }}
              onFocus={() => {
                if (hasTypedFrom.current && fromSuggestions.length > 0) {
                  setIsFromOpen(true);
                }
              }}
              placeholder="Enter departure city / town..."
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
            {isSearchingFrom && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 ml-1" />}
            {fromQuery && (
              <button
                type="button"
                onClick={() => {
                  setFromQuery('');
                  setFromCoords(null);
                  setFromSuggestions([]);
                  setIsFromOpen(false);
                  hasTypedFrom.current = false;
                }}
                className="text-slate-400 hover:text-white p-0.5 ml-1 transition-colors"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Suggestions Dropdown (Only shown when user is typing) */}
          {isFromOpen && fromSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-50 border border-white/[.12] shadow-2xl animate-fade-in">
              {fromSuggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setFromQuery(item.shortName || item.displayName);
                    setFromCoords({ lat: item.lat, lng: item.lng });
                    setFromSuggestions([]);
                    setIsFromOpen(false);
                    hasTypedFrom.current = false;
                  }}
                  className="px-3 py-2 text-xs cursor-pointer border-b border-white/[.04] last:border-0 transition-colors hover:bg-sky-500/20"
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
        <div className="relative" ref={toContainerRef}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-rose-400" /> Destination
            </label>
            {toCoords && (
              <span className="text-[9px] text-emerald-400 font-medium">Point set</span>
            )}
          </div>
          <div className="flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-2 focus-within:border-sky-500/40 transition-colors">
            <input
              type="text"
              value={toQuery}
              onChange={(e) => {
                hasTypedTo.current = true;
                setToQuery(e.target.value);
              }}
              onFocus={() => {
                if (hasTypedTo.current && toSuggestions.length > 0) {
                  setIsToOpen(true);
                }
              }}
              placeholder="Enter destination..."
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
            {isSearchingTo && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 ml-1" />}
            {toQuery && (
              <button
                type="button"
                onClick={() => {
                  setToQuery('');
                  setToCoords(null);
                  setToSuggestions([]);
                  setIsToOpen(false);
                  hasTypedTo.current = false;
                }}
                className="text-slate-400 hover:text-white p-0.5 ml-1 transition-colors"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Suggestions Dropdown (Only shown when user is typing) */}
          {isToOpen && toSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-50 border border-white/[.12] shadow-2xl animate-fade-in">
              {toSuggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setToQuery(item.shortName || item.displayName);
                    setToCoords({ lat: item.lat, lng: item.lng });
                    setToSuggestions([]);
                    setIsToOpen(false);
                    hasTypedTo.current = false;
                  }}
                  className="px-3 py-2 text-xs cursor-pointer border-b border-white/[.04] last:border-0 transition-colors hover:bg-sky-500/20"
                >
                  <div className="font-semibold">{item.shortName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{item.displayName}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Popular Corridors Quick-Picks */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[9px] uppercase font-bold text-slate-400">Popular:</span>
          {POPULAR_CORRIDORS.map((c, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setFromQuery(c.from);
                setFromCoords(c.fc);
                setToQuery(c.to);
                setToCoords(c.tc);
                setFromSuggestions([]);
                setToSuggestions([]);
                setIsFromOpen(false);
                setIsToOpen(false);
                hasTypedFrom.current = false;
                hasTypedTo.current = false;
              }}
              className="text-[10px] px-2 py-0.5 rounded-lg bg-white/[.04] hover:bg-sky-500/15 border border-white/[.06] hover:border-sky-500/30 text-slate-300 hover:text-sky-400 transition-colors cursor-pointer"
            >
              {c.from} → {c.to}
            </button>
          ))}
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
