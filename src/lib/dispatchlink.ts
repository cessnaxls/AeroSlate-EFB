import airlineCodes from '../data/airlineCodes';
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

export type Fr24PasteFormat = 'airport-table' | 'airport-compact' | 'aircraft-history-cards' | 'aircraft-history-table';
export type Fr24TimeMode = 'utc' | 'local-converted' | 'local-unresolved' | 'unknown';

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
  sourceFormat?: Fr24PasteFormat;
  timeMode?: Fr24TimeMode;
  rawStd?: string;
  rawSta?: string;
}

export interface Fr24ParseResult {
  flights: FlightCandidate[];
  formats: Fr24PasteFormat[];
  timeModes: Fr24TimeMode[];
  warnings: string[];
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

type SourceClockMode = 'utc' | 'local' | 'unknown';

interface ClockValue {
  minutes: number;
  label: string;
}

interface ScheduleResult {
  std: string;
  sta: string;
  ete: string;
  timeMode: Fr24TimeMode;
}

const MONTH_INDEX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cleanLine(value: string): string {
  return String(value || '').replace(/[\u00a0\u202f]/g, ' ').trim();
}

function parseClock(value?: string): ClockValue | null {
  const raw = cleanLine(value || '').replace(/\b(?:UTC|ZULU)\b/gi, '').replace(/z$/i, '').trim();
  let match = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!match) match = raw.match(/^(\d{1,2})(\d{2})\s*([AP]M)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] || '').toUpperCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  } else if (hour > 23) return null;
  const minutes = hour * 60 + minute;
  return { minutes, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function normalizedDate(value: string, fallbackYear = new Date().getUTCFullYear()): string | null {
  const clean = cleanLine(value).replace(/^[A-Za-z]+,\s*/, '');
  let match = clean.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (match) return `${match[1].padStart(2, '0')} ${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()} ${match[3]}`;
  match = clean.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (match) return `${match[2].padStart(2, '0')} ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[3] || fallbackYear}`;
  return null;
}

function dateParts(value: string): { day: number; month: number; year: number } | null {
  const normalized = normalizedDate(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTH_INDEX[match[2].toUpperCase()];
  return month === undefined ? null : { day: Number(match[1]), month, year: Number(match[3]) };
}

function addDays(value: string, count: number): string {
  const parts = dateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month, parts.day + count));
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function pageYear(text: string): number {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1])).filter(year => year >= 2000 && year <= 2100);
  return years.length ? years[0] : new Date().getUTCFullYear();
}

function todayAtAirport(airport: Airport | undefined, yearHint: number): string {
  const now = new Date();
  try {
    if (airport?.timezoneName) {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: airport.timezoneName, day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(now);
      const day = parts.find(part => part.type === 'day')?.value;
      const month = parts.find(part => part.type === 'month')?.value;
      if (day && month) return `${day} ${month} ${yearHint}`;
    }
  } catch { /* fall through */ }
  return `${String(now.getUTCDate()).padStart(2, '0')} ${MONTH_LABELS[now.getUTCMonth()]} ${yearHint}`;
}

function sourceClockMode(text: string, defaultLocal = false): SourceClockMode {
  if (/all times are in\s+(?:utc|zulu)|\bUTC\s+TIME\b|\bTIMES?\s+IN\s+UTC\b/i.test(text)) return 'utc';
  if (/all times are in local timezone|\bLOCAL TIME\s*:/i.test(text)) return 'local';
  return defaultLocal ? 'local' : 'unknown';
}

function airportForCode(code: string, airports: Map<string, Airport>): Airport | undefined {
  return airports.get(code) || [...airports.values()].find(airport => airport.icao === code || airport.iata === code);
}

function zonedInstant(dateLabel: string, timeValue: string, airport: Airport | undefined): Date | null {
  const date = dateParts(dateLabel);
  const clock = parseClock(timeValue);
  if (!date || !clock || !airport?.timezoneName) return null;
  const hour = Math.floor(clock.minutes / 60);
  const minute = clock.minutes % 60;
  const desired = Date.UTC(date.year, date.month, date.day, hour, minute, 0);
  let guess = desired;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: airport.timezoneName,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const parts = formatter.formatToParts(new Date(guess));
      const take = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
      const represented = Date.UTC(take('year'), take('month') - 1, take('day'), take('hour') % 24, take('minute'), take('second'));
      const delta = represented - desired;
      if (Math.abs(delta) < 1000) break;
      guess -= delta;
    }
    return new Date(guess);
  } catch {
    return null;
  }
}

