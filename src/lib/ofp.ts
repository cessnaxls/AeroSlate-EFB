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

export interface TlrConditions {
  airportIcao: string;
  plannedRunway: string;
  plannedWeight: number;
  windDirection: number | null;
  windSpeed: number | null;
  temperature: number | null;
  altimeter: string;
  surfaceCondition: string;
  flapSetting?: string;
}

export interface TlrRunway {
  identifier: string;
  length: number | null;
  tora: number | null;
  toda: number | null;
  asda: number | null;
  lda: number | null;
  elevation: number | null;
  gradient: number | null;
  trueCourse: number | null;
  magneticCourse: number | null;
  headwindComponent: number | null;
  crosswindComponent: number | null;
  ilsFrequency: string;
  flapSetting: string;
  thrustSetting: string;
  bleedSetting: string;
  antiIceSetting: string;
  flexTemperature: number | null;
  maxTemperature: number | null;
  maxWeight: number | null;
  maxWeightDry: number | null;
  maxWeightWet: number | null;
  limitCode: string;
  limitObstacle: string;
  v1: number | null;
  vr: number | null;
  v2: number | null;
  otherSpeed: number | null;
  otherSpeedId: string;
  thrustValue: string;
  thrustValueId: string;
  distanceDecide: number | null;
  distanceReject: number | null;
  distanceMargin: number | null;
  distanceContinue: number | null;
}

export interface TlrLandingDistance {
  weight: number | null;
  flapSetting: string;
  brakeSetting: string;
  reverserCredit: string;
  vref: number | null;
  actualDistance: number | null;
  factoredDistance: number | null;
}

export interface StructuredTlr {
  available: boolean;
  takeoff: { conditions: TlrConditions; runways: TlrRunway[] } | null;
  landing: { conditions: TlrConditions; dry: TlrLandingDistance | null; wet: TlrLandingDistance | null; runways: TlrRunway[] } | null;
}

