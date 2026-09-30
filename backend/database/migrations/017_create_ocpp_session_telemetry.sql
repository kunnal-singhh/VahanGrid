-- 017_create_ocpp_session_telemetry.sql
--
-- Phase 3D.7B: PostgreSQL Historical Telemetry Layer for Active Charging Sessions.
--
-- Stores normalized time-series telemetry samples (Power, SoC, Net Energy)
-- captured during active charging sessions via OCPP 2.0.1 MeterValues or TransactionEvent.
--
-- Idle charger telemetry is kept transient in-memory (connectionRegistry Tier 1)
-- to prevent database row explosion.
--
-- Clean domain separation strictly maintained:
-- Zero modifications to charging_sessions, connectors, evses, locations, cpos, users, vehicles.

CREATE TABLE IF NOT EXISTS ocpp_session_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
    ocpp_transaction_id UUID NOT NULL REFERENCES ocpp_transactions(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    power_kw NUMERIC(8,3),
    soc_percent SMALLINT CHECK (soc_percent >= 0 AND soc_percent <= 100),
    energy_kwh NUMERIC(10,3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for chronological charging curve queries by session (e.g. GET /api/v1/sessions/:id/telemetry)
CREATE INDEX IF NOT EXISTS idx_ocpp_session_telemetry_curve
    ON ocpp_session_telemetry (session_id, recorded_at ASC);

-- Index for queries scoped by OCPP transaction ledger row
CREATE INDEX IF NOT EXISTS idx_ocpp_session_telemetry_tx
    ON ocpp_session_telemetry (ocpp_transaction_id);