function utcLabel(value: Date | null): string {
  return value ? `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}z` : '—';
}

function durationMinutes(value?: string): number | null {
  const match = cleanLine(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function scheduleTimes(
  dateLabel: string,
  rawStd: string,
  rawSta: string,
  departure: string,
  arrival: string,
  sourceMode: SourceClockMode,
  airports: Map<string, Airport>,
  durationHint?: string
): ScheduleResult {
  const depClock = parseClock(rawStd);
  const arrClock = parseClock(rawSta);
  if (sourceMode === 'utc') {
    const elapsed = depClock && arrClock ? (arrClock.minutes - depClock.minutes + 1440) % 1440 : null;
    return {
      std: depClock ? `${depClock.label}z` : '—',
      sta: arrClock ? `${arrClock.label}z` : '—',
      ete: elapsed === null ? '—' : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
      timeMode: 'utc'
    };
  }

  if (sourceMode === 'local') {
    const depAirport = airportForCode(departure, airports);
    const arrAirport = airportForCode(arrival, airports);
    const depInstant = depClock ? zonedInstant(dateLabel, rawStd, depAirport) : null;
    let arrInstant: Date | null = null;
    let elapsed: number | null = null;
    if (arrClock && arrAirport) {
      const candidates = [-1, 0, 1, 2]
        .map(dayOffset => zonedInstant(addDays(dateLabel, dayOffset), rawSta, arrAirport))
        .filter((value): value is Date => Boolean(value));
      if (depInstant && candidates.length) {
        const hint = durationMinutes(durationHint);
        const viable = candidates.map(value => ({ value, minutes: Math.round((value.getTime() - depInstant.getTime()) / 60000) }))
          .filter(candidate => candidate.minutes >= 0 && candidate.minutes <= 30 * 60);
        viable.sort((a, b) => hint === null ? a.minutes - b.minutes : Math.abs(a.minutes - hint) - Math.abs(b.minutes - hint));
        if (viable[0]) { arrInstant = viable[0].value; elapsed = viable[0].minutes; }
      } else arrInstant = candidates[0] || null;
    }
    const resolved = (!depClock || Boolean(depInstant)) && (!arrClock || Boolean(arrInstant));
    return {
      std: depClock ? (depInstant ? utcLabel(depInstant) : depClock.label) : '—',
      sta: arrClock ? (arrInstant ? utcLabel(arrInstant) : arrClock.label) : '—',
      ete: elapsed === null ? (depClock && arrClock ? `${Math.floor(((arrClock.minutes - depClock.minutes + 1440) % 1440) / 60)}:${String((arrClock.minutes - depClock.minutes + 1440) % 60).padStart(2, '0')}` : '—') : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
      timeMode: resolved ? 'local-converted' : 'local-unresolved'
    };
  }

  const elapsed = depClock && arrClock ? (arrClock.minutes - depClock.minutes + 1440) % 1440 : null;
  return {
    std: depClock?.label || '—',
    sta: arrClock?.label || '—',
    ete: elapsed === null ? '—' : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
    timeMode: 'unknown'
  };
}

interface AirlineCodeRecord { iata: string; icao: string; name: string; country: string; active: boolean; }
const GLOBAL_IATA_TO_ICAO: Record<string, string> = Object.fromEntries(
  (airlineCodes as readonly AirlineCodeRecord[])
    .filter(row => /^[A-Z0-9]{2}$/.test(row.iata) && /^[A-Z0-9]{3}$/.test(row.icao))
    .map(row => [row.iata, row.icao])
);
const COMMON_IATA_TO_ICAO: Record<string, string> = {
  ...GLOBAL_IATA_TO_ICAO,
  AA: 'AAL', UA: 'UAL', DL: 'DAL', WN: 'SWA', AS: 'ASA', B6: 'JBU', NK: 'NKS', F9: 'FFT',
  MQ: 'ENY', OH: 'JIA', PT: 'PDT', YX: 'RPA', OO: 'SKW', YV: 'ASH', G7: 'GJS', C5: 'UCA',
  ZW: 'AWI', CP: 'CPZ', AX: 'LOF', '9E': 'EDV', MX: 'MXY', G4: 'AAY', '5X': 'UPS',
  AC: 'ACA', XP: 'VXP', '2I': 'SRU', V0: 'VCV', QL: 'LER', '9V': 'ROI', R7: 'OCA'
};
export const AIRLINE_CODE_COUNT = (airlineCodes as readonly AirlineCodeRecord[]).length;

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
  const match = cleanLine(value || '').toUpperCase().match(/^([A-Z]{3}|[A-Z0-9]{2})(\d+[A-Z]?)$/);
  if (!match) return cleanLine(value || '—').toUpperCase() || '—';
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
  const match = cleanLine(raw).match(/\b([A-Z0-9]{3,4})\b(?:\s*\(([A-Z0-9-]+)\))?/i);
  return match ? [match[1].toUpperCase(), (match[2] || '—').toUpperCase()] : [cleanLine(raw || '—').toUpperCase(), '—'];
}

const REGISTRATION_PATTERNS = [
  /^N(?:[1-9]\d{0,2}[A-Z]{2}|[1-9]\d{0,3}[A-Z]|[1-9]\d{0,4})/i,
  // Broad ICAO registration form used by VQ-/VP-/RA-/UR-/YV-/9H-/etc.
  // This is evaluated only at the beginning of the aircraft-detail remainder.
  /^(?:[A-Z0-9]{1,3})-[A-Z0-9]{3,7}/i,
  /^(?:C|G|D|F|EC|EI|PH|VH|ZS|TC|A6|A7|9V|VT|PK|HS|RP-C|XA|XB|XC|PR|PP|PT|PU|LV|CX|CC|CP|HC|TG|TI|HP|HK|OB|YV)-?[A-Z0-9]{3,5}/i,
  /^JA\d{3,4}[A-Z]?/i,
  /^HL\d{4}/i,
  /^B-[A-Z0-9]{4,5}/i,
  /^YV\d{3,5}/i,
  /^HK-?\d{3,5}[A-Z]?/i
];
function extractRegistration(value: string): string {
  const text = cleanLine(value).replace(/^[^A-Z0-9]+/i, '');
  for (const pattern of REGISTRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].toUpperCase();
  }
  return '—';
}
function parseCompactAircraft(raw: string): [string, string] {
  const compact = cleanLine(raw).replace(/^\s+/, '');
  const typeMatch = compact.match(/^([A-Z0-9]{3,4}|-)\s*(.*)$/i);
  if (!typeMatch) return ['—', '—'];
  const aircraft = typeMatch[1] === '-' ? '—' : typeMatch[1].toUpperCase();
  return [aircraft, extractRegistration(typeMatch[2] || '')];
}

