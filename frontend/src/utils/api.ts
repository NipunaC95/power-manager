/**
 * API and WebSocket URL resolution helpers.
 * Handles Railway deployments, custom domains, local development, and file:// fallbacks.
 */

export function getApiUrl(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (typeof window === 'undefined') {
    return path;
  }

  // If opened locally via file:// or empty host, point to default standalone server
  if (window.location.protocol === 'file:' || !window.location.host) {
    return `http://localhost:3000${path}`;
  }

  // Check if user set a custom backend override in localStorage
  try {
    const customBackend = localStorage.getItem('jkbms_backend_url');
    if (customBackend) {
      const base = customBackend.replace(/\/+$/, '');
      return `${base}${path}`;
    }
  } catch {}

  // Standard relative path (Railway / Same-host deployment)
  return path;
}

export function getWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/api/ws';
  }

  // If opened locally via file:// or empty host
  if (window.location.protocol === 'file:' || !window.location.host) {
    return 'ws://localhost:3000/api/ws';
  }

  // Check custom backend override
  try {
    const customBackend = localStorage.getItem('jkbms_backend_url');
    if (customBackend) {
      const url = new URL(customBackend);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${url.host}/api/ws`;
    }
  } catch {}

  // Standard relative WebSocket (works with Railway, SSL reverse proxies, etc.)
  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/api/ws`;
}