export interface ParsedNotam {
  id: string;
  station: string;
  text: string;
  important: boolean;
  priority: 'critical' | 'amendment' | 'advisory';
  category: 'airport' | 'runway' | 'taxiway' | 'lighting' | 'procedure' | 'navaid' | 'communication' | 'service' | 'airspace' | 'obstacle' | 'other';
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

export function durationBetweenZulu(start: string, end: string): string {
  const parse = (value: string) => {
    const match = normalizeZulu(value).match(/^(\d{2}):(\d{2})z$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const a = parse(start); const b = parse(end);
  if (a === null || b === null) return '--:--';
  const minutes = (b - a + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function numberText(value: unknown, suffix = '', digits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}${suffix}`;
}

function candidateSummary(candidate: FlightCandidate | null): FlightSummary | null {
  if (!candidate) return null;
  const match = candidate.flightNumber.match(/^([A-Z]{3})(\d+[A-Z]?)$/);
  const schedOut = normalizeZulu(candidate.std);
  const schedIn = normalizeZulu(candidate.sta);
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
    schedOut,
    schedIn,
    blockTime: schedOut !== '--:--' && schedIn !== '--:--' ? durationBetweenZulu(schedOut, schedIn) : (candidate.ete && candidate.ete !== '—' ? candidate.ete.padStart(5, '0') : '--:--'),
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
  const schedOut = zuluFromEpoch(dig(ofp, 'times.sched_out', 'times.est_out')) !== '--:--'
    ? zuluFromEpoch(dig(ofp, 'times.sched_out', 'times.est_out'))
    : (fallbackData?.schedOut || normalizeZulu(dig(ofp, 'times.sched_out_time', 'params.dephour')) || '--:--');
  const schedIn = zuluFromEpoch(dig(ofp, 'times.sched_in', 'times.est_in')) !== '--:--'
    ? zuluFromEpoch(dig(ofp, 'times.sched_in', 'times.est_in'))
    : (fallbackData?.schedIn || normalizeZulu(dig(ofp, 'times.sched_in_time')) || '--:--');
  const calculatedBlock = schedOut !== '--:--' && schedIn !== '--:--' ? durationBetweenZulu(schedOut, schedIn) : '--:--';
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
    schedOut,
    schedIn,
    blockTime: calculatedBlock !== '--:--' ? calculatedBlock : (duration(dig(ofp, 'times.block_time')) !== '--:--' ? duration(dig(ofp, 'times.block_time')) : (fallbackData?.blockTime || '--:--')),
    ete: duration(dig(ofp, 'times.est_time_enroute')) !== '--:--' ? duration(dig(ofp, 'times.est_time_enroute')) : (fallbackData?.ete || '--:--'),
    distance: numberText(dig(ofp, 'general.route_distance', 'general.gc_distance'), ' NM'),
    units,
    departureRunway: String(dig(ofp, 'origin.plan_rwy', 'params.origrwy') || '—'),
    arrivalRunway: String(dig(ofp, 'destination.plan_rwy', 'params.destrwy') || '—'),
    flightDate: String(dig(ofp, 'params.date', 'general.date') || fallbackData?.flightDate || '')
  };
}

export function getNavlog(ofp: AnyRecord | null): AnyRecord[] {
  return asArray(dig(ofp, 'navlog.fix', 'navlog.fixes', 'navlog'));
}

function htmlDecode(value: string): string {
  if (typeof document !== 'undefined') {
    const area = document.createElement('textarea');
    area.innerHTML = value;
    return area.value;
  }
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#40;/g, '(').replace(/&#41;/g, ')');
}

function cleanText(value: string): string {
  return htmlDecode(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function stringLeaves(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(item => stringLeaves(item, depth + 1));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(item => stringLeaves(item, depth + 1));
  return [];
}

export function getICAOFlightPlan(ofp: AnyRecord | null): string {
  if (!ofp) return '';
  const candidates: unknown[] = [
    dig(ofp, 'text.atc'), dig(ofp, 'text.atc_text'), dig(ofp, 'text.icao_fpl'), dig(ofp, 'text.icao'),
    dig(ofp, 'atc.flight_plan'), dig(ofp, 'atc.fpl'), dig(ofp, 'general.atc_flight_plan'),
    dig(ofp, 'general.icao_fpl'), dig(ofp, 'files.atc'), dig(ofp, 'api_params.icao_fpl')
  ];
  const all = [...candidates.flatMap(value => stringLeaves(value)), ...stringLeaves(dig(ofp, 'text'))]
    .map(cleanText).filter(Boolean);
  const normalize = (value: string) => value
    .replace(/^.*?(?=\(?FPL-)/is, '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\u2013|\u2014/g, '-')
    .trim();
  for (const raw of all) {
    const value = normalize(raw);
    const start = value.search(/\(?FPL-/i);
    if (start < 0) continue;
    const fragment = value.slice(start);
    let depth = 0; let began = false;
    for (let index = 0; index < fragment.length; index += 1) {
      if (fragment[index] === '(') { depth += 1; began = true; }
      if (fragment[index] === ')' && began) { depth -= 1; if (depth === 0) return fragment.slice(0, index + 1).replace(/^FPL-/, '(FPL-'); }
    }
    const lines = fragment.split('\n');
    const relevant: string[] = [];
    for (const line of lines) {
      if (relevant.length && /^\s*(?:METAR|TAF|NOTAM|DISPATCH|NAVLOG|FUEL)\b/i.test(line)) break;
      relevant.push(line);
    }
    const joined = relevant.join('\n').trim();
    if (joined) return `${joined.startsWith('(') ? joined : `(${joined}`}${joined.endsWith(')') ? '' : ')'}`;
  }
  // Reconstruct from structured ICAO fields only when SimBrief did not provide the formatted message.
  const callsign = String(dig(ofp, 'general.icao_airline') || '') + String(dig(ofp, 'general.flight_number') || '');
  const aircraft = String(dig(ofp, 'aircraft.icaocode') || dig(ofp, 'aircraft.icao_code') || '');
  const origin = String(dig(ofp, 'origin.icao_code') || ''); const dest = String(dig(ofp, 'destination.icao_code') || '');
  const route = String(dig(ofp, 'general.route') || dig(ofp, 'general.route_ifps') || '');
  const level = String(dig(ofp, 'general.initial_altitude') || '').replace(/\D/g, '');
  if (callsign && aircraft && origin && dest && route) return `(FPL-${callsign}-IS\n-${aircraft}/M-SDE2E3FGHIJ1J4J5RWXYZ/LB1\n-${origin}${String(dig(ofp,'times.sched_out')||'').slice(-4)}\n-N${String(dig(ofp,'general.cruise_tas')||'').padStart(4,'0')}F${level.slice(0,3).padStart(3,'0')} ${route}\n-${dest}${String(dig(ofp,'times.est_time_enroute')||'').replace(/\D/g,'').slice(0,4)}\n-PBN/A1B1C1D1L1O1S2 DOF/${String(dig(ofp,'general.date')||'').replace(/\D/g,'').slice(-6)})`;
  return '';
}

function notamText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return cleanText(String(value));
  if (!value || typeof value !== 'object') return '';
  const object = value as Record<string, unknown>;
  for (const key of ['notam', 'text', 'raw', 'message', 'content', 'description', 'notam_text', 'full_text', 'body']) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') {
      const candidate = stringLeaves(object[key]).join(' ');
      if (candidate) return cleanText(candidate);
    }
  }
  return cleanText(stringLeaves(value).join(' '));
}

function looksLikeCompleteNotam(text: string): boolean {
  const value = text.trim();
  if (value.length < 8) return false;
  if (/^(?:true|false|null|undefined|general|origin|destination|alternate)$/i.test(value)) return false;
  return /\b(?:NOTAM|RWY|TWY|AD |AERODROME|AIRPORT|APCH|APPROACH|SID|STAR|ILS|LOC|RNAV|RNP|VOR|DME|NDB|NAVAID|AIRSPACE|TFR|TOWER|OBST|CRANE|CLSD|CLOSED|OOS|INOP|UNSERVICEABLE|Q\)|A\)|B\)|C\)|E\))\b/i.test(value)
    || /\b[A-Z]\d{4}\/\d{2}\b/.test(value)
    || /\b(?:FROM|TO|VALID|EFFECTIVE)\b.*\b(?:UTC|Z)\b/i.test(value);
}

function normalizeNotamStation(text: string, fallback: string): string {
  const candidates = [
    text.match(/(?:^|\s)A\)\s*([A-Z]{4})(?:\s|$)/i)?.[1],
    text.match(/\b([A-Z]{4})\s+(?:AD|AERODROME|AIRPORT|RWY|TWY)\b/i)?.[1],
    text.match(/^([A-Z]{4})\b/)?.[1]
  ].filter(Boolean) as string[];
  return (candidates[0] || fallback || 'GENERAL').toUpperCase();
}

function classifyNotam(text: string): Pick<ParsedNotam, 'important' | 'priority' | 'category'> {
  const runway = /\bRWY\b|RUNWAY|DECLARED DISTANCE|TORA|TODA|ASDA|LDA|RVR/i.test(text);
  const taxiway = /\bTWY\b|TAXIWAY|APRON/i.test(text);
  const lighting = /PAPI|VASI|REIL|MALSR|ALSF|HIRL|MIRL|LIGHT(?:ING)?|BEACON/i.test(text);
  const procedure = /\bAPCH\b|APPROACH|\bSID\b|\bSTAR\b|IAP|ILS|LOC|RNAV|RNP|MINIMA|MISSED APPROACH|PROCEDURE|FDC/i.test(text);
  const navaid = /\bVOR\b|\bDME\b|\bNDB\b|GLIDESLOPE|GLIDE SLOPE|LOCALIZER|\bILS\b|NAVAID|MARKER BEACON/i.test(text);
  const communication = /\bTWR\b|TOWER|ATIS|AWOS|ASOS|FREQ|FREQUENCY|RCO|COMM/i.test(text);
  const service = /FUEL|ARFF|CUSTOMS|SERVICE|HOURS OF OPERATION|SNOW REMOVAL/i.test(text);
  const airport = /AERODROME|AIRPORT|\bAD\b|HELIPORT/i.test(text);
  const airspace = /AIRSPACE|TFR|RESTRICTED|PROHIBITED|DANGER AREA|MOA/i.test(text);
  const obstacle = /\bTOWER\b|CRANE|OBST(?:ACLE)?|UNLIGHTED|LGTD/i.test(text) && !communication;
  const closed = /\bCLSD\b|\bCLOSED\b/i.test(text);
  const unserviceable = /UNSERVICEABLE|\bU\/S\b/i.test(text);
  const outOfService = /OUT OF SERVICE|\bOOS\b|\bOTS\b|INOPERATIVE|\bINOP\b/i.test(text);
  const notAvailable = /NOT AVBL|NOT AVAILABLE|SUSPENDED/i.test(text);
  const notApplicable = /(?:PROC(?:EDURE)?|APCH|APPROACH|SID|STAR|ILS|LOC|RNAV|RNP)[^.;]{0,120}\bNA\b|NOT AUTHORIZED|NOT APPLICABLE/i.test(text);
  const operationalChange = procedure && /AMDT|AMEND|AMENDED|REV(?:ISED)?|CHANGE|CHANGED|CORRECT|MINIMA|NOTE|INCREASE|RAISE|VISIBILITY|CEILING|DA\b|MDA\b|RVR\b/i.test(text);

  const airportClosed = /(?:AD|AERODROME|AIRPORT)[^.;]{0,90}(?:CLSD|CLOSED)/i.test(text);
  const runwayClosed = /(?:RWY|RUNWAY)[^.;]{0,110}(?:CLSD|CLOSED)/i.test(text);
  const taxiwayClosed = /(?:TWY|TAXIWAY)[^.;]{0,110}(?:CLSD|CLOSED)/i.test(text);
  const operationalEquipment = runway || lighting || navaid;
  const equipmentUnavailable = operationalEquipment && (unserviceable || outOfService || notAvailable);
  const explicitProcedureUnavailable = /(?:APCH|APPROACH|SID|STAR|IAP|ILS|LOC|RNAV|RNP|PROCEDURE)[^.;\n]{0,140}(?:UNSERVICEABLE|U\/S|OUT OF SERVICE|OOS|INOP|NOT AVBL|NOT AVAILABLE|SUSPENDED)|(?:UNSERVICEABLE|U\/S|OUT OF SERVICE|OOS|INOP|NOT AVBL|NOT AVAILABLE|SUSPENDED)[^.;\n]{0,140}(?:APCH|APPROACH|SID|STAR|IAP|ILS|LOC|RNAV|RNP|PROCEDURE)/i.test(text);
  const procedureUnavailable = procedure && !operationalChange && explicitProcedureUnavailable;

  const category: ParsedNotam['category'] = procedure ? 'procedure' : lighting ? 'lighting' : runway ? 'runway' : taxiway ? 'taxiway' : navaid ? 'navaid' : obstacle ? 'obstacle' : communication ? 'communication' : service ? 'service' : airport ? 'airport' : airspace ? 'airspace' : 'other';
  const critical = airportClosed || runwayClosed || taxiwayClosed || equipmentUnavailable || procedureUnavailable;
  // Procedure NA means not authorized; raised minima and procedural changes are restrictions—not outages.
  const amendment = procedure && (notApplicable || operationalChange) && !procedureUnavailable;
  const obstacleOnly = category === 'obstacle';
  const priority: ParsedNotam['priority'] = critical ? 'critical' : amendment ? 'amendment' : 'advisory';
  return { category, priority, important: !obstacleOnly && (critical || amendment) };
}

export function getAllNotams(ofp: AnyRecord | null): ParsedNotam[] {
  if (!ofp) return [];
  const stationHints: Record<string, string> = {
    origin: String(dig(ofp, 'origin.icao_code') || 'ORIGIN'),
    destination: String(dig(ofp, 'destination.icao_code') || 'DEST'),
    alternate: String(dig(ofp, 'alternate.icao_code') || 'ALTN'),
    fir: 'FIR', enroute: 'ENROUTE', general: 'GENERAL'
  };
  const results: ParsedNotam[] = [];
  const seen = new Set<string>();

  const add = (raw: unknown, fallbackStation: string, path: string) => {
    const text = notamText(raw);
    if (!looksLikeCompleteNotam(text)) return false;
    const normalized = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    const dedupeKey = normalized.toUpperCase().replace(/\s+/g, ' ');
    if (seen.has(dedupeKey)) return true;
    seen.add(dedupeKey);
    const station = normalizeNotamStation(normalized, fallbackStation);
    const classification = classifyNotam(normalized);
    results.push({ id: `${station}-${results.length}-${path}`, station, text: normalized, ...classification });
    return true;
  };

  const visit = (value: unknown, station: string, path: string, depth = 0) => {
    if (depth > 10 || value === null || value === undefined) return;
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, station, `${path}.${index}`, depth + 1)); return; }
    if (typeof value === 'object') {
      const object = value as Record<string, unknown>;
      const directKeys = ['notam', 'text', 'raw', 'message', 'content', 'description', 'notam_text', 'full_text', 'body'];
      const direct = directKeys.find(key => object[key] !== undefined && object[key] !== null && object[key] !== '');
      if (direct && add(object[direct], station, path)) return;
      Object.entries(object).forEach(([key, child]) => {
        const lower = key.toLowerCase();
        const nextStation = stationHints[lower] || (/^[A-Z]{4}$/.test(key) ? key : station);
        visit(child, nextStation, `${path}.${key}`, depth + 1);
      });
      return;
    }
    add(value, station, path);
  };

  // SimBrief has used several NOTAM branches over time. Scan each known branch,
  // while deduplicating identical notices, so the complete imported briefing is retained.
  for (const [path, station] of [
    ['notams', 'GENERAL'], ['notam', 'GENERAL'], ['briefing.notams', 'GENERAL'], ['weather.notams', 'GENERAL'],
    ['fir_notams', 'FIR'], ['enroute_notams', 'ENROUTE'], ['navlog.notams', 'ENROUTE']
  ] as const) visit(dig(ofp, path), station, path);
  for (const key of ['origin', 'destination', 'alternate'] as const) {
    for (const suffix of ['notams', 'notam', 'notam_text', 'notam_list']) {
      visit(dig(ofp, `${key}.${suffix}`), stationHints[key], `${key}.${suffix}`);
    }
  }
  return results;
}

export function getNotams(ofp: AnyRecord | null, key: 'origin' | 'destination' | 'alternate'): ParsedNotam[] {
  const station = String(dig(ofp, `${key}.icao_code`) || '').toUpperCase();
  return getAllNotams(ofp).filter(item => item.station === station || item.station === key.toUpperCase());
}

export function getWeather(ofp: AnyRecord | null, key: 'origin' | 'destination' | 'alternate') {
  return {
    metar: String(dig(ofp, `${key}.metar`, `weather.${key}_metar`) || 'No METAR included in this OFP.'),
    taf: String(dig(ofp, `${key}.taf`, `weather.${key}_taf`) || 'No TAF included in this OFP.')
  };
}

export function getOFPDocument(ofp: AnyRecord | null): string | null {
  const candidate = dig<any>(ofp, 'files.pdf.link', 'files.pdf', 'links.pdf', 'general.ofp_pdf');
  const value = typeof candidate === 'string' ? candidate : candidate?.link || candidate?.url;
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http')) return value;
  if (value.startsWith('/')) return `https://www.simbrief.com${value}`;
  return `https://www.simbrief.com/${value}`;
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
    const excerpt = cleanText(largeText.slice(marker, marker + 16000));
    return { available: true, text: excerpt, source: 'OFP text section', documents };
  }
  return { available: documents.length > 0, text: '', source: documents.length ? 'SimBrief document' : '', documents };
}


function scalar(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['#text', '_text', 'value']) if (record[key] !== undefined) return record[key];
  }
  return value;
}

function textValue(value: unknown): string {
  const raw = scalar(value);
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'object') {
    const leaves = stringLeaves(raw).map(item => item.trim()).filter(Boolean);
    return leaves.join(' ').trim();
  }
  return String(raw).trim();
}

