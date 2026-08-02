export type AnyRecord = Record<string, any>;

export interface FlightSummary {
  release: string;
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

export function zuluFromEpoch(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return new Date(seconds * 1000).toISOString().slice(11, 16) + 'Z';
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

export function summary(ofp: AnyRecord | null): FlightSummary {
  if (!ofp) {
    return {
      release: '—', airline: '', flightNumber: '', callsign: '', origin: '----', destination: '----', alternate: '----',
      originName: 'No flight loaded', destinationName: '', aircraft: '—', registration: '—', route: 'Import your latest SimBrief OFP',
      cruiseAltitude: '—', costIndex: '—', schedOut: '--:--', schedIn: '--:--', blockTime: '--:--', ete: '--:--', distance: '—', units: 'LBS'
    };
  }
  const units = String(dig(ofp, 'params.units', 'general.units') || 'LBS').toUpperCase();
  return {
    release: String(dig(ofp, 'general.release', 'fetch.time') || '—'),
    airline: String(dig(ofp, 'general.icao_airline', 'params.airline') || ''),
    flightNumber: String(dig(ofp, 'general.flight_number', 'params.fltnum') || ''),
    callsign: String(dig(ofp, 'atc.callsign', 'general.callsign') || ''),
    origin: String(dig(ofp, 'origin.icao_code', 'params.orig') || '----'),
    destination: String(dig(ofp, 'destination.icao_code', 'params.dest') || '----'),
    alternate: String(dig(ofp, 'alternate.icao_code', 'params.altn') || '----'),
    originName: String(dig(ofp, 'origin.name') || ''),
    destinationName: String(dig(ofp, 'destination.name') || ''),
    aircraft: String(dig(ofp, 'aircraft.icao_code', 'aircraft.type', 'params.type') || '—'),
    registration: String(dig(ofp, 'aircraft.reg', 'params.reg') || '—'),
    route: String(dig(ofp, 'general.route', 'atc.route', 'params.route') || '—'),
    cruiseAltitude: String(dig(ofp, 'general.initial_altitude', 'params.fl') || '—'),
    costIndex: String(dig(ofp, 'general.costindex', 'params.civalue') || '—'),
    schedOut: zuluFromEpoch(dig(ofp, 'times.sched_out', 'times.est_out')),
    schedIn: zuluFromEpoch(dig(ofp, 'times.sched_in', 'times.est_in')),
    blockTime: duration(dig(ofp, 'times.block_time')),
    ete: duration(dig(ofp, 'times.est_time_enroute')),
    distance: numberText(dig(ofp, 'general.route_distance', 'general.gc_distance'), ' NM'),
    units
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

export function getFlightMaps(ofp: AnyRecord | null): { title: string; url: string }[] {
  const files = dig<any>(ofp, 'files');
  if (!files || typeof files !== 'object') return [];
  const results: { title: string; url: string }[] = [];
  for (const [key, raw] of Object.entries(files)) {
    if (!/map|route|weather/i.test(key)) continue;
    const values = asArray(raw);
    values.forEach((item, index) => {
      const link = typeof item === 'string' ? item : item?.link || item?.url;
      if (typeof link !== 'string') return;
      const url = link.startsWith('http') ? link : `https://www.simbrief.com/${link.replace(/^\//, '')}`;
      results.push({ title: `${key.replace(/_/g, ' ')}${values.length > 1 ? ` ${index + 1}` : ''}`, url });
    });
  }
  return results;
}

export function weight(ofp: AnyRecord | null, ...paths: string[]): number {
  return Number(dig(ofp, ...paths) || 0);
}
