/**
 * ============================================================================
 * VAHANGRID DEVELOPMENT MOCK DATA — NOT PRODUCTION DATA
 * ============================================================================
 * 
 * DISCLAIMER & ARCHITECTURAL NOTE:
 * This file contains strictly development-stage mock data for UI testing and
 * client-side layout validation.
 * 
 * In production phases, this data source will be entirely superseded by:
 * - PostgreSQL + PostGIS geospatial databases
 * - Certified CPO integrations via OCPI 2.2.1
 * - Direct charger communication via OCPP 2.0.1
 * - Real-time telemetry via MQTT
 * - Official government datasets (BEE, OpenStreetMap, CPO partners)
 * 
 * DO NOT import this file directly into visual components.
 * Always consume data through the appropriate service in `src/services/`.
 * ============================================================================
 */

export const IS_MOCK_DATA = true;
export const MOCK_DATA_VERSION = '1.0.0-dev';

// ─── Major Indian Charge Point Operators (CPOs) ───
export const OPERATORS = [
  { id: 'tata',       name: 'Tata Power EZ Charge', logo: '⚡', accent: '#06b6d4', shortName: 'Tata Power' },
  { id: 'statiq',     name: 'Statiq EV Network',    logo: '🔋', accent: '#3b82f6', shortName: 'Statiq' },
  { id: 'chargezone', name: 'ChargeZone InterCity', logo: '🟢', accent: '#10b981', shortName: 'ChargeZone' },
  { id: 'jiobp',      name: 'Jio-bp pulse',         logo: '🟠', accent: '#f97316', shortName: 'Jio-bp' },
  { id: 'kazam',      name: 'Kazam EV',             logo: '🔌', accent: '#8b5cf6', shortName: 'Kazam' },
];

// Note: VEHICLES mock array removed in Phase 3C.2.
// Real vehicles are managed via PostgreSQL REST API (/api/v1/vehicles).