function rowId(row: Omit<FlightCandidate, 'id'>) {
  return `${row.date}|${row.flightNumber}|${row.departure}|${row.arrival}|${row.std}`;
}

function operationalSection(lines: string[]): { start: number; isDeparture: boolean } | null {
  const tableHeader = lines.findIndex(line => /\bTIME\b.*\bFLIGHT\b.*\b(?:TO|FROM)\b/i.test(cleanLine(line)));
  if (tableHeader >= 0) {
    for (let index = tableHeader - 1; index >= Math.max(0, tableHeader - 12); index -= 1) {
      if (/^Departures$/i.test(cleanLine(lines[index]))) return { start: tableHeader + 1, isDeparture: true };
      if (/^Arrivals$/i.test(cleanLine(lines[index]))) return { start: tableHeader + 1, isDeparture: false };
    }
  }
  const departures = lines.map((line, index) => /^Departures$/i.test(cleanLine(line)) ? index : -1).filter(index => index >= 0);
  const arrivals = lines.map((line, index) => /^Arrivals$/i.test(cleanLine(line)) ? index : -1).filter(index => index >= 0);
  const departureIndex = departures.at(-1) ?? -1;
  const arrivalIndex = arrivals.at(-1) ?? -1;
  const start = Math.max(departureIndex, arrivalIndex);
  return start >= 0 ? { start: start + 1, isDeparture: departureIndex > arrivalIndex } : null;
}

