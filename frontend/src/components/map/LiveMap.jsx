import { useEffect, useRef } from 'react';

const STATUS_COLORS = {
  available: '#10b981', // Emerald
  occupied:  '#f43f5e', // Rose
  reserved:  '#f59e0b', // Amber
  offline:   '#64748b', // Slate
};

const DEFAULT_DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DEFAULT_LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export default function LiveMap({
  stations = [],
  selectedStation,
  onSelectStation,
  routeActive,
  mapId = 'vahangrid-main-map',
  theme = 'dark',
  routePath = [],
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const routeLineRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!window.L || !containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const L = window.L;
    const indiaBounds = L.latLngBounds([6.0, 68.0], [37.5, 97.5]);

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      maxBounds: indiaBounds,
      maxBoundsViscosity: 0.8,
    }).setView([27.2, 79.5], 6.5);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileUrl =
      theme === 'light'
        ? import.meta.env.VITE_CARTO_VOYAGER_URL || DEFAULT_LIGHT_TILES
        : import.meta.env.VITE_CARTO_DARK_URL || DEFAULT_DARK_TILES;

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const timer = setTimeout(() => {
      if (map) map.invalidateSize();
    }, 120);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      routeLineRef.current = null;
    };
  }, [mapId]);

  // Tile layer update on theme toggle
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const map = mapRef.current;
    const L = window.L;

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const tileUrl =
      theme === 'light'
        ? import.meta.env.VITE_CARTO_VOYAGER_URL || DEFAULT_LIGHT_TILES
        : import.meta.env.VITE_CARTO_DARK_URL || DEFAULT_DARK_TILES;

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);
  }, [theme]);

  // ResizeObserver for dynamic layout adaptations
  useEffect(() => {
    if (!mapRef.current || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Update Markers
  useEffect(() => {
    if (!mapRef.current || !markersRef.current || !window.L) return;
    const L = window.L;
    markersRef.current.clearLayers();

    stations.forEach((st) => {
      if (typeof st.lat !== 'number' || typeof st.lng !== 'number') return;

      const color = STATUS_COLORS[st.status] || '#64748b';
      const isSelected = selectedStation?.id === st.id;
      const size = isSelected ? 24 : 15;

      const icon = L.divIcon({
        className: 'vahangrid-marker-icon',
        iconSize: [size + 16, size + 16],
        iconAnchor: [(size + 16) / 2, (size + 16) / 2],
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border: 2px solid ${isSelected ? '#ffffff' : 'rgba(0,0,0,0.4)'};
            border-radius: 50%;
            box-shadow: 0 0 ${isSelected ? 24 : 12}px ${color};
            transition: all 0.25s ease;
            cursor: pointer;
            position: relative;
            margin: auto;
          ">
            ${
              st.status === 'available'
                ? `<span style="position: absolute; inset: -4px; border-radius: 50%; border: 1.5px solid ${color}; opacity: 0.6; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>`
                : ''
            }
          </div>
        `,
      });

      const marker = L.marker([st.lat, st.lng], { icon });
      marker.on('click', () => {
        if (onSelectStation) onSelectStation(st);
      });

      marker.bindTooltip(
        `
        <div style="font-weight: 700; font-size: 11px; margin-bottom: 2px;">${st.name}</div>
        <div style="font-size: 10px; color: #94a3b8;">
          ⚡ ${st.power} kW • ₹${st.price}/kWh • <span style="color: ${color}; font-weight: 600;">${st.status.toUpperCase()}</span>
        </div>
        <div style="font-size: 9px; color: #38bdf8; margin-top: 4px; font-weight: 600;">Click to view live hub telemetry</div>
        `,
        {
          direction: 'top',
          offset: [0, -size / 2 - 4],
          className: 'custom-tooltip',
          permanent: false,
        }
      );

      markersRef.current.addLayer(marker);
    });
  }, [stations, selectedStation, onSelectStation]);

  // Center on selected station
  useEffect(() => {
    if (!mapRef.current || !selectedStation) return;
    mapRef.current.setView([selectedStation.lat, selectedStation.lng], 12, {
      animate: true,
      duration: 0.8,
    });
  }, [selectedStation]);

  // Polyline for Route Planner
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;

    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (routeActive && routePath && routePath.length > 0) {
      mapRef.current.invalidateSize();

      routeLineRef.current = L.polyline(routePath, {
        color: '#06b6d4',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8',
        lineCap: 'round',
      }).addTo(mapRef.current);

      setTimeout(() => {
        if (mapRef.current && routeLineRef.current) {
          mapRef.current.invalidateSize();
          mapRef.current.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });
        }
      }, 150);
    }
  }, [routeActive, routePath]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-2xl overflow-hidden min-h-[350px] relative shadow-inner"
    />
  );
}