// ─── Reference Charging Stations Across Key Indian Corridors ───
export const STATIONS = [
  {
    id: 'VG-LKO-01',
    name: 'Tata Power Hub — Hazratganj',
    operator: 'tata',
    address: 'Hazratganj Main Corridor, Lucknow, UP',
    lat: 26.8504,
    lng: 80.9422,
    status: 'available',
    connector: 'CCS2',
    power: 60,
    price: 18.5,
    queue: 0,
    waitMin: 0,
    uptime: 99.4,
    latency: 42,
    temp: 34,
    voltage: 415,
    current: 0,
    faultRisk: 2,
    forecast: [30, 45, 60, 20, 15, 30],
  },
  {
    id: 'VG-KNP-02',
    name: 'Statiq Fast — Kanpur NH19 Hub',
    operator: 'statiq',
    address: 'NH-19 Bypass, Panki, Kanpur, UP',
    lat: 26.4712,
    lng: 80.2618,
    status: 'occupied',
    connector: 'CCS2',
    power: 120,
    price: 21.0,
    queue: 2,
    waitMin: 12,
    uptime: 96.8,
    latency: 128,
    temp: 45,
    voltage: 408,
    current: 285,
    faultRisk: 14,
    forecast: [90, 95, 80, 75, 60, 45],
  },
  {
    id: 'VG-AGR-03',
    name: 'ChargeZone — Yamuna Expressway km100',
    operator: 'chargezone',
    address: 'Yamuna Expressway Toll Oasis, Agra, UP',
    lat: 27.1625,
    lng: 78.0215,
    status: 'available',
    connector: 'CCS2',
    power: 60,
    price: 19.0,
    queue: 0,
    waitMin: 0,
    uptime: 98.9,
    latency: 55,
    temp: 31,
    voltage: 412,
    current: 0,
    faultRisk: 5,
    forecast: [20, 10, 40, 75, 80, 90],
  },
  {
    id: 'VG-MTR-04',
    name: 'Jio-bp pulse — Mathura Plaza Plaza',
    operator: 'jiobp',
    address: 'Refinery Overbridge Road, Mathura, UP',
    lat: 27.5255,
    lng: 77.6212,
    status: 'reserved',
    connector: 'CCS2',
    power: 150,
    price: 22.5,
    queue: 1,
    waitMin: 6,
    uptime: 97.5,
    latency: 68,
    temp: 41,
    voltage: 418,
    current: 120,
    faultRisk: 12,
    forecast: [80, 90, 85, 70, 50, 40],
  },
  {
    id: 'VG-JWR-05',
    name: 'Tata Power UltraFast — Jewar Airport Corridor',
    operator: 'tata',
    address: 'Jewar Interchange Plaza, Gautam Buddha Nagar, UP',
    lat: 28.1402,
    lng: 77.5852,
    status: 'available',
    connector: 'CCS2',
    power: 180,
    price: 20.0,
    queue: 0,
    waitMin: 0,
    uptime: 99.8,
    latency: 38,
    temp: 29,
    voltage: 421,
    current: 0,
    faultRisk: 1,
    forecast: [15, 30, 45, 55, 60, 70],
  },
  {
    id: 'VG-DLH-06',
    name: 'Statiq SuperHub — Sarita Vihar Metro',
    operator: 'statiq',
    address: 'Sarita Vihar Metro Station Parking, New Delhi',
    lat: 28.5284,
    lng: 77.2915,
    status: 'offline',
    connector: 'CCS2',
    power: 120,
    price: 21.0,
    queue: 0,
    waitMin: 0,
    uptime: 84.2,
    latency: 0,
    temp: 18,
    voltage: 0,
    current: 0,
    faultRisk: 92,
    forecast: [0, 0, 0, 0, 0, 0],
  },
  {
    id: 'VG-LKO-07',
    name: 'ChargeZone AC & DC — Gomti Nagar Extension',
    operator: 'chargezone',
    address: 'Shaheed Path, Gomti Nagar Extension, Lucknow',
    lat: 26.8655,
    lng: 80.9982,
    status: 'available',
    connector: 'Type2',
    power: 22,
    price: 15.0,
    queue: 0,
    waitMin: 0,
    uptime: 99.1,
    latency: 48,
    temp: 28,
    voltage: 230,
    current: 0,
    faultRisk: 3,
    forecast: [10, 15, 20, 25, 40, 50],
  },
  {
    id: 'VG-BLR-08',
    name: 'Kazam Fast — Electronic City Flyover',
    operator: 'kazam',
    address: 'Hosur Main Road, Electronic City, Bengaluru, Karnataka',
    lat: 12.8452,
    lng: 77.6602,
    status: 'available',
    connector: 'CCS2',
    power: 120,
    price: 19.5,
    queue: 0,
    waitMin: 0,
    uptime: 99.2,
    latency: 32,
    temp: 29,
    voltage: 414,
    current: 0,
    faultRisk: 4,
    forecast: [25, 30, 45, 60, 50, 35],
  },
  {
    id: 'VG-BOM-09',
    name: 'Tata Power MegaHub — Navi Mumbai Palm Beach',
    operator: 'tata',
    address: 'Palm Beach Galleria, Vashi, Navi Mumbai, Maharashtra',
    lat: 19.0688,
    lng: 73.0039,
    status: 'available',
    connector: 'CCS2',
    power: 150,
    price: 21.5,
    queue: 1,
    waitMin: 5,
    uptime: 98.7,
    latency: 41,
    temp: 33,
    voltage: 416,
    current: 110,
    faultRisk: 8,
    forecast: [40, 50, 70, 85, 65, 40],
  },
  {
    id: 'VG-PUN-10',
    name: 'Jio-bp pulse — Hinjewadi Phase 1',
    operator: 'jiobp',
    address: 'Rajiv Gandhi Infotech Park, Hinjewadi, Pune, Maharashtra',
    lat: 18.5912,
    lng: 73.7389,
    status: 'available',
    connector: 'CCS2',
    power: 60,
    price: 18.0,
    queue: 0,
    waitMin: 0,
    uptime: 99.5,
    latency: 35,
    temp: 30,
    voltage: 415,
    current: 0,
    faultRisk: 3,
    forecast: [20, 35, 55, 70, 60, 30],
  }
];

// ─── Reference Geographic Boundary Polygon for India Filtering ───
export const INDIA_POLYGON = [
  [34.5, 74.0], [35.6, 76.8], [34.5, 78.5], [31.0, 78.8], [30.2, 80.5],
  [27.4, 88.1], [28.0, 88.8], [27.3, 88.9], [27.8, 91.5], [29.3, 96.0],
  [28.2, 97.3], [24.3, 94.5], [22.0, 93.0], [24.0, 92.2], [25.2, 89.8],
  [22.0, 89.0], [21.6, 87.0], [17.0, 82.2], [13.0, 80.3], [9.0, 79.8],
  [8.0, 77.5],  [10.0, 76.0], [15.0, 73.8], [19.0, 72.8], [23.5, 68.2],
  [24.6, 71.0], [26.8, 69.3], [30.0, 73.8], [32.5, 75.6], [34.0, 74.2],
];

// ─── Default Sample Corridor Route (Lucknow -> Delhi via Yamuna Expressway) ───
export const DEFAULT_CORRIDOR_PATH = [
  [26.8467, 80.9462], [26.7584, 80.7012], [26.6110, 80.4501],
  [26.4499, 80.3319], [26.5401, 79.9102], [26.8821, 79.0232],
  [27.1767, 78.0081], [27.3501, 77.8102], [27.5255, 77.6212],
  [27.8102, 77.5852], [28.1402, 77.5852], [28.4744, 77.5040],
  [28.5800, 77.3100], [28.6139, 77.2090],
];

