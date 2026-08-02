import type { FlightCandidate } from './dispatchlink';

export type AnyRecord = Record<string, any>;

export interface FlightSummary {
  release: string;
  source: 'simbrief' | 'candidate' | 'none';
  airline: string;
  flightNumber: string;
  callsign: string;
  origin: string;
  destination: string;
  alternate: string;
  originName: string;
  destinationName: string;
  aircraft: string;
  registration: string;
  route: string;
  cruiseAltitude: string;
  costIndex: string;
  schedOut: string;
  schedIn: string;
  blockTime: string;
  ete: string;
  distance: string;
  units: string;
  departureRunway: string;
  arrivalRunway: string;
  flightDate: string;
}

export interface RunwayAnalysisData {
  available: boolean;
  text: string;
  source: string;
  documents: { title: string; url: string }[];
}

export function dig<T = any>(obj: any, ...paths: string[]): T | undefined {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && value !== '') return value as T;
  }
  return undefined;
}

export function asArray<T = any>(value: any): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeZulu(value: unknown): string {
  const raw = String(value || '').trim().replace(/z/gi, '').replace(/\s+/g, '');
  const match = raw.match(/^(\d{1,2}):?(\d{2})$/);
  if (!match) return raw ? String(value) : '--:--';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return String(value);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}z`;
}

export function zuluFromEpoch(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return `${new Date(seconds * 1000).toISOString().slice(11, 16)}z`;
}

export function duration(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return '--:--';
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function numberText(value: unknown, suffix = '', digits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}${suffix}`;
}

function candidateSummary(candidate: FlightCandidate | null): FlightSummary | null {
  if (!candidate) return null;
  const match = candidate.flightNumber.match(/^([A-Z]{3})(\d+[A-Z]?)$/);
  return {
    release: `DRAFT-${candidate.id.replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'FLIGHT'}`,
    source: 'candidate',
    airline: match?.[1] || '',
    flightNumber: match?.[2] || candidate.flightNumber,
    callsign: candidate.flightNumber,
    origin: candidate.departure || '----',
    destination: candidate.arrival || '----',
    alternate: '----',
    originName: 'Selected real-world flight',
    destinationName: '',
    aircraft: candidate.aircraft || '—',
    registration: candidate.registration || '—',
    route: 'Generate and import the SimBrief OFP to load the route.',
    cruiseAltitude: '—',
    costIndex: '—',
    schedOut: normalizeZulu(candidate.std),
    schedIn: normalizeZulu(candidate.sta),
    blockTime: candidate.ete && candidate.ete !== '—' ? candidate.ete.padStart(5, '0') : '--:--',
    ete: candidate.ete && candidate.ete !== '—' ? candidate.ete.padStart(5, '0') : '--:--',
    distance: '—',
    units: 'LBS',
    departureRunway: '—',
    arrivalRunway: '—',
    flightDate: candidate.date || ''
  };
}

export function summary(ofp: AnyRecord | null, fallback: FlightCandidate | null = null): FlightSummary {
  if (!ofp) {
    return candidateSummary(fallback) || {
      release: '—', source: 'none', airline: '', flightNumber: '', callsign: '', origin: '----', destination: '----', alternate: '----',
      originName: 'No flight loaded', destinationName: '', aircraft: '—', registration: '—', route: 'Select a real-world flight or import your latest SimBrief OFP.',
      cruiseAltitude: '—', costIndex: '—', schedOut: '--:--', schedIn: '--:--', blockTime: '--:--', ete: '--:--', distance: '—', units: 'LBS',
      departureRunway: '—', arrivalRunway: '—', flightDate: ''
    };
  }
  const units = String(dig(ofp, 'params.units', 'general.units') || 'LBS').toUpperCase();
  const fallbackData = candidateSummary(fallback);
  return {
    release: String(dig(ofp, 'general.release', 'fetch.time') || fallbackData?.release || '—'),
    source: 'simbrief',
    airline: String(dig(ofp, 'general.icao_airline', 'params.airline') || fallbackData?.airline || ''),
    flightNumber: String(dig(ofp, 'general.flight_number', 'params.fltnum') || fallbackData?.flightNumber || ''),
    callsign: String(dig(ofp, 'atc.callsign', 'general.callsign') || fallbackData?.callsign || ''),
    origin: String(dig(ofp, 'origin.icao_code', 'params.orig') || fallbackData?.origin || '----'),
    destination: String(dig(ofp, 'destination.icao_code', 'params.dest') || fallbackData?.destination || '----'),
    alternate: String(dig(ofp, 'alternate.icao_code', 'params.altn') || '----'),
    originName: String(dig(ofp, 'origin.name') || fallbackData?.originName || ''),
    destinationName: String(dig(ofp, 'destination.name') || fallbackData?.destinationName || ''),
    aircraft: String(dig(ofp, 'aircraft.icao_code', 'aircraft.type', 'params.type') || fallbackData?.aircraft || '—'),
    registration: String(dig(ofp, 'aircraft.reg', 'params.reg') || fallbackData?.registration || '—'),
    route: String(dig(ofp, 'general.route', 'atc.route', 'params.route') || fallbackData?.route || '—'),
    cruiseAltitude: String(dig(ofp, 'general.initial_altitude', 'params.fl') || '—'),
    costIndex: String(dig(ofp, 'general.costindex', 'params.civalue') || '—'),
    schedOut: zuluFromEpoch(dig(ofp, 'times.sched_out', 'times.est_out')) !== '--:--' ? zuluFromEpoch(dig(ofp, 'times.sched_out', 'times.est_out')) : (fallbackData?.schedOut || '--:--'),
    schedIn: zuluFromEpoch(dig(ofp, 'times.sched_in', 'times.est_in')) !== '--:--' ? zuluFromEpoch(dig(ofp, 'times.sched_in', 'times.est_in')) : (fallbackData?.schedIn || '--:--'),
    blockTime: duration(dig(ofp, 'times.block_time')) !== '--:--' ? duration(dig(ofp, 'times.block_time')) : (fallbackData?.blockTime || '--:--'),
    ete: duration(dig(ofp, 'times.est_time_enroute')) !== '--:--' ? duration(dig(ofp, 'times.est_time_enroute')) : (fallbackData?.ete || '--:--'),
    distance: numberText(dig(ofp, 'general.route_distance', 'general.gc_distance'), ' NM'),
    units,
    departureRunway: String(dig(ofp, 'origin.plan_rwy', 'params.origrwy') || '—'),
    arrivalRunway: String(dig(ofp, 'destination.plan_rwy', 'params.destrwy') || '—'),
    flightDate: String(dig(ofp, 'params.date', 'general.date') || fallbackData?.flightDate || '')
  };
}