function parseAirportTable(lines: string[], text: string, airports: Map<string, Airport>): FlightCandidate[] {
  const section = operationalSection(lines);
  if (!section) return [];
  const home = pageAirport(text, airports);
  const sourceMode = sourceClockMode(text);
  const format: Fr24PasteFormat = 'airport-table';
  const year = pageYear(text);
  let date = todayAtAirport(airportForCode(home, airports), year);
  const rows: FlightCandidate[] = [];

  for (let index = section.start; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    if (/delay statistics|disclaimer|all times are/i.test(line)) break;
    const dateValue = normalizedDate(line, year);
    if (dateValue) { date = dateValue; continue; }
    if (/^Load (?:earlier|later) flights$/i.test(line)) continue;

    const cells = String(lines[index]).replace(/[\u00a0\u202f]/g, ' ').split('\t').map(cleanLine);
    const rawTime = cells[0] || '';
    if (!parseClock(rawTime)) continue;
    let rawFlight = cells[1] || '';
    let place = cells[2] || '';
    let aircraftRaw = cells[4] || '';

    if (!/\([A-Z0-9]{3,4}\)/i.test(place)) {
      const next = cleanLine(lines[index + 1] || '');
      if (/\([A-Z0-9]{3,4}\)/i.test(next)) { place = next; index += 1; }
    }
    if (!aircraftRaw || !/\b[A-Z0-9]{3,4}\b(?:\s*\([A-Z0-9-]+\))?/i.test(aircraftRaw)) {
      const next = String(lines[index + 1] || '').replace(/[\u00a0\u202f]/g, ' ').split('\t').map(cleanLine).filter(Boolean);
      aircraftRaw = next.at(-1) || cleanLine(lines[index + 1] || '');
      if (aircraftRaw) index += 1;
    }

    const [aircraft, registration] = parseAircraft(aircraftRaw);
    if (!rawFlight) rawFlight = registration !== '—' ? registration : '—';
    const other = normalizeAirportCode(place, airports);
    const departure = section.isDeparture ? home : other;
    const arrival = section.isDeparture ? other : home;
    const schedule = scheduleTimes(date, section.isDeparture ? rawTime : '', section.isDeparture ? '' : rawTime, departure, arrival, sourceMode, airports);
    const base: Omit<FlightCandidate, 'id'> = {
      date, aircraft, registration,
      flightNumber: flightToIcao(rawFlight, undefined, COMMON_IATA_TO_ICAO),
      departure, arrival,
      std: schedule.std, sta: schedule.sta, ete: schedule.ete,
      sourceFormat: format, timeMode: schedule.timeMode,
      rawStd: section.isDeparture ? cleanLine(rawTime) : '', rawSta: section.isDeparture ? '' : cleanLine(rawTime)
    };
    rows.push({ id: rowId(base), ...base });
  }
  return rows;
}

