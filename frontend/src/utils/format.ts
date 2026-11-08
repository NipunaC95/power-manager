import { TelemetryData } from '../types';

export function timeAgo(ts?: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z');
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function formatTime(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function parseCells(latest?: TelemetryData | null): number[] {
  if (!latest) return [];
  let cells = latest.cell_voltages;
  if (typeof cells === 'string') {
    try {
      cells = JSON.parse(cells);
    } catch {
      return [];
    }
  }
  return Array.isArray(cells) ? cells.map(Number) : [];
}