export function getNavlog(ofp: AnyRecord | null): AnyRecord[] {
  return asArray(dig(ofp, 'navlog.fix'));
}

export function getNotams(ofp: AnyRecord | null, key: 'origin' | 'destination' | 'alternate'): AnyRecord[] {
  return asArray(dig(ofp, `notams.${key}`, `${key}.notams`, `notams.${key}.notam`));
}

export function getWeather(ofp: AnyRecord | null, key: 'origin' | 'destination' | 'alternate') {
  return {
    metar: String(dig(ofp, `${key}.metar`, `weather.${key}_metar`) || 'No METAR included in this OFP.'),
    taf: String(dig(ofp, `${key}.taf`, `weather.${key}_taf`) || 'No TAF included in this OFP.')
  };
}

export function getOFPDocument(ofp: AnyRecord | null): string | null {
  const candidate = dig<string>(ofp, 'files.pdf.link', 'files.pdf', 'links.pdf', 'general.ofp_pdf');
  if (!candidate || typeof candidate !== 'string') return null;
  if (candidate.startsWith('http')) return candidate;
  if (candidate.startsWith('/')) return `https://www.simbrief.com${candidate}`;
  return `https://www.simbrief.com/${candidate}`;
}

function normalizeDocumentUrl(link: unknown): string | null {
  if (typeof link !== 'string' || !link.trim()) return null;
  if (link.startsWith('http')) return link;
  return `https://www.simbrief.com/${link.replace(/^\//, '')}`;
}

export function getFlightMaps(ofp: AnyRecord | null): { title: string; url: string }[] {
  const files = dig<any>(ofp, 'files');
  if (!files || typeof files !== 'object') return [];
  const results: { title: string; url: string }[] = [];
  for (const [key, raw] of Object.entries(files)) {
    if (!/map|route|weather/i.test(key)) continue;
    const values = asArray(raw);
    values.forEach((item, index) => {
      const url = normalizeDocumentUrl(typeof item === 'string' ? item : item?.link || item?.url);
      if (!url) return;
      results.push({ title: `${key.replace(/_/g, ' ')}${values.length > 1 ? ` ${index + 1}` : ''}`, url });
    });
  }
  return results;
}

function stringifyAnalysis(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return '';
}

function findAnalysisCandidate(value: unknown, depth = 0): { text: string; source: string } | null {
  if (!value || depth > 5 || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(tlr|runway_analysis|runwayanalysis|takeoff_landing_report|takeoff_landing_analysis)$/i.test(key)) {
      const text = stringifyAnalysis(child);
      if (text) return { text, source: key };
    }
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/text|brief|analysis|performance|report/i.test(key) || depth < 2) {
      const found = findAnalysisCandidate(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function getRunwayAnalysis(ofp: AnyRecord | null): RunwayAnalysisData {
  if (!ofp) return { available: false, text: '', source: '', documents: [] };
  const documents: { title: string; url: string }[] = [];
  const files = dig<any>(ofp, 'files');
  if (files && typeof files === 'object') {
    for (const [key, raw] of Object.entries(files)) {
      if (!/tlr|runway|takeoff|landing/i.test(key)) continue;
      asArray(raw).forEach((item, index) => {
        const url = normalizeDocumentUrl(typeof item === 'string' ? item : item?.link || item?.url);
        if (url) documents.push({ title: `${key.replace(/_/g, ' ')}${index ? ` ${index + 1}` : ''}`, url });
      });
    }
  }
  const direct = findAnalysisCandidate(ofp);
  if (direct) return { available: true, text: direct.text, source: direct.source, documents };

  const largeText = String(dig(ofp, 'text.plan_html', 'text.plan_text', 'text.ofp', 'general.ofp_text') || '');
  const marker = largeText.search(/RUNWAY\s+ANALYSIS|TAKEOFF\s+AND\s+LANDING|\bTLR\b/i);
  if (marker >= 0) {
    const excerpt = largeText.slice(marker, marker + 16000).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim();
    return { available: true, text: excerpt, source: 'OFP text section', documents };
  }
  return { available: documents.length > 0, text: '', source: documents.length ? 'SimBrief document' : '', documents };
}

export function weight(ofp: AnyRecord | null, ...paths: string[]): number {
  return Number(dig(ofp, ...paths) || 0);
}