function parseAirportCompact(lines: string[], text: string, airports: Map<string, Airport>): FlightCandidate[] {
  const section = operationalSection(lines);
  if (!section) return [];
  const home = pageAirport(text, airports);
  const sourceMode = sourceClockMode(text);
  const format: Fr24PasteFormat = 'airport-compact';
  const year = pageYear(text);
  let date = todayAtAirport(airportForCode(home, airports), year);
  let previousClock: number | null = null;
  const rows: FlightCandidate[] = [];

  for (let index = section.start; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    if (/delay statistics|disclaimer|all times are/i.test(line)) break;
    const dateValue = normalizedDate(line, year);
    if (dateValue) { date = dateValue; previousClock = null; continue; }
    const match = line.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s+(?:([A-Z0-9]{2,3}\d{1,5}[A-Z]?)\s+)?(.+?)\s*\(([A-Z0-9]{3,4})\)\s*$/i);
    if (!match) continue;
    const clock = parseClock(match[1]);
    if (!clock) continue;
    if (previousClock !== null && clock.minutes < previousClock - 360) date = addDays(date, 1);
    previousClock = clock.minutes;
    const place = `${match[3]} (${match[4]})`;
    const aircraftLine = cleanLine(lines[index + 1] || '');
    const [aircraft, registration] = parseCompactAircraft(aircraftLine);
    if (aircraftLine && !/^(?:Estimated|Scheduled|Landed|Load |\* All times|Departure delay|Disclaimer)/i.test(aircraftLine)) index += 1;
    const rawFlight = match[2] || (registration !== '—' ? registration : '—');
    const other = normalizeAirportCode(place, airports);
    const departure = section.isDeparture ? home : other;
    const arrival = section.isDeparture ? other : home;
    const schedule = scheduleTimes(date, section.isDeparture ? match[1] : '', section.isDeparture ? '' : match[1], departure, arrival, sourceMode, airports);
    const base: Omit<FlightCandidate, 'id'> = {
      date, aircraft, registration,
      flightNumber: flightToIcao(rawFlight, undefined, COMMON_IATA_TO_ICAO),
      departure, arrival,
      std: schedule.std, sta: schedule.sta, ete: schedule.ete,
      sourceFormat: format, timeMode: schedule.timeMode,
      rawStd: section.isDeparture ? cleanLine(match[1]) : '', rawSta: section.isDeparture ? '' : cleanLine(match[1])
    };
    rows.push({ id: rowId(base), ...base });
  }
  return rows;
}

function aircraftHeader(text: string): { registration: string; aircraft: string; map: Record<string, string>; operator?: string } {
  return {
    registration: text.match(/Flight history for aircraft\s*-\s*([A-Z0-9-]+)/i)?.[1]?.toUpperCase() || '—',
    aircraft: text.match(/TYPE CODE\s*\n?\s*([A-Z0-9]{3,4})/i)?.[1]?.toUpperCase() || '—',
    map: airlineMap(text),
    operator: operatorIcao(text)
  };
}

function parseAircraftCards(lines: string[], text: string, airports: Map<string, Airport>): FlightCandidate[] {
  const historyIndex = lines.findIndex(line => /^FLIGHTS HISTORY$/i.test(cleanLine(line)));
  if (historyIndex < 0) return [];
  const header = aircraftHeader(text);
  const sourceMode = sourceClockMode(text, true);
  const format: Fr24PasteFormat = 'aircraft-history-cards';
  const rows: FlightCandidate[] = [];
  const isFlight = (value: string) => /^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/i.test(cleanLine(value));
  const isDate = (value: string) => Boolean(normalizedDate(value));

  for (let index = historyIndex + 1; index < lines.length;) {
    if (!isFlight(lines[index]) || !isDate(lines[index + 1] || '')) { index += 1; continue; }
    let end = index + 2;
    while (end < lines.length && !(isFlight(lines[end]) && isDate(lines[end + 1] || ''))) {
      if (/More than \d+ days|Looking for even more|© \d{4}/i.test(cleanLine(lines[end]))) break;
      end += 1;
    }
    const block = lines.slice(index, end).map(cleanLine);
    const after = (label: string) => {
      const at = block.findIndex(value => value.toUpperCase() === label);
      return at >= 0 ? block[at + 1] || '' : '';
    };
    const date = normalizedDate(block[1]) || block[1];
    const departure = normalizeAirportCode(after('FROM'), airports);
    const arrival = normalizeAirportCode(after('TO'), airports);
    const rawStd = after('STD');
    const rawSta = after('STA');
    const durationHint = block.slice(2).find(value => /^\d{1,2}:\d{2}$/.test(value));
    const schedule = scheduleTimes(date, rawStd, rawSta, departure, arrival, sourceMode, airports, durationHint);
    const base: Omit<FlightCandidate, 'id'> = {
      date, aircraft: header.aircraft, registration: header.registration,
      flightNumber: flightToIcao(block[0], header.operator, header.map),
      departure, arrival,
      std: schedule.std, sta: schedule.sta, ete: schedule.ete,
      sourceFormat: format, timeMode: schedule.timeMode,
      rawStd, rawSta
    };
    if (departure !== '—' && arrival !== '—') rows.push({ id: rowId(base), ...base });
    index = Math.max(end, index + 1);
  }
  return rows;
}

