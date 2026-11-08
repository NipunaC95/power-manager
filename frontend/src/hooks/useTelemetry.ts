import { useEffect, useState, useRef, useCallback } from 'react';
import { TelemetryData } from '../types';

/**
 * useTelemetry Hook
 *
 * Establishes a realtime WebSocket connection to the Dashboard Worker (/api/ws).
 * Automatically streams fresh telemetry readings as they arrive.
 * Includes automatic reconnect with backoff and graceful HTTP fallback.
 */
export interface UseTelemetryReturn {
  latest: TelemetryData | null;
  history: TelemetryData[];
  isWsConnected: boolean;
}

export function useTelemetry(): UseTelemetryReturn {
  const [latest, setLatest] = useState<TelemetryData | null>(null);
  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Helper to fetch via HTTP fallback
  const fetchJson = useCallback(async (url: string) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }, []);

  const refreshHttp = useCallback(async () => {
    const [dLatest, dHistory] = await Promise.all([
      fetchJson('/api/latest'),
      fetchJson('/api/history'),
    ]);
    if (isMountedRef.current) {
      if (dLatest) setLatest(dLatest);
      if (Array.isArray(dHistory)) setHistory(dHistory);
    }
  }, [fetchJson]);

  // Connect WebSocket
  const connectWs = useCallback(() => {
    if (!isMountedRef.current) return;

    try {
      const isHttps = window.location.protocol === 'https:';
      const wsProtocol = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setIsWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'init') {
            if (msg.latest) setLatest(msg.latest);
            if (Array.isArray(msg.history)) setHistory(msg.history);
          } else if (msg.type === 'telemetry') {
            if (msg.latest) {
              setLatest(msg.latest);
              setHistory((prev) => {
                const next = [...prev, msg.latest];
                return next.slice(-100);
              });
            }
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {}
      };

      ws.onerror = () => {
        if (wsRef.current === ws) {
          setIsWsConnected(false);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setIsWsConnected(false);
          wsRef.current = null;
          // Reconnect with 3-second delay
          if (isMountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
          }
        }
      };
    } catch {
      setIsWsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWs, 5000);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // 1. Initial HTTP fetch for instantaneous display
    refreshHttp();

    // 2. Establish WebSocket stream
    connectWs();

    // 3. Fallback polling only when WebSocket is NOT connected
    const fallbackInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        refreshHttp();
      }
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(fallbackInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWs, refreshHttp]);

  // Handle manual refresh ('fetchNow' event from Sync button)
  useEffect(() => {
    const handler = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'refresh' }));
      }
      refreshHttp();
    };

    window.addEventListener('fetchNow', handler);
    return () => window.removeEventListener('fetchNow', handler);
  }, [refreshHttp]);

  return { latest, history, isWsConnected };
}