function numberValue(value: unknown): number | null {
  const raw = textValue(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function child(record: any, ...keys: string[]): any {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
    const found = Object.keys(record).find(existing => existing.toLowerCase() === key.toLowerCase());
    if (found) return record[found];
  }
  return undefined;
}

function parseTlrConditions(raw: any): TlrConditions {
  return {
    airportIcao: textValue(child(raw, 'airport_icao')),
    plannedRunway: textValue(child(raw, 'planned_runway')).toUpperCase(),
    plannedWeight: numberValue(child(raw, 'planned_weight')) || 0,
    windDirection: numberValue(child(raw, 'wind_direction')),
    windSpeed: numberValue(child(raw, 'wind_speed')),
    temperature: numberValue(child(raw, 'temperature')),
    altimeter: textValue(child(raw, 'altimeter')),
    surfaceCondition: textValue(child(raw, 'surface_condition')),
    flapSetting: textValue(child(raw, 'flap_setting')) || undefined
  };
}

function parseTlrRunway(raw: any): TlrRunway {
  return {
    identifier: textValue(child(raw, 'identifier')).toUpperCase(),
    length: numberValue(child(raw, 'length')),
    tora: numberValue(child(raw, 'length_tora', 'tora')),
    toda: numberValue(child(raw, 'length_toda', 'toda')),
    asda: numberValue(child(raw, 'length_asda', 'asda')),
    lda: numberValue(child(raw, 'length_lda', 'lda')),
    elevation: numberValue(child(raw, 'elevation')),
    gradient: numberValue(child(raw, 'gradient')),
    trueCourse: numberValue(child(raw, 'true_course')),
    magneticCourse: numberValue(child(raw, 'magnetic_course')),
    headwindComponent: numberValue(child(raw, 'headwind_component')),
    crosswindComponent: numberValue(child(raw, 'crosswind_component')),
    ilsFrequency: textValue(child(raw, 'ils_frequency')),
    flapSetting: textValue(child(raw, 'flap_setting')),
    thrustSetting: textValue(child(raw, 'thrust_setting')),
    bleedSetting: textValue(child(raw, 'bleed_setting')),
    antiIceSetting: textValue(child(raw, 'anti_ice_setting')),
    flexTemperature: numberValue(child(raw, 'flex_temperature')),
    maxTemperature: numberValue(child(raw, 'max_temperature')),
    maxWeight: numberValue(child(raw, 'max_weight')),
    maxWeightDry: numberValue(child(raw, 'max_weight_dry')),
    maxWeightWet: numberValue(child(raw, 'max_weight_wet')),
    limitCode: textValue(child(raw, 'limit_code')),
    limitObstacle: textValue(child(raw, 'limit_obstacle')),
    v1: numberValue(child(raw, 'speeds_v1')),
    vr: numberValue(child(raw, 'speeds_vr')),
    v2: numberValue(child(raw, 'speeds_v2')),
    otherSpeed: numberValue(child(raw, 'speeds_other')),
    otherSpeedId: textValue(child(raw, 'speeds_other_id')),
    thrustValue: textValue(child(raw, 'thrust_value')),
    thrustValueId: textValue(child(raw, 'thrust_value_id')),
    distanceDecide: numberValue(child(raw, 'distance_decide')),
    distanceReject: numberValue(child(raw, 'distance_reject')),
    distanceMargin: numberValue(child(raw, 'distance_margin')),
    distanceContinue: numberValue(child(raw, 'distance_continue'))
  };
}

function parseLandingDistance(raw: any): TlrLandingDistance | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    weight: numberValue(child(raw, 'weight')),
    flapSetting: textValue(child(raw, 'flap_setting')),
    brakeSetting: textValue(child(raw, 'brake_setting')),
    reverserCredit: textValue(child(raw, 'reverser_credit')),
    vref: numberValue(child(raw, 'speeds_vref', 'vref')),
    actualDistance: numberValue(child(raw, 'actual_distance')),
    factoredDistance: numberValue(child(raw, 'factored_distance'))
  };
}