function parseAircraftTable(lines: string[], text: string, airports: Map<string, Airport>): FlightCandidate[] {
  const headerIndex = lines.findIndex(line => /\bDATE\b.*\bFROM\b.*\bTO\b.*\bFLIGHT\b.*\bSTD\b.*\bSTA\b/i.test(cleanLine(line)));
  if (headerIndex < 0) return [];
  const header = aircraftHeader(text);
  const sourceMode = sourceClockMode(text, true);
  const format: Fr24PasteFormat = 'aircraft-history-table';
  const rows: FlightCandidate[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const parts = String(lines[index]).replace(/[\u00a0\u202f]/g, ' ').split('\t').map(cleanLine).filter(Boolean);
    const dateIndex = parts.findIndex(value => Boolean(normalizedDate(value)));
    if (dateIndex < 0 || parts.length < dateIndex + 8) continue;
    const date = normalizedDate(parts[dateIndex]) || parts[dateIndex];
    const departure = normalizeAirportCode(parts[dateIndex + 1], airports);
    const arrival = normalizeAirportCode(parts[dateIndex + 2], airports);
    const rawFlight = parts[dateIndex + 3];
    const durationHint = parts[dateIndex + 4];
    const rawStd = parts[dateIndex + 5];
    const rawSta = parts[dateIndex + 7];
    const schedule = scheduleTimes(date, rawStd, rawSta, departure, arrival, sourceMode, airports, durationHint);
    const base: Omit<FlightCandidate, 'id'> = {
      date, aircraft: header.aircraft, registration: header.registration,
      flightNumber: rawFlight === '—' ? header.registration : flightToIcao(rawFlight, header.operator, header.map),
      departure, arrival,
      std: schedule.std, sta: schedule.sta, ete: schedule.ete,
      sourceFormat: format, timeMode: schedule.timeMode,
      rawStd, rawSta
    };
    rows.push({ id: rowId(base), ...base });
  }
  return rows;
}

function splitFr24Documents(clip: string): string[] {
  const normalized = clip.replace(/\r\n?/g, '\n');
  const loginParts = normalized.split(/^\s*LOG IN\s*$/gmi).map(part => part.trim()).filter(part => /Flight tracker map|Flight history for aircraft|\bDepartures\b|\bArrivals\b/i.test(part));
  if (loginParts.length > 1) return loginParts;
  const starts = [...normalized.matchAll(/^\s*Flight tracker map\s*$/gmi)].map(match => match.index || 0);
  if (starts.length <= 1) return [normalized];
  return starts.map((start, index) => normalized.slice(start, starts[index + 1] ?? normalized.length).trim()).filter(Boolean);
}

function mergeFlights(rows: FlightCandidate[]): FlightCandidate[] {
  const merged = new Map<string, FlightCandidate>();
  for (const row of rows) {
    const key = `${row.date}|${row.flightNumber}|${row.departure}|${row.arrival}|${row.std}`;
    const prior = merged.get(key);
    if (!prior) { merged.set(key, row); continue; }
    const choose = (a: string, b: string) => a && a !== '—' ? a : b;
    const combined = {
      ...prior,
      aircraft: choose(prior.aircraft, row.aircraft),
      registration: choose(prior.registration, row.registration),
      sta: choose(prior.sta, row.sta),
      ete: choose(prior.ete, row.ete),
      rawSta: choose(prior.rawSta || '', row.rawSta || ''),
      timeMode: prior.timeMode === 'local-unresolved' ? row.timeMode : prior.timeMode
    };
    merged.set(key, { ...combined, id: rowId(combined) });
  }
  return [...merged.values()].sort((a, b) => {
    const aDate = dateParts(a.date); const bDate = dateParts(b.date);
    const aClock = parseClock(a.rawStd || a.std); const bClock = parseClock(b.rawStd || b.std);
    const aStamp = aDate ? Date.UTC(aDate.year, aDate.month, aDate.day, 0, aClock?.minutes || 0) : 0;
    const bStamp = bDate ? Date.UTC(bDate.year, bDate.month, bDate.day, 0, bClock?.minutes || 0) : 0;
    return aStamp - bStamp || a.flightNumber.localeCompare(b.flightNumber);
  });
}

