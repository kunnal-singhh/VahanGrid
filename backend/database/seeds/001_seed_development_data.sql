-- 001_seed_development_data.sql
-- Realistic development seed dataset for VahanGrid Phase 2B.
--
-- IMPORTANT:
-- This data represents realistic Indian EV charging hubs, operators, and vehicles
-- for local development and testing. It is clearly marked with source_type = 'simulated'.
-- It does NOT represent live hardware telemetry or real bank accounts.
--
-- All IDs are valid hexadecimal UUIDs:
--   CPOs:                a0000001-...
--   Users:               b0000001-...
--   Vehicles:            c0000001-...
--   Wallets:             d0000001-...
--   Wallet Transactions: e0000001-...
--   Locations:           f0000001-...
--   EVSEs:               e1000001-...
--   Connectors:          c1000001-...
--   Charging Sessions:   fa000001-...

BEGIN;

-- 1. CPOs (Charge Point Operators)
INSERT INTO cpos (id, name, short_code, website, support_phone, support_email, status)
VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Tata Power EZ Charge', 'TATA_EZ', 'https://www.tatapower.com/ev-charging', '+9118002095161', 'customercare@tatapower.com', 'active'),
  ('a0000001-0000-0000-0000-000000000002', 'Statiq EV Charging', 'STATIQ', 'https://www.statiq.in', '+918070807000', 'support@statiq.in', 'active'),
  ('a0000001-0000-0000-0000-000000000003', 'ChargeZone Mobility', 'CHARGEZONE', 'https://www.chargezone.com', '+918000334455', 'support@chargezone.com', 'active'),
  ('a0000001-0000-0000-0000-000000000004', 'Jio-bp pulse', 'JIO_BP', 'https://www.jiobp.com/pulse', '+9118008919023', 'support@jiobp.com', 'active'),
  ('a0000001-0000-0000-0000-000000000005', 'Kazam EV Network', 'KAZAM', 'https://www.kazam.in', '+919900112233', 'hello@kazam.in', 'active')
ON CONFLICT (short_code) DO NOTHING;

