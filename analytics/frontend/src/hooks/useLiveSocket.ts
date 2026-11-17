import { useState, useEffect, useRef, useCallback } from 'react';
import { DataPoint } from '../components/LiveStreamChart';

export interface LiveTelemetry {
  id: number;
  timestamp: string;
  total_voltage: number;
  current: number;
  power: number;
  soc: number;
  capacity_remaining: number;
  cell_min_voltage: number | null;
  cell_max_voltage: number | null;
  cell_diff: number | null;
  temp_mos: number;
  temp_battery_1: number;
  temp_battery_2: number;
  charging_enabled: number;
  discharging_enabled: number;
  cell_voltages: number[];
}

export function useLiveSocket() {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [streamPoints, setStreamPoints] = useState<DataPoint[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'ws_live' | 'polling' | 'disconnected'>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to add stream points
  const appendStreamPoint = useCallback((t: LiveTelemetry) => {
    setStreamPoints((prev) => {
      const next = [
        ...prev,
        {
          timestamp: t.timestamp,
          voltage: t.total_voltage,
          current: t.current,
          power: t.power,
        },
      ];
      return next.slice(-60);
    });
  }, []);

  // Poll fallback
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setConnectionStatus('polling');

    const poll = async () => {
      try {
        const t0 = performance.now();
        const res = await fetch('http://136.80.228.184.sslip.io/api/latest');
        if (res.ok) {
          const data: LiveTelemetry = await res.json();
          if (data && data.total_voltage) {
            setTelemetry(data);
            appendStreamPoint(data);
            setLatencyMs(Math.round(performance.now() - t0));
            setConnectionStatus('polling');
          }
        }
      } catch {
        // Fallback to Cloudflare Tunnel
        try {
          const res = await fetch('https://calgary-checking-restore-specifications.trycloudflare.com/api/latest');
          if (res.ok) {
            const data: LiveTelemetry = await res.json();
            if (data && data.total_voltage) {
              setTelemetry(data);
              appendStreamPoint(data);
            }
          }
        } catch {}
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 2000);
  }, [appendStreamPoint]);

  // Connect WebSocket
  useEffect(() => {
    let isMounted = true;

    const connectWebSocket = () => {
      // Determine best WebSocket URL:
      // Try Cloudflare WSS tunnel if on HTTPS, otherwise direct WS
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const wsUrl = isHttps
        ? 'wss://calgary-checking-restore-specifications.trycloudflare.com/api/ws'
        : 'ws://136.80.228.184:3000/api/ws';

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const connectTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            startPolling();
          }
        }, 4000);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          if (!isMounted) return;
          setConnectionStatus('ws_live');
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.latest) {
              setTelemetry(msg.latest);
              appendStreamPoint(msg.latest);
            }
            if (msg.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } catch {}
        };

        ws.onerror = () => {
          if (!isMounted) return;
          startPolling();
        };

        ws.onclose = () => {
          if (!isMounted) return;
          startPolling();
          // Retry WS after 10 seconds
          setTimeout(connectWebSocket, 10000);
        };
      } catch {
        startPolling();
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (wsRef.current) wsRef.current.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [appendStreamPoint, startPolling]);

  return {
    telemetry,
    streamPoints,
    connectionStatus,
    latencyMs,
  };
}