export function parseFr24PasteDetailed(clip: string, airports: Map<string, Airport>): Fr24ParseResult {
  if (!clip.trim()) return { flights: [], formats: [], timeModes: [], warnings: [] };
  const allRows: FlightCandidate[] = [];
  const formats = new Set<Fr24PasteFormat>();
  const warnings = new Set<string>();

  for (const document of splitFr24Documents(clip)) {
    const rawLines = document.split(/\r?\n/).filter(line => cleanLine(line));
    const text = rawLines.map(cleanLine).join('\n');
    let rows: FlightCandidate[] = [];
    let format: Fr24PasteFormat | null = null;
    if (/\bDATE\b.*\bFROM\b.*\bTO\b.*\bFLIGHT\b.*\bSTD\b.*\bSTA\b/i.test(text) && /Flight history for aircraft/i.test(text)) {
      format = 'aircraft-history-table'; rows = parseAircraftTable(rawLines, text, airports);
    } else if (/FLIGHTS HISTORY/i.test(text) && /Flight history for aircraft/i.test(text)) {
      format = 'aircraft-history-cards'; rows = parseAircraftCards(rawLines, text, airports);
    } else if (/\bTIME\b.*\bFLIGHT\b.*\b(?:TO|FROM)\b/i.test(text) && /\b(?:Departures|Arrivals)\b/i.test(text)) {
      format = 'airport-table'; rows = parseAirportTable(rawLines, text, airports);
    } else if (/\b(?:Departures|Arrivals)\b/i.test(text)) {
      format = 'airport-compact'; rows = parseAirportCompact(rawLines, text, airports);
    }
    if (format && rows.length) formats.add(format);
    allRows.push(...rows);
    if (format === 'airport-compact' && !rawLines.some(line => Boolean(normalizedDate(cleanLine(line), pageYear(text))))) {
      warnings.add('The compact airport paste does not include calendar dates. AeroSlate inferred the first date from the device date at the airport and detected midnight rollover from the schedule order.');
    }
  }

  const flights = mergeFlights(allRows);
  const timeModes = [...new Set(flights.map(row => row.timeMode || 'unknown'))];
  if (timeModes.includes('local-converted')) warnings.add('FR24 identified the pasted schedule as local time. AeroSlate converted each time to UTC using the departure or arrival airport timezone in airports.dat.');
  if (timeModes.includes('local-unresolved')) warnings.add('Some local times could not be converted because an airport timezone was unavailable. Review those rows before dispatching.');
  if (timeModes.includes('unknown')) warnings.add('The paste did not identify its timezone. Times were normalized but not converted.');
  return { flights, formats: [...formats], timeModes, warnings: [...warnings] };
}

