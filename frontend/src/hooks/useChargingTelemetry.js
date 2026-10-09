/**
 * frontend/src/hooks/useChargingTelemetry.js
 *
 * Real-time charging telemetry polling and state management hook (Phase 3F).
 *
 * Responsibilities:
 *  - Polls authoritative session and time-series telemetry (5-second cadence).
 *  - Automatically pauses polling when document is hidden (battery/network friendly).
 *  - Concurrency guards: prevents overlapping requests and cleans up unmounted listeners.
 *  - Derives live charging metrics: latest genuine power (kW), SoC (%), and energy (kWh).
 *  - Computes deterministic estimated cost using session tariff snapshot.
 *  - Handles stop charging flow and retrieves finalized CDR upon completion.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { chargingService } from '../services/chargingService';

const POLLING_INTERVAL_MS = 5000;
const FRESHNESS_LIVE_MS = 20000;
const FRESHNESS_IDLE_MS = 60000;

export function useChargingTelemetry({ initialSession, onSessionStopped, isActive = true }) {
  const [session, setSession] = useState(initialSession || null);
  const [telemetry, setTelemetry] = useState([]);
  const [finalCdr, setFinalCdr] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // Authoritative elapsed duration clock (ticks every 1s locally)
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (initialSession?.started_at) {
      const started = new Date(initialSession.started_at).getTime();
      return Math.max(0, Math.floor((Date.now() - started) / 1000));
    }
    return initialSession?.duration_seconds || initialSession?.durationSeconds || 0;
  });

  const inFlightRef = useRef(false);
  const abortControllerRef = useRef(null);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  // Keep internal session synced if initialSession prop changes
  useEffect(() => {
    if (initialSession) {
      setSession(initialSession);
      if (initialSession.started_at) {
        const started = new Date(initialSession.started_at).getTime();
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
      }
    }
  }, [initialSession?.id, initialSession?.started_at]);

  // 1. Local live elapsed timer (ticks 1s, syncs with server started_at)
  useEffect(() => {
    if (!session?.started_at || session.status === 'completed' || session.status === 'stopped') {
      return;
    }

    timerRef.current = setInterval(() => {
      const started = new Date(session.started_at).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.started_at, session?.status]);

  // 2. Authoritative Fetch: session details & telemetry
  const fetchTelemetryData = useCallback(async () => {
    const sessionId = session?.id || session?.sessionId;
    if (!sessionId || inFlightRef.current) return;

    // Do not poll if session has already reached a terminal state
    if (session?.status === 'completed' || session?.status === 'stopped' || session?.status === 'failed') {
      return;
    }

    inFlightRef.current = true;
    setIsPolling(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const [updatedSession, samples] = await Promise.all([
        chargingService.getSessionById(sessionId).catch(() => null),
        chargingService.getSessionTelemetry(sessionId, { signal }).catch(() => null),
      ]);

      if (updatedSession) {
        setSession(updatedSession);
      }

      if (Array.isArray(samples)) {
        setTelemetry(samples);
      }

      setLastRefreshedAt(new Date());
      setPollError(null);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[useChargingTelemetry] Transient telemetry poll warning:', err.message);
        setPollError(err.message);
      }
    } finally {
      inFlightRef.current = false;
      setIsPolling(false);
    }
  }, [session?.id, session?.status]);

  // 3. Lifecycle-scoped 5s polling loop with visibility listener
  useEffect(() => {
    const sessionId = session?.id || session?.sessionId;
    const isTerminal =
      session?.status === 'completed' || session?.status === 'stopped' || session?.status === 'failed';

    if (!isActive || !sessionId || isTerminal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Initial immediate fetch on mount
    fetchTelemetryData();

    // Start 5s cadence
    intervalRef.current = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        fetchTelemetryData();
      }
    }, POLLING_INTERVAL_MS);

    // Document visibility listener to pause/resume polling
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTelemetryData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [session?.id, session?.status, isActive, fetchTelemetryData]);

  // 4. Extract latest genuine telemetry values
  const latestSample = telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;

  // Genuine power speed (kW)
  const powerKw =
    latestSample && typeof latestSample.power_kw === 'number'
      ? Number(latestSample.power_kw.toFixed(1))
      : null;

  // Genuine battery SoC (%)
  const rawSoc = latestSample?.soc_percent ?? session?.end_soc ?? session?.currentSoc ?? null;
  const currentSoc =
    typeof rawSoc === 'number' && !isNaN(rawSoc) && rawSoc >= 0 && rawSoc <= 100
      ? Math.round(rawSoc)
      : null;

  // Delivered energy (kWh)
  const energyKwh = Number(
    (latestSample?.energy_kwh ?? session?.energy_kwh ?? session?.energyKwh ?? 0).toFixed(3)
  );

  // Freshness determination
  let freshness = 'unavailable';
  if (latestSample?.recorded_at) {
    const ageMs = Date.now() - new Date(latestSample.recorded_at).getTime();
    if (ageMs <= FRESHNESS_LIVE_MS) {
      freshness = 'live';
    } else if (ageMs <= FRESHNESS_IDLE_MS) {
      freshness = 'idle';
    } else {
      freshness = 'stale';
    }
  }

  // 5. Estimated cost derived from session tariff snapshot
  const estimatedCost = chargingService.calculateEstimatedCost(session?.tariff_snapshot, {
    energyKwh,
    durationSeconds: elapsedSeconds,
  });

  // 6. Stop charging action with CDR reconciliation
  const stopCharging = useCallback(async () => {
    const sessionId = session?.id || session?.sessionId;
    if (!sessionId || isStopping) return;

    try {
      setIsStopping(true);
      setStopError(null);

      // Stop session in backend (treat 409 / SESSION_ALREADY_STOPPED as success)
      let stopped;
      try {
        stopped = await chargingService.stopChargingSession(sessionId);
      } catch (stopErr) {
        if (
          stopErr?.code === 'SESSION_ALREADY_STOPPED' ||
          stopErr?.status === 409 ||
          stopErr?.message?.toLowerCase().includes('already')
        ) {
          stopped = { ...(session || {}), status: 'stopped' };
        } else {
          throw stopErr;
        }
      }

      setSession(stopped);

      // Stop active telemetry polling and timers
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);

      // Fetch finalized CDR (with 1 quick retry for async finalization)
      let cdr = null;
      try {
        cdr = await chargingService.getSessionCdr(sessionId);
        if (!cdr) {
          await new Promise((r) => setTimeout(r, 800));
          cdr = await chargingService.getSessionCdr(sessionId);
        }
      } catch (cdrErr) {
        console.warn('[useChargingTelemetry] CDR fetch warning:', cdrErr);
      }

      if (cdr) {
        setFinalCdr(cdr);
      }

      if (onSessionStopped) {
        try {
          onSessionStopped(stopped, cdr);
        } catch (cbErr) {
          console.warn('[useChargingTelemetry] onSessionStopped callback warning:', cbErr);
        }
      }

      return { session: stopped, cdr };
    } catch (err) {
      console.error('[useChargingTelemetry] Stop failed:', err);
      setStopError(err.message || 'Failed to stop charging session.');
      throw err;
    } finally {
      setIsStopping(false);
    }
  }, [session?.id, session?.status, isStopping, onSessionStopped]);

  return {
    session,
    telemetry,
    latestSample,
    powerKw,
    currentSoc,
    energyKwh,
    elapsedSeconds,
    freshness,
    lastRefreshedAt,
    estimatedCost,
    finalCdr,
    isPolling,
    isStopping,
    stopError,
    pollError,
    stopCharging,
    refetch: fetchTelemetryData,
  };
}
