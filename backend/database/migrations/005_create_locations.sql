-- 005_create_locations.sql
-- Creates the locations table representing physical charging hubs/parks.
--
-- Notes:
-- - The PostGIS geography(Point, 4326) column is the authoritative spatial representation.
-- - GIST spatial index on 'location' enables ultra-fast radius & corridor queries (e.g. ST_DWithin).
-- - Latitude and longitude are retained for numeric interoperability and validation.
-- - A trigger ensures 'location' is synchronized with (longitude, latitude) automatically.
-- - Provenance fields (source_type, source_id, last_verified_at) maintain data integrity.

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpo_id UUID NOT NULL REFERENCES cpos(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  country_code VARCHAR(2) NOT NULL DEFAULT 'IN',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  location geography(Point, 4326),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  source_type VARCHAR(50) NOT NULL DEFAULT 'vahangrid',
  source_id VARCHAR(255),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_location_coordinates CHECK (
    latitude >= -90.000000 AND latitude <= 90.000000 AND
    longitude >= -180.000000 AND longitude <= 180.000000
  ),
  CONSTRAINT chk_location_status CHECK (
    status IN ('active', 'inactive', 'under_construction', 'planned', 'decommissioned')
  ),
  CONSTRAINT chk_location_source_type CHECK (
    source_type IN ('government', 'cpo', 'osm', 'ocpi', 'simulated', 'vahangrid')
  )
);

-- Trigger to automatically synchronize geography point from latitude and longitude
CREATE OR REPLACE FUNCTION trg_fn_sync_location_point()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_locations_point ON locations;
CREATE TRIGGER trg_sync_locations_point
BEFORE INSERT OR UPDATE OF latitude, longitude ON locations
FOR EACH ROW
EXECUTE FUNCTION trg_fn_sync_location_point();

-- Spatial GIST index for radius searches (e.g. ST_DWithin)
CREATE INDEX IF NOT EXISTS idx_locations_location_gist ON locations USING GIST (location);

-- Relational indexes
CREATE INDEX IF NOT EXISTS idx_locations_cpo_id ON locations(cpo_id);
CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city);
CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status);