export function parseFr24Paste(clip: string, airports: Map<string, Airport>): FlightCandidate[] {
  return parseFr24PasteDetailed(clip, airports).flights;
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

const AIRCRAFT_CAPACITY: Record<string, number> = {
  A319: 150, A320: 180, A20N: 186, A321: 220, A21N: 235, A220: 135, A223: 145, BCS1: 125, BCS3: 145,
  B737: 143, B738: 175, B38M: 178, B739: 179, B39M: 179, B752: 199, B753: 234, B763: 218, B764: 238,
  B772: 300, B77W: 350, B788: 242, B789: 290, B78X: 330, A332: 260, A333: 290, A339: 300, A359: 315,
  CRJ2: 50, CRJ7: 70, CRJ9: 76, E170: 70, E175: 76, E75L: 76, E75S: 76, E190: 100, E195: 118, AT72: 70
};
function randomInteger(min: number, max: number): number { return Math.floor(min + Math.random() * (max - min + 1)); }
function departureHour(flight: FlightCandidate): number {
  const source = flight.timeMode === 'local-converted' && flight.rawStd ? flight.rawStd : flight.std;
  const match = String(source || '').match(/(\d{1,2}):?(\d{2})/);
  return match ? Number(match[1]) % 24 : 12;
}
export interface DispatchPayload {
  seats: number; pax: number; bags: number; paxWeight: number; bagWeight: number; freight: number; payloadWeight: number;
}
export function generateDispatchPayload(flight: FlightCandidate): DispatchPayload {
  const normalized = normalizeSimbriefType(flight.aircraft || 'A320');
  const seats = AIRCRAFT_CAPACITY[normalized] || AIRCRAFT_CAPACITY[String(flight.aircraft || '').toUpperCase()] || 180;
  const hour = departureHour(flight);
  const range: [number, number] = hour < 5 ? [42, 70] : hour < 9 ? [68, 95] : hour < 16 ? [72, 98] : hour < 22 ? [78, 100] : [50, 78];
  const pax = Math.max(1, Math.round(seats * randomInteger(range[0], range[1]) / 100));
  const bags = randomInteger(Math.ceil(pax * 0.8), pax);
  const paxWeight = pax * 190;
  const bagWeight = bags * 40;
  const maximumFreight = Math.floor(((paxWeight + bagWeight) * 0.25) / 10) * 10;
  const freight = Math.random() < 0.175 && maximumFreight >= 10 ? randomInteger(1, Math.max(1, Math.floor(maximumFreight / 10))) * 10 : 0;
  return { seats, pax, bags, paxWeight, bagWeight, freight, payloadWeight: paxWeight + bagWeight + freight };
}
export function pickOFPLayout(flightNumber: string): string {
  const airline = flightNumber.match(/^([A-Z]{3})/)?.[1] || '';
  if (airline === 'UAL') return randomItem(['UAL 2012', 'UAL 2018']);
  if (airline === 'ENY') return 'AAL';
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
  return `AEROSLATE_${Math.abs(hash >>> 0).toString(36).toUpperCase()}`;
}

function poundsToThousands(value: number): string {
  return (Math.max(0, value) / 1000).toFixed(3).replace(/\.?0+$/, '');
}

function durationParts(value: string): [string, string] {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? [match[1], match[2]] : ['', ''];
}

export function buildSimbriefDispatch(flight: FlightCandidate, extras: { pax?: number; bags?: number; bagWeight?: number; payload?: number; freight?: number; cargo?: number; remarks?: string; pilotId?: string } = {}): SimbriefDispatch {
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
  if (extras.pax != null) params.set('pax', String(Math.max(0, Math.round(extras.pax))));
  const payload = extras.payload;
  const freight = extras.freight ?? extras.cargo;
  // The documented SimBrief API has no manual `payload` input. Passing the
  // website field name in a custom URL produces incorrect values, so do not
  // send payload/manualpayload at all. SimBrief does support `paxwgt` inside
  // acdata and `cargo` in thousands of pounds. Its standard LBS load model
  // assigns 55 lb of checked baggage per passenger; offset that standard
  // baggage allowance through paxwgt so the resulting visible Payload equals
  // AeroSlate's exact (pax × 190 lb) + (bags × 40 lb) total.
  if (payload != null) {
    const payloadLb = Math.max(0, Math.round(payload));
    params.set('as_payload_lbs', String(payloadLb));
    if (extras.pax && extras.pax > 0) {
      const simbriefBagAllowancePerPax = 55;
      const adjustedPaxWeight = Math.max(0, (payloadLb / extras.pax) - simbriefBagAllowancePerPax);
      params.set('acdata', JSON.stringify({ paxwgt: Number(adjustedPaxWeight.toFixed(3)) }));
    }
  }
  if (freight != null) {
    const freightLb = Math.max(0, Math.round(freight));
    params.set('cargo', poundsToThousands(freightLb));
    params.set('as_freight_lbs', String(freightLb));
  }
  if (extras.remarks) params.set('manualrmk', extras.remarks);
  if (extras.pilotId && /^\d+$/.test(extras.pilotId)) params.set('pid', extras.pilotId);
  return { url: `https://dispatch.simbrief.com/options/custom?${params.toString()}`, staticId };
}

export function buildSimbriefUrl(flight: FlightCandidate, extras: { pax?: number; bags?: number; bagWeight?: number; payload?: number; freight?: number; cargo?: number; remarks?: string; pilotId?: string } = {}): string {
  return buildSimbriefDispatch(flight, extras).url;
}
