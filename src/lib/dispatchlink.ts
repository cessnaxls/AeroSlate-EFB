export interface Airport {
  id: number;
  name: string;
  city: string;
  country: string;
  iata: string;
  icao: string;
  latitude: number;
  longitude: number;
  elevationFt: number;
  timezoneOffset: number | null;
  timezoneName: string;
  type: string;
  source: string;
  size: 'large' | 'medium' | 'small';
}

export interface FlightCandidate {
  id: string;
  date: string;
  aircraft: string;
  registration: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  std: string;
  sta: string;
  ete: string;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(value); value = '';
    } else value += ch;
  }
  cells.push(value);
  return cells.map(cell => cell.trim());
}

function classifyAirport(name: string, iata: string, type: string): Airport['size'] {
  const n = name.toLowerCase();
  if (/heliport|seaplane|airstrip|closed/.test(n) || !iata || iata === '\\N') return 'small';
  if (/international|intercontinental|gateway|john f kennedy|heathrow|charles de gaulle|o'hare|hartsfield/.test(n)) return 'large';
  if (type.toLowerCase().includes('large')) return 'large';
  if (type.toLowerCase().includes('medium')) return 'medium';
  return 'medium';
}

export function parseAirportsDat(text: string): Airport[] {
  const airports: Airport[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = parseCsvLine(line);
    if (row.length < 14) continue;
    const icao = (row[5] || '').toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
    const iata = row[4] === '\\N' ? '' : (row[4] || '').toUpperCase();
    const timezoneRaw = Number(row[9]);
    airports.push({
      id: Number(row[0]) || airports.length + 1,
      name: row[1] || icao,
      city: row[2] || '',
      country: row[3] || '',
      iata,
      icao,
      latitude: Number(row[6]) || 0,
      longitude: Number(row[7]) || 0,
      elevationFt: Number(row[8]) || 0,
      timezoneOffset: Number.isFinite(timezoneRaw) ? timezoneRaw : null,
      timezoneName: row[11] === '\\N' ? '' : (row[11] || ''),
      type: row[12] || 'airport',
      source: row[13] || '',
      size: classifyAirport(row[1] || '', iata, row[12] || '')
    });
  }
  return airports;
}

export function airportMap(airports: Airport[]): Map<string, Airport> {
  const map = new Map<string, Airport>();
  airports.forEach(airport => {
    map.set(airport.icao, airport);
    if (airport.iata) map.set(airport.iata, airport);
  });
  return map;
}

export function normalizeAirportCode(value: string, airports: Map<string, Airport>): string {
  const raw = (value || '').toUpperCase().match(/\(([A-Z0-9]{3,4})\)/)?.[1] || (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return airports.get(raw)?.icao || raw || '—';
}

function zulu(value?: string): string {
  const raw = (value || '').trim().toLowerCase().replace(/z/g, '').replace(/\s/g, '');
  const match = raw.match(/^(\d{1,2}):?(\d{2})$/);
  if (!match) return value?.trim() || '—';
  const hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return value?.trim() || '—';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}z`;
}

function ete(std?: string, sta?: string): string {
  const toMinutes = (v?: string) => {
    const match = (v || '').replace(/z/gi, '').match(/^(\d{1,2}):?(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const dep = toMinutes(std); const arr = toMinutes(sta);
  if (dep === null || arr === null) return '—';
  const minutes = (arr - dep + 1440) % 1440;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

const COMMON_IATA_TO_ICAO: Record<string, string> = {
  AA: 'AAL', UA: 'UAL', DL: 'DAL', WN: 'SWA', AS: 'ASA', B6: 'JBU', NK: 'NKS', F9: 'FFT',
  MQ: 'ENY', OH: 'JIA', PT: 'PDT', YX: 'RPA', OO: 'SKW', YV: 'ASH', G7: 'GJS', C5: 'UCA',
  ZW: 'AWI', CP: 'CPZ', AX: 'LOF', '9E': 'EDV'
};

function airlineMap(text: string) {
  const result = { ...COMMON_IATA_TO_ICAO };
  for (const match of text.matchAll(/\bCode\s+([A-Z0-9]{2})\s*\/\s*([A-Z0-9]{3})/gi)) result[match[1].toUpperCase()] = match[2].toUpperCase();
  return result;
}

function operatorIcao(text: string): string | undefined {
  const codes = [...text.matchAll(/\bCode\s+([A-Z0-9]{2})\s*\/\s*([A-Z0-9]{3})/gi)];
  return codes.at(-1)?.[2]?.toUpperCase();
}

function flightToIcao(value: string, operator: string | undefined, map: Record<string, string>): string {
  const match = (value || '').trim().toUpperCase().match(/^([A-Z]{3}|[A-Z0-9]{2})(\d+[A-Z]?)$/);
  if (!match) return (value || '—').toUpperCase();
  if (match[1].length === 3) return match[1] + match[2];
  return (operator || map[match[1]] || match[1]) + match[2];
}

function pageAirport(text: string, airports: Map<string, Airport>): string {
  const pair = text.match(/\b([A-Z0-9]{3})\s*\/\s*([A-Z0-9]{4})\b/);
  if (pair) return pair[2].toUpperCase();
  const header = text.match(/Airports\s*>.*?\n\s*([A-Z0-9]{3})\b/is);
  return header ? normalizeAirportCode(header[1], airports) : '—';
}

function parseAircraft(raw: string): [string, string] {
  const match = (raw || '').trim().match(/\b([A-Z0-9]{3,4})\b(?:\s*\(([A-Z0-9-]+)\))?/i);
  return match ? [match[1].toUpperCase(), (match[2] || '—').toUpperCase()] : [(raw || '—').toUpperCase(), '—'];
}

function rowId(row: Omit<FlightCandidate, 'id'>) {
  return `${row.date}|${row.flightNumber}|${row.departure}|${row.arrival}|${row.std}`;
}

function parseAirportPage(lines: string[], text: string, airports: Map<string, Airport>): FlightCandidate[] {
  const departureIndex = lines.findIndex(line => /^Departures$/i.test(line));
  const arrivalIndex = lines.findIndex(line => /^Arrivals$/i.test(line));
  const isDeparture = departureIndex >= 0 && (arrivalIndex < 0 || departureIndex < arrivalIndex);
  const start = isDeparture ? departureIndex : arrivalIndex;
  if (start < 0) return [];
  const home = pageAirport(text, airports);
  const rows: FlightCandidate[] = [];
  let date = '—';
  for (let i = start + 1; i < lines.length;) {
    const line = lines[i].trim();
    if (/delay statistics|disclaimer|all times are/i.test(line)) break;
    if (/^[A-Za-z]+,\s+[A-Za-z]{3}\s+\d{1,2}$/.test(line)) { date = line; i += 1; continue; }
    if (/\bTIME\b.*\bFLIGHT\b/i.test(line)) { i += 1; continue; }
    const tabbed = line.split('\t').map(v => v.trim());
    const time = /^\d{1,2}:\d{2}$/.test(tabbed[0] || '') ? tabbed[0] : (/^\d{1,2}:\d{2}$/.test(line) ? line : '');
    if (!time) { i += 1; continue; }
    const flightInRow = Boolean(tabbed[1]);
    const rawFlight = (flightInRow ? tabbed[1] : (lines[i + 1] || '—')).toUpperCase();
    const flight = flightToIcao(rawFlight, undefined, COMMON_IATA_TO_ICAO);
    const hasPlaceInRow = Boolean(tabbed[2]);
    const place = tabbed[2] || lines[i + (flightInRow ? 1 : 2)] || '—';
    const aircraftLineIndex = hasPlaceInRow ? i + 1 : i + (flightInRow ? 2 : 3);
    const aircraftLine = lines[aircraftLineIndex] || '—';
    const aircraftRaw = aircraftLine.split(/\t+/).filter(Boolean).at(-1) || aircraftLine;
    const [aircraft, registration] = parseAircraft(aircraftRaw);
    const other = normalizeAirportCode(place, airports);
    const base = {
      date, aircraft, registration, flightNumber: flight,
      departure: isDeparture ? home : other,
      arrival: isDeparture ? other : home,
      std: isDeparture ? zulu(time) : '—',
      sta: isDeparture ? '—' : zulu(time),
      ete: '—'
    };
    rows.push({ id: rowId(base), ...base });
    i = Math.max(i + 1, aircraftLineIndex + 1);
  }
  return rows;
}

export function parseFr24Paste(clip: string, airports: Map<string, Airport>): FlightCandidate[] {
  if (!clip.trim()) return [];
  const lines = clip.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const text = lines.join('\n');
  const airportRows = parseAirportPage(lines, text, airports);
  if (airportRows.length) return airportRows;

  const registration = text.match(/Flight history for aircraft\s*-\s*([A-Z0-9-]+)/i)?.[1]?.toUpperCase() || '—';
  const aircraft = text.match(/TYPE CODE\s*([A-Z0-9]{3,4})/i)?.[1]?.toUpperCase() || '—';
  const map = airlineMap(text); const operator = operatorIcao(text);
  const rows: FlightCandidate[] = [];

  for (const line of lines) {
    if (!line.includes('\t')) continue;
    const parts = line.split('\t').map(v => v.trim()).filter(Boolean);
    if (parts.length < 8 || !/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(parts[0])) continue;
    const [date, dep, arr, rawFlight, , rawStd, , rawSta] = parts;
    const base = {
      date, aircraft, registration,
      flightNumber: /^\([A-Z0-9-]+\)$/.test(rawFlight) || rawFlight === '—' ? registration : flightToIcao(rawFlight, operator, map),
      departure: normalizeAirportCode(dep, airports), arrival: normalizeAirportCode(arr, airports),
      std: zulu(rawStd), sta: zulu(rawSta), ete: ete(rawStd, rawSta)
    };
    rows.push({ id: rowId(base), ...base });
  }
  if (rows.length) return rows;

  for (let i = 0; i + 7 < lines.length; i += 1) {
    if (!/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(lines[i])) continue;
    const [date, dep, arr, rawFlight, , rawStd, , rawSta] = lines.slice(i, i + 8);
    if (!/\([A-Z0-9]{3,4}\)/.test(dep) || !/\([A-Z0-9]{3,4}\)/.test(arr)) continue;
    const base = {
      date, aircraft, registration,
      flightNumber: /^\([A-Z0-9-]+\)$/.test(rawFlight) || rawFlight === '—' ? registration : flightToIcao(rawFlight, operator, map),
      departure: normalizeAirportCode(dep, airports), arrival: normalizeAirportCode(arr, airports),
      std: zulu(rawStd), sta: zulu(rawSta), ete: ete(rawStd, rawSta)
    };
    rows.push({ id: rowId(base), ...base });
    i += 7;
  }
  return rows;
}

const TYPE_MAP: Record<string, string> = {
  A3ST: 'A30F', BCS1: 'A220', A221: 'A220', BCS3: 'A223', A22X: 'A223', B37M: 'B38M', B3XM: 'B38M',
  B39M: 'B739', BBJ1: 'B737', BBJ2: 'B738', BBJ3: 'B739', B48F: 'B748', E45X: 'E145', E13L: 'E135',
  E19L: 'E190', E90: 'E190', E95: 'E195', E295: 'E195', E75S: 'E175', E75L: 'E175', EVAL: 'E190',
  CRJ1: 'CRJ2', CRJ5: 'CRJ2', AT73: 'AT72', AT75: 'AT72', AT76: 'AT72', B461: 'RJ70', B462: 'RJ85',
  B463: 'RJ1H', MD1F: 'MD11', SR2T: 'SR22', TBM8: 'TBM9', KODI: 'C208', CONI: 'CONC', CONS: 'CONC'
};

const REGIONAL = new Set(['RPA', 'GJS', 'ENY', 'SKW', 'CPZ', 'JIA', 'PDT', 'EDV', 'QXE', 'ASH', 'OOF', 'UCA', 'AWI', 'LOF']);
const KNOWN_LAYOUTS = new Set(['AAL', 'DAL', 'SWA', 'ASA', 'JBU', 'NKS', 'FFT', 'UPS', 'FDX', 'BAW', 'EZY', 'RYR', 'AFR', 'KLM', 'DLH', 'IBE', 'SAS', 'FIN', 'LOT', 'VLG', 'AZA', 'UAE', 'QTR', 'ETD', 'ANA', 'JAL', 'CPA', 'THY']);
const FALLBACK_LAYOUTS = [...KNOWN_LAYOUTS, 'UAL'];

function randomItem<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }

export function normalizeSimbriefType(type: string): string { return TYPE_MAP[type.toUpperCase()] || type.toUpperCase(); }
export function pickOFPLayout(flightNumber: string): string {
  const airline = flightNumber.match(/^([A-Z]{3})/)?.[1] || '';
  if (airline === 'UAL') return randomItem(['UAL 2012', 'UAL 2018']);
  if (KNOWN_LAYOUTS.has(airline)) return airline;
  if (REGIONAL.has(airline)) return randomItem(['AAL', 'DAL', 'UAL 2012', 'UAL 2018']);
  return randomItem(FALLBACK_LAYOUTS).replace(/^UAL$/, randomItem(['UAL 2012', 'UAL 2018']));
}

export interface SimbriefDispatch {
  url: string;
  staticId: string;
}

function simbriefDate(value: string): string {
  const direct = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (direct) return `${direct[1].padStart(2, '0')}${direct[2].toUpperCase()}${direct[3].slice(-2)}`;
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return `${String(date.getUTCDate()).padStart(2, '0')}${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()}${String(date.getUTCFullYear()).slice(-2)}`;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `DISPATCHLINK_${Math.abs(hash >>> 0).toString(36).toUpperCase()}`;
}

function durationParts(value: string): [string, string] {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? [match[1], match[2]] : ['', ''];
}

export function buildSimbriefDispatch(flight: FlightCandidate, extras: { pax?: number; cargo?: number; remarks?: string; pilotId?: string } = {}): SimbriefDispatch {
  const flightMatch = flight.flightNumber.match(/^([A-Z]{3})(\d+[A-Z]?)$/);
  const clock = flight.std.replace(/[^0-9]/g, '').padStart(4, '0');
  const [steh, stem] = durationParts(flight.ete);
  const layout = pickOFPLayout(flight.flightNumber);
  const staticId = stableId(`${flight.id}|${flight.flightNumber}|${flight.departure}|${flight.arrival}`);
  const params = new URLSearchParams({
    orig: flight.departure,
    dest: flight.arrival,
    type: normalizeSimbriefType(flight.aircraft),
    reg: flight.registration === '—' ? '' : flight.registration,
    airline: flightMatch?.[1] || '',
    fltnum: flightMatch?.[2] || '',
    date: simbriefDate(flight.date),
    deph: clock.slice(0, 2),
    depm: clock.slice(2, 4),
    utc: '1',
    static_id: staticId,
    planformat: layout,
    ofp: layout,
    ofp_layout: layout,
    layout,
    units: 'LBS',
    navlog: '1',
    tlr: '1',
    notams: '1',
    firnot: '1',
    maps: 'detail',
    stepclimbs: '1',
    find_sidstar: 'R'
  });
  if (steh) params.set('steh', steh);
  if (stem) params.set('stem', stem);
  if (!flightMatch && flight.flightNumber !== '—') params.set('callsign', flight.flightNumber);
  if (extras.pax) params.set('pax', String(extras.pax));
  if (extras.cargo) params.set('cargo', String(extras.cargo));
  if (extras.remarks) params.set('manualrmk', extras.remarks);
  if (extras.pilotId && /^\d+$/.test(extras.pilotId)) params.set('pid', extras.pilotId);
  return { url: `https://dispatch.simbrief.com/options/custom?${params.toString()}`, staticId };
}

export function buildSimbriefUrl(flight: FlightCandidate, extras: { pax?: number; cargo?: number; remarks?: string; pilotId?: string } = {}): string {
  return buildSimbriefDispatch(flight, extras).url;
}