function findTlrNode(value: unknown, depth = 0): any {
  if (!value || depth > 7 || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const [key, candidate] of Object.entries(record)) {
    if (key.toLowerCase() === 'tlr' && candidate && typeof candidate === 'object') return candidate;
  }
  for (const candidate of Object.values(record)) {
    const found = findTlrNode(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}

export function getStructuredTlr(ofp: AnyRecord | null): StructuredTlr {
  if (!ofp) return { available: false, takeoff: null, landing: null };
  const root = findTlrNode(ofp);
  if (!root) return { available: false, takeoff: null, landing: null };
  const takeoffRaw = child(root, 'takeoff');
  const landingRaw = child(root, 'landing');
  const takeoffRunways = asArray(child(takeoffRaw, 'runway')).map(parseTlrRunway).filter(runway => runway.identifier);
  const landingRunways = asArray(child(landingRaw, 'runway')).map(parseTlrRunway).filter(runway => runway.identifier);
  const takeoff = takeoffRaw ? { conditions: parseTlrConditions(child(takeoffRaw, 'conditions')), runways: takeoffRunways } : null;
  const landing = landingRaw ? {
    conditions: parseTlrConditions(child(landingRaw, 'conditions')),
    dry: parseLandingDistance(child(landingRaw, 'distance_dry')),
    wet: parseLandingDistance(child(landingRaw, 'distance_wet')),
    runways: landingRunways
  } : null;
  return { available: Boolean(takeoffRunways.length || landingRunways.length), takeoff, landing };
}

export function weight(ofp: AnyRecord | null, ...paths: string[]): number {
  return Number(dig(ofp, ...paths) || 0);
}
