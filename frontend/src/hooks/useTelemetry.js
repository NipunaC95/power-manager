import { useEffect, useState } from 'react';

// Custom hook to fetch latest telemetry and history from the Cloudflare Worker API.
// It polls /api/latest every 5 seconds and /api/history every 30 seconds.
export function useTelemetry() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  // Helper to fetch JSON and handle errors gracefully.
  const fetchJson = async (url) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Failed to fetch ${url}:`, resp.status, resp.statusText);
        return null;
      }
      return await resp.json();
    } catch (e) {
      console.error(`Error fetching ${url}:`, e);
      return null;
    }
  };

  // Poll latest telemetry every 5 seconds.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const data = await fetchJson('/api/latest');
      if (!cancelled && data) setLatest(data);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Poll history every 30 seconds.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const data = await fetchJson('/api/history');
      if (!cancelled && data) setHistory(data);
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Also listen for manual refresh via custom event 'fetchNow'.
  useEffect(() => {
    const handler = () => {
      // Trigger immediate fetches.
      fetchJson('/api/latest').then((d) => d && setLatest(d));
      fetchJson('/api/history').then((d) => d && setHistory(d));
    };
    window.addEventListener('fetchNow', handler);
    return () => window.removeEventListener('fetchNow', handler);
  }, []);

  return { latest, history };
}