// ─── Reference Initial Transactions (VahanPass Roaming) ───
export const INITIAL_TRANSACTIONS = [
  {
    id: 'tx-101',
    op: 'Tata Power EZ Charge',
    station: 'Hazratganj Hub',
    kwh: 28.4,
    cost: 525.40,
    time: '24 Sep, 10:15 AM',
    type: 'Direct',
    status: 'Completed',
    isOffline: false,
  },
  {
    id: 'tx-102',
    op: 'ChargeZone InterCity',
    station: 'Yamuna Exp km100',
    kwh: 34.2,
    cost: 649.80,
    time: '22 Sep, 02:40 PM',
    type: 'Roaming (OCPI)',
    status: 'Completed',
    isOffline: false,
  },
  {
    id: 'tx-103',
    op: 'Statiq EV Network',
    station: 'Kanpur NH19 Hub',
    kwh: 19.8,
    cost: 415.80,
    time: '18 Sep, 06:12 PM',
    type: 'Roaming (OCPI)',
    status: 'Completed',
    isOffline: false,
  },
  {
    id: 'tx-104',
    op: 'Jio-bp pulse',
    station: 'Mathura Plaza Plaza',
    kwh: 38.0,
    cost: 855.00,
    time: '12 Sep, 11:30 AM',
    type: 'Roaming (OCPI)',
    status: 'Completed',
    isOffline: true,
  }
];

// ─── Development AI Responses for VahanGrid Mobility Copilot ───
export const AI_MOCK_KNOWLEDGE = {
  range: (soc, dest, vehicle) => {
    const range = vehicle ? vehicle.range : 437;
    const name = vehicle ? vehicle.name : 'Tata Nexon EV Max';
    const remaining = Math.round((range * soc) / 100);
    const estDistance = 330; // km
    const isReachable = remaining >= estDistance;

    return `### ⚡ VahanGrid Range Estimation\n\n` +
      `Vehicle: **${name}** (Rated Range: **${range} km**)\n` +
      `Current Battery SoC: **${soc}%** (~**${remaining} km** remaining range)\n` +
      `Estimated Corridor Distance: **~${estDistance} km** to ${dest}\n\n` +
      (isReachable
        ? `✅ **Direct Reach Achievable:** You can reach ${dest} with approx. **${remaining - estDistance} km** battery buffer.`
        : `⚠️ **Midway Charging Required:** Battery level insufficient for non-stop transit.\n\n` +
          `**Recommended Stop:** *Statiq Fast — Kanpur NH19 Hub* (at km 80).\n` +
          `• Recommended Top-Up: 18 mins to 80% SoC.\n` +
          `• Connector: CCS2 (120 kW Fast DC)`);
  },
  offline: `### 🛡️ VahanGrid Resilient Edge Mode\n\n` +
    `When cellular connectivity is unavailable along remote highway stretches:\n\n` +
    `1. **Local Authentication:** Cryptographic offline token validation via VahanPass RFID / NFC.\n` +
    `2. **Continuous Metering:** Local hardware energy tracking continues uninterrupted.\n` +
    `3. **Secure Transaction Storage:** Signed session log cached on local hardware storage.\n` +
    `4. **Automatic Reconciliation:** Sessions automatically sync when network handshake restores.\n\n` +
    `*Your charging experience never halts due to connectivity dropouts.*`,
  cheapest: `### 💰 Economical Charging Stations (Current Corridor)\n\n` +
    `1. **ChargeZone AC — Gomti Nagar**: ₹15.0 / kWh (22 kW Type 2)\n` +
    `2. **Tata Power Hub — Hazratganj**: ₹18.5 / kWh (60 kW CCS2 DC)\n` +
    `3. **ChargeZone — Yamuna Expressway**: ₹19.0 / kWh (60 kW CCS2 DC)\n\n` +
    `💡 *Tip: Off-peak solar tariffs apply between 11:00 AM – 03:00 PM on participating green microgrids.*`,
  payment: `### 💳 VahanPass Unified Mobility Pass\n\n` +
    `One balance across all Indian EV charging networks:\n\n` +
    `• **Cross-Network Roaming:** Plug and charge across Tata Power, Statiq, ChargeZone, and Jio-bp.\n` +
    `• **Flexible Top-Up:** Instant refill via UPI, RuPay, Net Banking, or Credit Cards.\n` +
    `• **Consolidated GST Invoicing:** Single unified monthly tax invoice across all CPOs.\n` +
    `• **Zero Lock-In:** No need for 10+ different charging apps on your phone.`,
  default: `I am **VahanGrid Mobility Copilot**, your unified EV travel assistant.\n\n` +
    `You can ask me questions like:\n` +
    `• *"Can I reach Delhi with 40% battery?"*\n` +
    `• *"Which charger is cheapest on the Yamuna Expressway?"*\n` +
    `• *"How does VahanPass cross-network roaming work?"*\n` +
    `• *"How does offline charging work in remote areas?"*`
};
