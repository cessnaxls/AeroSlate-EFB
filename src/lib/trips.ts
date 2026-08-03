import type { FlightCandidate } from './dispatchlink';
import { generateDispatchPayload } from './dispatchlink';
import { loadLocal, saveLocal } from './storage';
import type { LedgerEntry, RecordData } from './cloudLedger';

export const TRIPS_KEY = 'aeroslate.trips.v1';
export const TRIPS_UPDATED_EVENT = 'aeroslate-trips-updated';

export function normalizeTripDate(value: unknown, fallback = new Date()): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  const date = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatTripDate(value: unknown): string {
  const iso = normalizeTripDate(value);
  const [year, month, day] = iso.split('-').map(Number);
  const monthText = new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short' });
  return `${monthText}. ${day}, ${year}`;
}

export interface PlannedTrip {
  id: string;
  candidateId: string;
  rigId: string;
  date: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  aircraft: string;
  registration: string;
  std: string;
  sta: string;
  ete: string;
  rawStd: string;
  rawSta: string;
  status: 'Unscheduled' | 'Scheduled' | 'Dispatched' | 'Completed' | 'Canceled';
  pax: number;
  bags: number;
  bagWeight: number;
  freight: number;
  createdAt: string;
}

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() || `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadTrips(): PlannedTrip[] {
  const value = loadLocal<unknown>(TRIPS_KEY, []);
  return Array.isArray(value) ? (value.filter(Boolean) as PlannedTrip[]).map(item => ({ ...item, date: normalizeTripDate(item.date) })) : [];
}

export function saveTrips(trips: PlannedTrip[]): void {
  const sorted = trips.slice().sort((a, b) => `${a.date} ${a.std}`.localeCompare(`${b.date} ${b.std}`));
  saveLocal(TRIPS_KEY, sorted);
  window.dispatchEvent(new CustomEvent(TRIPS_UPDATED_EVENT));
}

export function tripCandidateKey(flight: Pick<FlightCandidate, 'flightNumber'|'departure'|'arrival'|'std'|'date'|'registration'>): string {
  return [flight.flightNumber, flight.departure, flight.arrival, flight.std, normalizeTripDate(flight.date), flight.registration].join('|').toUpperCase();
}

export function plannedTripFromFlight(flight: FlightCandidate, date: string, rigId = '', existingLoad?: Partial<PlannedTrip>, unscheduled = false): PlannedTrip {
  const payload = existingLoad?.pax != null ? existingLoad : generateDispatchPayload(flight);
  return {
    id: uuid(),
    candidateId: flight.id,
    rigId,
    date: normalizeTripDate(date || flight.date),
    flightNumber: flight.flightNumber,
    departure: flight.departure,
    arrival: flight.arrival,
    aircraft: flight.aircraft,
    registration: flight.registration,
    std: flight.std,
    sta: flight.sta,
    ete: flight.ete,
    rawStd: flight.rawStd || '',
    rawSta: flight.rawSta || '',
    status: unscheduled ? 'Unscheduled' : 'Scheduled',
    pax: Number(payload.pax || 0),
    bags: Number(payload.bags || 0),
    bagWeight: Number(payload.bagWeight || 0),
    freight: Number(payload.freight || 0),
    createdAt: new Date().toISOString()
  };
}

export function addTripsLocal(flights: FlightCandidate[], date: string, rigId = '', unscheduled = false): { trips: PlannedTrip[]; added: PlannedTrip[] } {
  const current = loadTrips();
  const added: PlannedTrip[] = [];
  for (const flight of flights) {
    const scheduledDate = normalizeTripDate(date || flight.date);
    const key = tripCandidateKey(flight);
    const exists = current.some(item => tripCandidateKey(flightFromTrip(item)) === key && (unscheduled || item.date === scheduledDate));
    if (exists) continue;
    const trip = plannedTripFromFlight(flight, scheduledDate, rigId, undefined, unscheduled);
    current.push(trip);
    added.push(trip);
  }
  if (added.length) saveTrips(current);
  return { trips: current, added };
}

export function removeTripLocal(id: string): PlannedTrip[] {
  const next = loadTrips().filter(item => item.id !== id);
  saveTrips(next);
  return next;
}

export function tripToRecordData(trip: PlannedTrip): RecordData {
  return { ...trip };
}

export function flightFromTrip(trip: PlannedTrip): FlightCandidate {
  return {
    id: trip.candidateId,
    date: trip.date,
    aircraft: trip.aircraft,
    registration: trip.registration,
    flightNumber: trip.flightNumber,
    departure: trip.departure,
    arrival: trip.arrival,
    std: trip.std,
    sta: trip.sta,
    ete: trip.ete,
    rawStd: trip.rawStd,
    rawSta: trip.rawSta
  };
}

export function mergeLedgerTrips(entries: LedgerEntry[]): PlannedTrip[] {
  const current = loadTrips();
  const map = new Map(current.map(item => [`${item.candidateId}|${item.date}`, item]));
  for (const entry of entries) {
    const d = entry.data;
    const key = `${String(d.candidateId)}|${String(d.date).slice(0, 10)}`;
    if (map.has(key)) continue;
    const trip: PlannedTrip = {
      id: entry.id,
      candidateId: String(d.candidateId || entry.id),
      rigId: String(d.rigId || ''),
      date: normalizeTripDate(d.date),
      flightNumber: String(d.flightNumber || ''),
      departure: String(d.departure || ''),
      arrival: String(d.arrival || ''),
      aircraft: String(d.aircraft || ''),
      registration: String(d.registration || ''),
      std: String(d.std || ''),
      sta: String(d.sta || ''),
      ete: String(d.ete || ''),
      rawStd: String(d.rawStd || ''),
      rawSta: String(d.rawSta || ''),
      status: (String(d.status || 'Scheduled') as PlannedTrip['status']),
      pax: Number(d.pax || 0),
      bags: Number(d.bags || 0),
      bagWeight: Number(d.bagWeight || 0),
      freight: Number(d.freight || 0),
      createdAt: entry.createdAt
    };
    map.set(key, trip);
  }
  const merged = [...map.values()];
  saveTrips(merged);
  return merged;
}
