/**
 * frontend/src/components/map/LiveMap.jsx
 *
 * Interactive MapBox GL JS v3 map for VahanGrid.
 *
 * Features:
 *  - Dark / Light style switching via MapBox built-in styles
 *  - Custom glowing circle markers per station status
 *  - Hover popups with station info (name, power, price, status)
 *  - Route polyline with animated dash for the Route Planner
 *  - Smooth flyTo animation on station selection
 *  - India bounds restriction
 */

import { useEffect, useRef } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// MapBox style URIs
const STYLE_DARK  = 'mapbox://styles/mapbox/navigation-night-v1';
const STYLE_LIGHT = 'mapbox://styles/mapbox/navigation-day-v1';

const STATUS_COLORS = {
  available: '#10b981', // Emerald
  occupied:  '#f43f5e', // Rose
  reserved:  '#f59e0b', // Amber
  offline:   '#64748b', // Slate
};

// India bounding box [sw, ne]
const INDIA_BOUNDS = [[68.0, 6.0], [97.5, 37.5]];

export default function LiveMap({
  stations = [],
  selectedStation,
  onSelectStation,
  routeActive,
  mapId = 'vahangrid-main-map',
  theme = 'dark',
  routePath = [],
}) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const markersRef    = useRef([]);   // array of mapboxgl.Marker instances
  const popupsRef     = useRef([]);   // array of open mapboxgl.Popup instances
  const routeAddedRef = useRef(false);

  // ── 1. Initialise MapBox map ───────────────────────────────────────────────
  useEffect(() => {
    if (!window.mapboxgl || !containerRef.current) return;

    const mapboxgl = window.mapboxgl;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: theme === 'light' ? STYLE_LIGHT : STYLE_DARK,
      center: [79.5, 22.5],   // centre of India
      zoom: 4.8,
      maxBounds: [[60.0, 2.0], [100.0, 40.0]], // slightly wider than India for UX
      attributionControl: false,
    });

    // Navigation controls (bottom-right)
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Attribution (compact)
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    mapRef.current = map;

    // Resize fix for dynamic layouts
    const timer = setTimeout(() => map.resize(), 150);

    return () => {
      clearTimeout(timer);
      // Clean up markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      popupsRef.current.forEach(p => p.remove());
      popupsRef.current = [];
      map.remove();
      mapRef.current = null;
      routeAddedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]); // re-init only if mapId changes

  // ── 2. Switch theme (style) without full re-init ─────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const style = theme === 'light' ? STYLE_LIGHT : STYLE_DARK;
    mapRef.current.setStyle(style);
    // Route layer is lost on style change — reset flag so it gets re-added
    routeAddedRef.current = false;
  }, [theme]);

  // ── 3. ResizeObserver ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── 4. Station markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !window.mapboxgl) return;
    const mapboxgl = window.mapboxgl;
    const map = mapRef.current;

    // Remove old markers & popups
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];

    stations.forEach((st) => {
      if (typeof st.lat !== 'number' || typeof st.lng !== 'number') return;

      const color      = STATUS_COLORS[st.status] || '#64748b';
      const isSelected = selectedStation?.id === st.id;
      const size       = isSelected ? 22 : 14;

      // Custom HTML marker element
      const el = document.createElement('div');
      el.className = 'vg-mapbox-marker';
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 2px solid ${isSelected ? '#ffffff' : 'rgba(0,0,0,0.35)'};
        border-radius: 50%;
        box-shadow: 0 0 ${isSelected ? 20 : 10}px ${color},
                    0 0 ${isSelected ? 40 : 20}px ${color}55;
        cursor: pointer;
        transition: all 0.25s ease;
        position: relative;
      `;

      // Pulsing ring for available stations
      if (st.status === 'available') {
        const ring = document.createElement('span');
        ring.style.cssText = `
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          border: 1.5px solid ${color};
          opacity: 0.7;
          animation: vg-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        `;
        el.appendChild(ring);
      }

      // Popup with station details
      const popup = new mapboxgl.Popup({
        offset: size + 6,
        closeButton: false,
        closeOnClick: false,
        className: 'vg-mapbox-popup',
      }).setHTML(`
        <div style="font-family: 'Inter', sans-serif; min-width: 160px; padding: 2px;">
          <div style="font-weight: 700; font-size: 12px; color: #f8fafc; margin-bottom: 4px; line-height: 1.3;">
            ${st.name}
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 3px;">
            ⚡ ${st.power} kW &nbsp;•&nbsp; ₹${st.price}/kWh
          </div>
          <div style="font-size: 10px; font-weight: 700; color: ${color};">
            ${(st.status || 'unknown').toUpperCase()}
          </div>
          <div style="font-size: 9px; color: #38bdf8; margin-top: 5px; font-weight: 600;">
            Click to view live hub
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([st.lng, st.lat])
        .addTo(map);

      // Show popup on hover
      el.addEventListener('mouseenter', () => popup.setLngLat([st.lng, st.lat]).addTo(map));
      el.addEventListener('mouseleave', () => popup.remove());

      // Select station on click
      el.addEventListener('click', () => {
        if (onSelectStation) onSelectStation(st);
      });

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });
  }, [stations, selectedStation, onSelectStation]);

  // ── 5. Fly to selected station ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selectedStation) return;
    mapRef.current.flyTo({
      center: [selectedStation.lng, selectedStation.lat],
      zoom: 13,
      speed: 1.4,
      curve: 1.2,
    });
  }, [selectedStation]);

  // ── 6. Route polyline ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const addRoute = () => {
      // Remove previous route layers/source if they exist
      if (map.getLayer('vg-route-line'))   map.removeLayer('vg-route-line');
      if (map.getLayer('vg-route-glow'))   map.removeLayer('vg-route-glow');
      if (map.getSource('vg-route'))       map.removeSource('vg-route');
      routeAddedRef.current = false;

      if (!routeActive || !routePath || routePath.length < 2) return;

      // routePath is [[lat, lng], ...] — MapBox needs [lng, lat]
      const coordinates = routePath.map(([lat, lng]) => [lng, lat]);

      map.addSource('vg-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
        },
      });

      // Glow layer (wider, translucent)
      map.addLayer({
        id: 'vg-route-glow',
        type: 'line',
        source: 'vg-route',
        paint: {
          'line-color': '#06b6d4',
          'line-width': 10,
          'line-opacity': 0.25,
          'line-blur': 4,
        },
      });

      // Main animated dashed line
      map.addLayer({
        id: 'vg-route-line',
        type: 'line',
        source: 'vg-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 4,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2],
        },
      });

      routeAddedRef.current = true;

      // Fit the viewport to the route
      const lngs = coordinates.map(c => c[0]);
      const lats = coordinates.map(c => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 1200 }
      );
    };

    // Wait for style to be loaded before adding layers
    if (map.isStyleLoaded()) {
      addRoute();
    } else {
      map.once('styledata', addRoute);
    }
  }, [routeActive, routePath]);

  return (
    <>
      {/* Inline animation keyframe for pulsing markers */}
      <style>{`
        @keyframes vg-ping {
          0%   { transform: scale(1);   opacity: 0.8; }
          70%  { transform: scale(1.9); opacity: 0;   }
          100% { transform: scale(1.9); opacity: 0;   }
        }
        .vg-mapbox-popup .mapboxgl-popup-content {
          background: rgba(7, 12, 29, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          color: #f8fafc;
        }
        .vg-mapbox-popup .mapboxgl-popup-tip { display: none; }
        .mapboxgl-ctrl-bottom-left { margin-bottom: 4px !important; }
      `}</style>
      <div
        ref={containerRef}
        className="w-full h-full rounded-2xl overflow-hidden min-h-[350px] relative shadow-inner"
      />
    </>
  );
}
