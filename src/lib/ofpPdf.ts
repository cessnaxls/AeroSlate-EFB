import { asArray, dig, getICAOFlightPlan, getNavlog, getProcedures, getSelcal, getWeather, leafText, type AnyRecord, type FlightSummary } from './ofp';

interface PdfBuildResult { bytes: Uint8Array; filename: string; styleName: string; }
interface Section { title: string; lines: string[]; }

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 34;
const MARGIN_TOP = 38;
const MARGIN_BOTTOM = 34;
const FONT_SIZE = 8.4;
const LEADING = 10.2;
const MAX_COLS = 103;

const scalar = (v: unknown, fallback = '—') => leafText(v, fallback);
const numeric = (v: unknown, unit = '') => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('en-US')}${unit}` : '—';
};
const clean = (v: unknown) => scalar(v, '').replace(/\s+/g, ' ').trim();
const humanize = (key: string) => key
  .replace(/[_-]+/g, ' ')
  .replace(/\b(?:icao|iata|atc|oew|zfw|tow|ldw|mtow|mlw|etops|pbn|selcal|metar|taf|utc|tas|isa|oat|vor|ils|rvr|sid|star)\b/gi, m => m.toUpperCase())
  .replace(/\b\w/g, m => m.toUpperCase());

function wrap(text: string, width = MAX_COLS): string[] {
  const source = String(text ?? '').replace(/\r/g, '').trimEnd();
  if (!source) return [''];
  const output: string[] = [];
  for (const rawLine of source.split('\n')) {
    let line = rawLine.trimEnd();
    if (!line) { output.push(''); continue; }
    while (line.length > width) {
      let cut = line.lastIndexOf(' ', width);
      if (cut < Math.floor(width * 0.55)) cut = width;
      output.push(line.slice(0, cut).trimEnd());
      line = line.slice(cut).trimStart();
    }
    output.push(line);
  }
  return output;
}

function kv(label: string, value: unknown, width = 22): string {
  return `${label.toUpperCase().padEnd(width, ' ')} ${clean(value) || '—'}`;
}

function table(headers: string[], rows: string[][], widths: number[]): string[] {
  const format = (cells: string[]) => cells.map((cell, i) => String(cell ?? '').slice(0, widths[i]).padEnd(widths[i], ' ')).join(' ');
  return [format(headers), widths.map(w => '-'.repeat(w)).join(' '), ...rows.map(format)];
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function collectLeaves(value: unknown, path: string[] = [], out: { path: string[]; value: string }[] = [], seen = new Set<unknown>()): { path: string[]; value: string }[] {
  if (value === null || value === undefined || value === '') return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (text) out.push({ path, value: text });
    return out;
  }
  if (typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeaves(item, [...path, String(index + 1)], out, seen));
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => collectLeaves(item, [...path, key], out, seen));
  }
  return out;
}

function buildSections(ofp: AnyRecord, flight: FlightSummary, style: number): Section[] {
  const { sid, star } = getProcedures(ofp);
  const alternates = asArray(dig(ofp, 'alternate')).map((a: any) => clean(a?.icao_code || a?.icao)).filter(Boolean).join(', ') || flight.alternate || 'NONE';
  const originWx = getWeather(ofp, 'origin');
  const destWx = getWeather(ofp, 'destination');
  const altWx = getWeather(ofp, 'alternate');
  const atc = getICAOFlightPlan(ofp);
  const navlog = getNavlog(ofp);
  const units = flight.units || clean(dig(ofp, 'params.units')) || 'LBS';
  const release = flight.release || clean(dig(ofp, 'general.release')) || '1';
  const flightId = `${flight.airline}${flight.flightNumber}`;
  const line = style === 1 ? '='.repeat(MAX_COLS) : style === 2 ? '*'.repeat(MAX_COLS) : '-'.repeat(MAX_COLS);

  const overview: string[] = [
    line,
    style === 0 ? '                         A E R O S L A T E   O P E R A T I O N A L   F L I G H T   P L A N' :
    style === 1 ? 'AEROSLATE DISPATCH RELEASE / OPERATIONAL FLIGHT PLAN' :
    style === 2 ? 'AEROSLATE AIR OPERATIONS — FLIGHT RELEASE' :
                  'AEROSLATE TELEX OFP — CREW BRIEFING COPY',
    line,
    `${flightId.padEnd(12)} ${flight.origin.padEnd(5)} TO ${flight.destination.padEnd(5)}  RELEASE ${release.padEnd(4)}  DATE ${flight.flightDate}`,
    `${(flight.aircraft || '—').padEnd(12)} REG ${flight.registration.padEnd(10)} CALLSIGN ${(flight.callsign || flightId).padEnd(14)} OFP ${clean(dig(ofp, 'params.planformat', 'params.ofp_layout', 'general.planformat')) || 'STANDARD'}`,
    line,
    kv('Scheduled out / in', `${flight.schedOut} / ${flight.schedIn}`),
    kv('Block / ETE', `${flight.blockTime} / ${flight.ete}`),
    kv('Route distance', `${flight.distance} NM`),
    kv('Cruise', `${flight.cruiseAltitude}  TAS ${clean(dig(ofp, 'general.cruise_tas')) || '—'} KT  MACH ${clean(dig(ofp, 'general.cruise_mach')) || '—'}  CI ${flight.costIndex}`),
    kv('Dispatcher', clean(dig(ofp, 'general.dx_name', 'general.dispatcher', 'params.dispatcher')) || '—'),
  ];

  const route: string[] = [
    kv('Departure', `${flight.origin} ${flight.originName}`),
    kv('Runway / SID', `${flight.departureRunway || '—'} / ${sid}`),
    kv('Destination', `${flight.destination} ${flight.destinationName}`),
    kv('Runway / STAR', `${flight.arrivalRunway || '—'} / ${star}`),
    kv('Alternate(s)', alternates),
    '',
    'ROUTE:',
    ...wrap(flight.route || clean(dig(ofp, 'general.route', 'atc.route')) || '—', MAX_COLS),
  ];

  const aircraft: string[] = [
    kv('Aircraft', `${flight.aircraft} / ${clean(dig(ofp, 'aircraft.name')) || '—'}`),
    kv('Registration', flight.registration),
    kv('Fleet / FIN', clean(dig(ofp, 'aircraft.fin', 'aircraft.fleet_number')) || '—'),
    kv('SELCAL', getSelcal(ofp)),
    kv('Engines', clean(dig(ofp, 'aircraft.engines', 'aircraft.engine')) || '—'),
    kv('PBN / equipment', clean(dig(ofp, 'general.pbn', 'aircraft.equipment', 'atc.equipment')) || '—'),
  ];

  const fuelRows = [
    ['RAMP', numeric(dig(ofp, 'fuel.plan_ramp'), ` ${units}`)],
    ['TAXI', numeric(dig(ofp, 'fuel.taxi'), ` ${units}`)],
    ['TAKEOFF', numeric(dig(ofp, 'fuel.plan_takeoff'), ` ${units}`)],
    ['TRIP', numeric(dig(ofp, 'fuel.enroute_burn'), ` ${units}`)],
    ['CONT', numeric(dig(ofp, 'fuel.contingency'), ` ${units}`)],
    ['ALTN', numeric(dig(ofp, 'fuel.alternate_burn'), ` ${units}`)],
    ['RESERVE', numeric(dig(ofp, 'fuel.reserve'), ` ${units}`)],
    ['EXTRA', numeric(dig(ofp, 'fuel.extra'), ` ${units}`)],
    ['LANDING', numeric(dig(ofp, 'fuel.plan_landing'), ` ${units}`)],
  ];
  const fuel = table(['ITEM', 'PLANNED'], fuelRows, [20, 30]);

  const weightRows = [
    ['BASIC/EMPTY', numeric(dig(ofp, 'weights.oew', 'weights.bow'), ` ${units}`)],
    ['PAX COUNT', numeric(dig(ofp, 'weights.pax_count'))],
    ['PAX WEIGHT', numeric(dig(ofp, 'weights.pax_weight'), ` ${units}`)],
    ['BAG COUNT', numeric(dig(ofp, 'weights.bag_count'))],
    ['BAG WEIGHT', numeric(dig(ofp, 'weights.bag_weight'), ` ${units}`)],
    ['CARGO/FREIGHT', numeric(dig(ofp, 'weights.cargo'), ` ${units}`)],
    ['PAYLOAD', numeric(dig(ofp, 'weights.payload'), ` ${units}`)],
    ['ZFW / MAX', `${numeric(dig(ofp, 'weights.est_zfw'), ` ${units}`)} / ${numeric(dig(ofp, 'weights.max_zfw'), ` ${units}`)}`],
    ['TOW / MAX', `${numeric(dig(ofp, 'weights.est_tow'), ` ${units}`)} / ${numeric(dig(ofp, 'weights.max_tow'), ` ${units}`)}`],
    ['LDW / MAX', `${numeric(dig(ofp, 'weights.est_ldw'), ` ${units}`)} / ${numeric(dig(ofp, 'weights.max_ldw'), ` ${units}`)}`],
  ];
  const weights = table(['LOAD ITEM', 'VALUE'], weightRows, [24, 44]);

  const weather: string[] = [
    `${flight.origin} METAR`, ...wrap(originWx.metar || 'NOT AVAILABLE'),
    `${flight.origin} TAF`, ...wrap(originWx.taf || 'NOT AVAILABLE'), '',
    `${flight.destination} METAR`, ...wrap(destWx.metar || 'NOT AVAILABLE'),
    `${flight.destination} TAF`, ...wrap(destWx.taf || 'NOT AVAILABLE'),
  ];
  if (alternates !== 'NONE') weather.push('', `ALTERNATE METAR`, ...wrap(altWx.metar || 'NOT AVAILABLE'), `ALTERNATE TAF`, ...wrap(altWx.taf || 'NOT AVAILABLE'));

  const navRows = navlog.map((fix: AnyRecord, index) => [
    String(index + 1),
    clean(dig(fix, 'ident', 'name')).slice(0, 9),
    clean(dig(fix, 'via_airway', 'via', 'airway')).slice(0, 9),
    numeric(dig(fix, 'altitude_feet', 'altitude'), ''),
    `${clean(dig(fix, 'wind_dir')) || '—'}/${clean(dig(fix, 'wind_spd')) || '—'}`,
    clean(dig(fix, 'oat')) || '—',
    numeric(dig(fix, 'fuel_leg'), ''),
    numeric(dig(fix, 'fuel_total'), ''),
  ]);
  const nav = navRows.length ? table(['#','FIX','VIA','ALT','WIND','OAT','BURN','REMAIN'], navRows, [3,9,9,8,8,5,8,10]) : ['NO NAVLOG DATA AVAILABLE'];

  const notamLines: string[] = [];
  const notams = dig<any>(ofp, 'notams');
  if (notams) {
    for (const [station, items] of Object.entries(notams)) {
      const list = asArray(items);
      if (!list.length) continue;
      notamLines.push(`${humanize(station)} NOTAMS`);
      list.forEach((item: any, idx) => {
        const text = clean(item?.notam ?? item?.text ?? item);
        if (text) notamLines.push(...wrap(`${idx + 1}. ${text}`));
      });
      notamLines.push('');
    }
  }
  if (!notamLines.length) notamLines.push('NO NOTAMS INCLUDED IN THE IMPORTED OFP.');

  const remarks = [
    ...wrap(clean(dig(ofp, 'general.dx_rmk', 'params.manualrmk', 'general.remarks')) || 'NO DISPATCHER REMARKS.'),
  ];

  const atcLines = atc ? wrap(atc) : ['NO ICAO FLIGHT PLAN INCLUDED.'];

  const tlrRaw = clean(dig(ofp, 'text.tlr', 'tlr'));
  const tlr = tlrRaw ? wrap(tlrRaw) : ['NO RUNWAY ANALYSIS TEXT INCLUDED.'];

  const knownTop = new Set(['fetch','params','general','origin','destination','alternate','aircraft','times','fuel','weights','navlog','notams','text','tlr']);
  const supplemental: string[] = [];
  Object.entries(ofp).filter(([key]) => !knownTop.has(key)).forEach(([group, value]) => {
    const leaves = collectLeaves(value);
    if (!leaves.length) return;
    supplemental.push(`[${humanize(group)}]`);
    leaves.slice(0, 180).forEach(item => {
      const label = item.path.map(part => /^\d+$/.test(part) ? `ITEM ${part}` : humanize(part)).join(' / ');
      supplemental.push(...wrap(`${label}: ${item.value}`));
    });
    supplemental.push('');
  });
  if (!supplemental.length) supplemental.push('NO ADDITIONAL STRUCTURED DATA WAS INCLUDED.');

  const sections: Section[] = [
    { title: 'FLIGHT RELEASE', lines: overview },
    { title: 'ROUTE AND AIRPORTS', lines: route },
    { title: 'AIRCRAFT AND EQUIPMENT', lines: aircraft },
    { title: 'FUEL PLAN', lines: fuel },
    { title: 'WEIGHTS AND LOAD', lines: weights },
    { title: 'WEATHER', lines: weather },
    { title: 'NAVIGATION LOG', lines: nav },
    { title: 'NOTAMS', lines: notamLines },
    { title: 'ICAO FLIGHT PLAN', lines: atcLines },
    { title: 'RUNWAY ANALYSIS / TLR', lines: tlr },
    { title: 'DISPATCH REMARKS', lines: remarks },
    { title: 'SUPPLEMENTAL OPERATIONAL DATA', lines: supplemental },
  ];

  const orders = [
    sections,
    [sections[0],sections[1],sections[3],sections[4],sections[2],sections[5],sections[6],sections[8],sections[9],sections[7],sections[10],sections[11]],
    [sections[0],sections[2],sections[1],sections[5],sections[3],sections[4],sections[9],sections[6],sections[7],sections[8],sections[10],sections[11]],
    [sections[0],sections[1],sections[5],sections[2],sections[4],sections[3],sections[6],sections[7],sections[9],sections[8],sections[10],sections[11]],
  ];
  return orders[style % orders.length];
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ch => {
    const map: Record<string,string> = { '→':'->', '—':'-', '–':'-', '·':'/', '°':' DEG ', '’':"'", '“':'"', '”':'"' };
    return map[ch] ?? '?';
  });
}

function makePdf(pages: string[][], title: string): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const pageIds: number[] = [];

  pages.forEach((lines, pageIndex) => {
    const commands: string[] = ['BT', `/F1 ${FONT_SIZE} Tf`, `${LEADING} TL`, `${MARGIN_X} ${PAGE_H - MARGIN_TOP} Td`];
    lines.forEach((line, i) => {
      const isHeader = /^\s*(?:AEROSLATE|FLIGHT RELEASE|ROUTE AND|AIRCRAFT AND|FUEL PLAN|WEIGHTS AND|WEATHER|NAVIGATION LOG|NOTAMS|ICAO FLIGHT PLAN|RUNWAY ANALYSIS|DISPATCH REMARKS|SUPPLEMENTAL OPERATIONAL DATA)/.test(line);
      commands.push(`${isHeader ? '/F2' : '/F1'} ${FONT_SIZE} Tf`);
      commands.push(`(${escapePdfText(line)}) Tj`);
      if (i < lines.length - 1) commands.push('T*');
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /PageMode /UseNone >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = `%PDF-1.4\n% AeroSlate OFP\n`;
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info << /Title (${escapePdfText(title)}) /Producer (AeroSlate EFB) >> >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function buildOFPpdf(ofp: AnyRecord, flight: FlightSummary): PdfBuildResult {
  const seed = hash(`${flight.airline}${flight.flightNumber}-${flight.origin}-${flight.destination}-${flight.flightDate}-${flight.release}`);
  const style = seed % 4;
  const styleNames = ['Classic Telex', 'Dispatch Release', 'Air Operations', 'Crew Briefing'];
  const sections = buildSections(ofp, flight, style);
  const lines: string[] = [];
  sections.forEach((section, index) => {
    if (index) lines.push('', '');
    lines.push(section.title, '-'.repeat(Math.min(MAX_COLS, Math.max(28, section.title.length + 8))), ...section.lines);
  });

  const usableLines = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) / LEADING) - 2;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += usableLines) {
    const page = lines.slice(i, i + usableLines);
    page.push('', `${`${flight.airline}${flight.flightNumber} ${flight.origin}-${flight.destination}`.padEnd(70)} PAGE ${pages.length + 1}`);
    pages.push(page);
  }
  const title = `${flight.airline}${flight.flightNumber} ${flight.origin}-${flight.destination} OFP`;
  return {
    bytes: makePdf(pages, title),
    filename: `${flight.airline}${flight.flightNumber}_${flight.origin}-${flight.destination}_OFP.pdf`,
    styleName: styleNames[style],
  };
}
