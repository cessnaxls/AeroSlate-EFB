import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadLocal, saveLocal } from './storage';

export interface OOOITimes {
  out: string;
  off: string;
  on: string;
  in: string;
}

export const EMPTY_OOOI: OOOITimes = { out: '', off: '', on: '', in: '' };
const EVENT_NAME = 'dispatchlink:oooi-change';

export function normalizeZulu(value: string): string {
  const cleaned = String(value || '').trim().replace(/z/gi, '').replace(/\s+/g, '');
  const match = cleaned.match(/^(\d{1,2}):?(\d{2})$/);
  if (!match) return String(value || '').trim();
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return String(value || '').trim();
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}z`;
}

export function zuluNow(): string {
  return `${new Date().toISOString().slice(11, 16)}z`;
}

export function isValidZulu(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\dz$/.test(normalizeZulu(value));
}

export function addMinutesZulu(value: string, deltaMinutes: number): string {
  const base = zuluMinutes(value);
  if (base === null) return '';
  const total = (base + Math.round(deltaMinutes) + 1440 * 4) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}z`;
}

export function zuluMinutes(value: string): number | null {
  const match = normalizeZulu(value).match(/^(\d{2}):(\d{2})z$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function minutesBetweenZulu(start: string, end: string): number | null {
  const a = zuluMinutes(start);
  const b = zuluMinutes(end);
  if (a === null || b === null) return null;
  return (b - a + 1440) % 1440;
}

export function formatMinutes(value: number | null): string {
  if (value === null) return '--:--';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function decimalHours(value: number | null): number {
  if (value === null) return 0;
  return Math.round(value / 6) / 10;
}

export function oooiStorageKey(release: string, origin: string, destination: string): string {
  const safeRelease = String(release || 'draft').replace(/[^A-Za-z0-9_-]/g, '_');
  return `dispatchlink.times.${safeRelease}.${origin || '----'}${destination || '----'}`;
}

export function saveOOOITimes(key: string, value: OOOITimes): void {
  saveLocal(key, value);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key, value } }));
}

export function useOOOITimes(key: string) {
  const [times, setTimesState] = useState<OOOITimes>(() => loadLocal(key, EMPTY_OOOI));

  useEffect(() => {
    setTimesState(loadLocal(key, EMPTY_OOOI));
  }, [key]);

  useEffect(() => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: OOOITimes }>).detail;
      if (detail?.key === key) setTimesState(detail.value);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key && event.newValue) {
        try { setTimesState(JSON.parse(event.newValue)); } catch { /* ignore malformed external writes */ }
      }
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const setTimes = useCallback((value: OOOITimes | ((current: OOOITimes) => OOOITimes)) => {
    setTimesState(current => {
      const next = typeof value === 'function' ? value(current) : value;
      saveOOOITimes(key, next);
      return next;
    });
  }, [key]);

  const computed = useMemo(() => ({
    blockMinutes: minutesBetweenZulu(times.out, times.in),
    flightMinutes: minutesBetweenZulu(times.off, times.on)
  }), [times]);

  return { times, setTimes, ...computed };
}