-- 2. USERS
INSERT INTO users (id, name, email, phone, password_hash, role, cpo_id)
VALUES
  -- All seed users have password: Demo@1234
  ('b0000001-0000-0000-0000-000000000001', 'Priya Sharma', 'priya.sharma@example.com', '+919876543210', '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'driver', NULL),
  ('b0000001-0000-0000-0000-000000000002', 'Rahul Verma', 'rahul.verma@example.com', '+919812345678', '$2b$10$l/X4ex6vb7qvDCcxy1q93OvIz6ewlxbKaZhpMx4ol/MdfG11BqvYK', 'driver', NULL),
  ('b0000001-0000-0000-0000-000000000003', 'Ananya Patel', 'ananya.patel@example.com', '+919823456789', '$2b$10$a0.vSoMeHId9kg/P34mAAeIj1MYsllvyXqSD4DMU7mDIr2r9dtXTu', 'driver', NULL),
  ('b0000001-0000-0000-0000-000000000004', 'Vikram Malhotra', 'vikram.malhotra@example.com', '+919834567890', '$2b$10$ibIVPEbheePtbhqKhnu2vOS5TtxM/EOncxp18.slEE6MziuLbsKWW', 'driver', NULL),
  -- Phase 4A.1 Development Operators & Admin (Tata Power, Statiq, Platform Admin)
  ('b0000001-0000-0000-0000-000000000010', 'Tata Power Operations', 'operator.tata@example.com', '+919811111111', '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'operator', 'a0000001-0000-0000-0000-000000000001'),
  ('b0000001-0000-0000-0000-000000000011', 'Statiq Fleet Manager', 'operator.statiq@example.com', '+919822222222', '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'operator', 'a0000001-0000-0000-0000-000000000002'),
  ('b0000001-0000-0000-0000-000000000012', 'Platform Super Admin', 'admin@vahangrid.com', '+919833333333', '$2b$10$fStmN8G.SgwA3jIbiV2u6eiwJ8c9lWTxvecl1AsWEKhOVbGTevG9S', 'admin', NULL)
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  cpo_id = EXCLUDED.cpo_id;

-- 3. VEHICLES (Popular Indian EV models)
INSERT INTO vehicles (id, user_id, manufacturer, model, variant, battery_capacity_kwh, usable_battery_capacity_kwh, connector_type, max_ac_power_kw, max_dc_power_kw)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'Tata Motors', 'Nexon EV Max', 'Empowered Plus', 40.50, 38.00, 'CCS2', 7.20, 50.00),
  ('c0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'MG Motor', 'ZS EV', 'Exclusive Pro', 50.30, 48.00, 'CCS2', 7.40, 60.00),
  ('c0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'Mahindra', 'XUV400', 'EL Pro', 39.40, 37.00, 'CCS2', 7.20, 50.00),
  ('c0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000004', 'Hyundai', 'Ioniq 5', 'RWD Long Range', 72.60, 70.00, 'CCS2', 11.00, 350.00)
ON CONFLICT (id) DO NOTHING;

-- 4. WALLETS (1:1 with users)
INSERT INTO wallets (id, user_id, currency, status)
VALUES
  ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000004', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000010', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000011', 'INR', 'active'),
  ('d0000001-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000012', 'INR', 'active')
ON CONFLICT (user_id) DO NOTHING;

-- 5. WALLET TRANSACTIONS (Signed ledger: Positive = Credit, Negative = Debit)
INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, reference_type, reference_id, description)
VALUES
  -- Priya's wallet (+₹2000 topup, -₹490 charging, +₹50 cashback = ₹1560)
  ('e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'topup', 2000.00, 'INR', 'payment_gateway', 'UPI_AXIS_77218392', 'VahanPass UPI Auto-Topup'),
  ('e0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000001', 'charging_payment', -490.00, 'INR', 'charging_session', 'fa000001-0000-0000-0000-000000000001', 'Fast Charge 24.5 kWh at Connaught Place'),
  ('e0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000001', 'cashback', 50.00, 'INR', 'promotional', 'GREEN_MOBILITY_REWARD', 'Clean Mobility Highway Reward'),

  -- Rahul's wallet (+₹3000 topup, -₹624 charging = ₹2376)
  ('e0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000002', 'topup', 3000.00, 'INR', 'payment_gateway', 'UPI_HDFC_99182314', 'VahanPass NetBanking Top-up'),
  ('e0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000002', 'charging_payment', -624.00, 'INR', 'charging_session', 'fa000001-0000-0000-0000-000000000002', 'DC Fast Charge 31.2 kWh at BKC Center'),

  -- Vikram's wallet (+₹5000 topup, -₹900 charging = ₹4100)
  ('e0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000004', 'topup', 5000.00, 'INR', 'payment_gateway', 'UPI_ICICI_66124509', 'Corporate Fleet Fuel Card Credit'),
  ('e0000001-0000-0000-0000-000000000007', 'd0000001-0000-0000-0000-000000000004', 'charging_payment', -900.00, 'INR', 'charging_session', 'fa000001-0000-0000-0000-000000000003', 'Ultra-fast 350kW Charge 45.0 kWh at Mile 42 Plaza')
ON CONFLICT (id) DO NOTHING;

-- 6. LOCATIONS (High-traffic Indian EV Hubs & Expressways)
-- Note: 'location' geography column is populated automatically by our trg_sync_locations_point trigger!
INSERT INTO locations (id, cpo_id, name, address_line1, address_line2, city, state, postal_code, country_code, timezone, latitude, longitude, status, source_type, source_id, last_verified_at)
VALUES
  ('f0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Connaught Place Fast Hub', 'Block B, Radial Road 2, Inner Circle', 'Near Rajiv Chowk Metro Gate 5', 'New Delhi', 'Delhi', '110001', 'IN', 'Asia/Kolkata', 28.631500, 77.216700, 'active', 'simulated', 'SEED-NDLS-CP', CURRENT_TIMESTAMP),
  ('f0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 'BKC Mobility Station', 'G Block, Bandra Kurla Complex', 'Opposite Jio World Convention Centre', 'Mumbai', 'Maharashtra', '400051', 'IN', 'Asia/Kolkata', 19.065700, 72.868700, 'active', 'simulated', 'SEED-MUM-BKC', CURRENT_TIMESTAMP),
  ('f0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003', 'Koramangala 80ft Road Hub', '17th Main Road, 4th Block', 'Near Sony World Junction', 'Bengaluru', 'Karnataka', '560034', 'IN', 'Asia/Kolkata', 12.935200, 77.624500, 'active', 'simulated', 'SEED-BLR-KRM', CURRENT_TIMESTAMP),
  ('f0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000004', 'Expressway Food Mall Mile 42', 'Mumbai-Pune Expressway, KM 42', 'Food Plaza Eastbound', 'Khalapur', 'Maharashtra', '410203', 'IN', 'Asia/Kolkata', 18.752200, 73.405600, 'active', 'simulated', 'SEED-EXP-M42', CURRENT_TIMESTAMP),
  ('f0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001', 'Cyber Hub Fast Charging Zone', 'DLF Cyber City, Building 10', 'Basement Parking Level B1', 'Gurugram', 'Haryana', '122002', 'IN', 'Asia/Kolkata', 28.495000, 77.089500, 'active', 'simulated', 'SEED-GGN-CYB', CURRENT_TIMESTAMP),
  ('f0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000005', 'Electronic City Phase 1 Smart Hub', 'Hosur Road, Electronics City', 'Next to Velankani Tech Park', 'Bengaluru', 'Karnataka', '560100', 'IN', 'Asia/Kolkata', 12.839900, 77.677000, 'active', 'simulated', 'SEED-BLR-ELC', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- 7. EVSES (Charging posts at locations)
INSERT INTO evses (id, location_id, evse_uid, evse_code, status, floor_level, physical_reference, max_power_kw)
VALUES
  -- Connaught Place (2 EVSEs)
  ('e1000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000001', 'IN*TATA*E01', 'CP-DEL-01', 'available', '0', 'Bay 1 (North)', 60.00),
  ('e1000001-0000-0000-0000-000000000002', 'f0000001-0000-0000-0000-000000000001', 'IN*TATA*E02', 'CP-DEL-02', 'available', '0', 'Bay 2 (North)', 22.00),

  -- BKC Mumbai (2 EVSEs)
  ('e1000001-0000-0000-0000-000000000003', 'f0000001-0000-0000-0000-000000000002', 'IN*STQ*E11', 'BKC-MUM-01', 'available', '0', 'Pillar G-4', 120.00),
  ('e1000001-0000-0000-0000-000000000004', 'f0000001-0000-0000-0000-000000000002', 'IN*STQ*E12', 'BKC-MUM-02', 'charging', '0', 'Pillar G-5', 60.00),

  -- Koramangala Bengaluru (1 EVSE)
  ('e1000001-0000-0000-0000-000000000005', 'f0000001-0000-0000-0000-000000000003', 'IN*CZ*E21', 'KRM-BLR-01', 'available', '0', 'Front Canopy', 60.00),

  -- Expressway Mile 42 (2 High-power EVSEs)
  ('e1000001-0000-0000-0000-000000000006', 'f0000001-0000-0000-0000-000000000004', 'IN*JIO*E31', 'EXP-M42-01', 'available', '0', 'Highway Bay A', 150.00),
  ('e1000001-0000-0000-0000-000000000007', 'f0000001-0000-0000-0000-000000000004', 'IN*JIO*E32', 'EXP-M42-02', 'available', '0', 'Highway Bay B', 60.00),

  -- Cyber Hub Gurugram (1 EVSE)
  ('e1000001-0000-0000-0000-000000000008', 'f0000001-0000-0000-0000-000000000005', 'IN*TATA*E41', 'CYB-GGN-01', 'available', '-1', 'Level B1 Slot 14', 50.00),

  -- Electronic City Bengaluru (1 EVSE)
  ('e1000001-0000-0000-0000-000000000009', 'f0000001-0000-0000-0000-000000000006', 'IN*KAZ*E51', 'ELC-BLR-01', 'available', '0', 'Outdoor Station 1', 22.00)
ON CONFLICT (id) DO NOTHING;

-- 8. CONNECTORS (Plugs/guns on EVSEs)
INSERT INTO connectors (id, evse_id, connector_id, standard, format, power_type, max_voltage_v, max_amperage_a, max_power_kw, status)
VALUES
  -- Connaught Place: EVSE 1 has CCS2 (60kW) and Bharat DC-001 (15kW)
  ('c1000001-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001', '1', 'CCS2', 'cable', 'DC', 500.00, 150.00, 60.00, 'available'),
  ('c1000001-0000-0000-0000-000000000002', 'e1000001-0000-0000-0000-000000000001', '2', 'Bharat DC-001', 'cable', 'DC', 100.00, 200.00, 15.00, 'available'),
  -- Connaught Place: EVSE 2 has Type 2 AC (22kW)
  ('c1000001-0000-0000-0000-000000000003', 'e1000001-0000-0000-0000-000000000002', '1', 'Type 2', 'socket', 'AC_3_PHASE', 415.00, 32.00, 22.00, 'available'),

  -- BKC Mumbai: EVSE 3 has Dual CCS2 (120kW split)
  ('c1000001-0000-0000-0000-000000000004', 'e1000001-0000-0000-0000-000000000003', '1', 'CCS2', 'cable', 'DC', 800.00, 200.00, 120.00, 'available'),
  ('c1000001-0000-0000-0000-000000000005', 'e1000001-0000-0000-0000-000000000003', '2', 'CCS2', 'cable', 'DC', 800.00, 200.00, 120.00, 'available'),
  -- BKC Mumbai: EVSE 4 has CCS2 (60kW, currently in active charge)
  ('c1000001-0000-0000-0000-000000000006', 'e1000001-0000-0000-0000-000000000004', '1', 'CCS2', 'cable', 'DC', 500.00, 150.00, 60.00, 'charging'),

  -- Koramangala Bengaluru: EVSE 5 has CCS2 (60kW) and CHAdeMO (50kW)
  ('c1000001-0000-0000-0000-000000000007', 'e1000001-0000-0000-0000-000000000005', '1', 'CCS2', 'cable', 'DC', 500.00, 150.00, 60.00, 'available'),
  ('c1000001-0000-0000-0000-000000000008', 'e1000001-0000-0000-0000-000000000005', '2', 'CHAdeMO', 'cable', 'DC', 500.00, 125.00, 50.00, 'available'),

  -- Expressway Mile 42: EVSE 6 Ultra-fast Dual CCS2 (150kW)
  ('c1000001-0000-0000-0000-000000000009', 'e1000001-0000-0000-0000-000000000006', '1', 'CCS2', 'cable', 'DC', 950.00, 300.00, 150.00, 'available'),
  ('c1000001-0000-0000-0000-000000000010', 'e1000001-0000-0000-0000-000000000006', '2', 'CCS2', 'cable', 'DC', 950.00, 300.00, 150.00, 'available'),
  -- Expressway Mile 42: EVSE 7 has CCS2 (60kW)
  ('c1000001-0000-0000-0000-000000000011', 'e1000001-0000-0000-0000-000000000007', '1', 'CCS2', 'cable', 'DC', 500.00, 150.00, 60.00, 'available'),

  -- Cyber Hub Gurugram: EVSE 8 has CCS2 (50kW)
  ('c1000001-0000-0000-0000-000000000012', 'e1000001-0000-0000-0000-000000000008', '1', 'CCS2', 'cable', 'DC', 500.00, 125.00, 50.00, 'available'),

  -- Electronic City Bengaluru: EVSE 9 has Type 2 AC (22kW)
  ('c1000001-0000-0000-0000-000000000013', 'e1000001-0000-0000-0000-000000000009', '1', 'Type 2', 'socket', 'AC_3_PHASE', 415.00, 32.00, 22.00, 'available')
ON CONFLICT (id) DO NOTHING;

-- 9. CHARGING SESSIONS (Historical CDRs and 1 active session)
INSERT INTO charging_sessions (
  id, user_id, vehicle_id, connector_id,
  started_at, ended_at, start_soc, end_soc,
  energy_kwh, duration_seconds, cost_amount, currency, status, external_session_id
)
VALUES
  -- Completed session 1: Priya at Connaught Place
  (
    'fa000001-0000-0000-0000-000000000001',
    'b0000001-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001',
    'c1000001-0000-0000-0000-000000000001',
    CURRENT_TIMESTAMP - INTERVAL '3 days 4 hours',
    CURRENT_TIMESTAMP - INTERVAL '3 days 3 hours 18 minutes',
    32.00, 85.00, 24.500, 2520, 490.00, 'INR', 'completed', 'TATA-SESSION-991204'
  ),

  -- Completed session 2: Rahul at BKC Mumbai
  (
    'fa000001-0000-0000-0000-000000000002',
    'b0000001-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000002',
    'c1000001-0000-0000-0000-000000000004',
    CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour',
    CURRENT_TIMESTAMP - INTERVAL '2 days 18 minutes',
    18.00, 79.00, 31.200, 2520, 624.00, 'INR', 'completed', 'STATIQ-OCPI-881231'
  ),

  -- Completed session 3: Vikram at Expressway Mile 42
  (
    'fa000001-0000-0000-0000-000000000003',
    'b0000001-0000-0000-0000-000000000004',
    'c0000001-0000-0000-0000-000000000004',
    'c1000001-0000-0000-0000-000000000009',
    CURRENT_TIMESTAMP - INTERVAL '1 day 6 hours',
    CURRENT_TIMESTAMP - INTERVAL '1 day 5 hours 36 minutes',
    20.00, 80.00, 45.000, 1440, 900.00, 'INR', 'completed', 'JIO-OCPP201-112948'
  ),

  -- Active session: Ananya currently charging at BKC Mumbai (connector c1000001...06)
  (
    'fa000001-0000-0000-0000-000000000004',
    'b0000001-0000-0000-0000-000000000003',
    'c0000001-0000-0000-0000-000000000003',
    'c1000001-0000-0000-0000-000000000006',
    CURRENT_TIMESTAMP - INTERVAL '24 minutes',
    NULL,
    42.00, 68.00, 14.800, 1440, 296.00, 'INR', 'active', 'LIVE-STATIQ-778219'
  )
ON CONFLICT (id) DO NOTHING;

-- 10. TARIFFS (Phase 3E.1)
INSERT INTO tariffs (id, name, description, cpo_id, location_id, currency, price_per_kwh, session_fee, price_per_minute, idle_fee_per_minute, grace_period_minutes, tax_rate, is_active)
VALUES
  ('e0000001-0000-0000-0000-000000000001', 'Tata Power Standard Tariff', 'Standard network pricing for Tata Power EZ Charge hubs', 'a0000001-0000-0000-0000-000000000001', NULL, 'INR', 18.5000, 10.00, 0.0000, 1.0000, 15, 0.1800, true),
  ('e0000001-0000-0000-0000-000000000002', 'Statiq City Standard Tariff', 'City charging pricing for Statiq stations', 'a0000001-0000-0000-0000-000000000002', NULL, 'INR', 16.0000, 0.00, 0.2000, 1.5000, 10, 0.1800, true),
  ('e0000001-0000-0000-0000-000000000003', 'Aerocity Hub Special Tariff', 'Discounted commercial rate for Delhi Aerocity Hub', 'a0000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000001', 'INR', 15.0000, 5.00, 0.0000, 2.0000, 15, 0.1800, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
