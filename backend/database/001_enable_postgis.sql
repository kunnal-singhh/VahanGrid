-- database/001_enable_postgis.sql
--
-- Phase 2A: Enable PostGIS extension on the VahanGrid database.
--
-- WHY POSTGIS:
-- VahanGrid's primary value is geospatial: "find chargers near me",
-- "plan a route between cities with charging stops". PostgreSQL alone stores
-- coordinates as plain numbers and makes you calculate distances in application
-- code, which is slow and hard to index.
--
-- PostGIS adds:
--   • geometry / geography column types  → store actual point/line/polygon data
--   • Spatial functions                  → ST_DWithin, ST_Distance, ST_Contains
--   • GIST spatial indexes               → fast "within radius" queries at scale
--
-- Without PostGIS: "find chargers within 30 km" = load ALL stations, filter in JS.
-- With PostGIS:    "find chargers within 30 km" = single indexed SQL query.
--
-- HOW TO RUN:
--   psql -U <your_user> -d vahangrid_db -f database/001_enable_postgis.sql
--
-- Requires: PostgreSQL + PostGIS installed on the server.
-- The IF NOT EXISTS guard makes it safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify the installation:
SELECT postgis_version();
