-- 001_create_extensions.sql
-- Enables core PostgreSQL extensions required by VahanGrid.
--
-- 1. pgcrypto: Provides cryptographic functions including gen_random_uuid() for primary keys.
-- 2. postgis: Provides spatial types (geometry, geography), spatial indexing (GIST),
--    and geospatial functions (ST_DWithin, ST_Distance, etc.) for location queries.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
