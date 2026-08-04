import { asArray, dig, getICAOFlightPlan, getNavlog, getProcedures, getSelcal, getWeather, leafText, type AnyRecord, type FlightSummary } from './ofp';

interface PdfBuildResult { bytes: Uint8Array; filename: string; styleName: string; coverage: CoverageSummary; }
interface Section { title: string; lines: string[]; }
interface Leaf { path: string; value: string; }
interface CoverageSummary { totalLeaves: number; standardLeaves: number; appendixLeaves: number; suppressedLeaves: number; }

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 30;
const MARGIN_TOP = 34;
const MARGIN_BOTTOM = 32;
const FONT_SIZE = 7.7;
const LEADING = 9.2;
const MAX_COLS = 112;

const scalar = (v: unknown, fallback = '-') => leafText(v, fallback);
const clean = (v: unknown) => scalar(v, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const num = (v: unknown, unit = '') => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('en-US')}${unit}` : '-';
};
const fmtTime = (v: unknown) => {
  const s = clean(v);
  if (!s) return '-';
  if (/^\d+$/.test(s) && s.length >= 9) {
    const d = new Date(Number(s) * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(11, 16) + 'Z';
  }
  return s;
};
const human = (key: string) => key.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function wrap(text: string, width = MAX_COLS): string[] {
  const source = String(text ?? '').replace(/\r/g, '').trimEnd();
  if (!source) return [''];
  const out: string[] = [];
  source.split('\n').forEach(raw => {
    let line = raw.trimEnd();
    if (!line) { out.push(''); return; }
    while (line.length > width) {
      let cut = line.lastIndexOf(' ', width);
      if (cut < Math.floor(width * .55)) cut = width;
      out.push(line.slice(0, cut).trimEnd());
      line = line.slice(cut).trimStart();
    }
    out.push(line);
  });
  return out;
}

function kv(label: string, value: unknown, width = 24): string {
  return `${label.toUpperCase().padEnd(width)} ${clean(value) || '-'}`;
}

function table(headers: string[], rows: string[][], widths: number[], right: number[] = []): string[] {
  const formatCell = (value: string, width: number, alignRight: boolean) => {
    const text = String(value ?? '');
    return alignRight ? text.slice(0, width).padStart(width) : text.slice(0, width).padEnd(width);
  };
  const format = (cells: string[]) => cells.map((cell, i) => formatCell(cell, widths[i], right.includes(i))).join(' ');
  return [format(headers), widths.map(w => '-'.repeat(w)).join(' '), ...rows.map(format)];
}

function wrappedTable(headers: string[], rows: string[][], widths: number[], right: number[] = []): string[] {
  const out = table(headers, [], widths, right);
  rows.forEach(row => {
    const wrapped = row.map((cell, i) => wrap(String(cell ?? ''), widths[i]));
    const height = Math.max(...wrapped.map(lines => lines.length));
    for (let line = 0; line < height; line++) {
      const cells = wrapped.map((lines, i) => {
        const text = lines[line] || '';
        return right.includes(i) ? text.padStart(widths[i]) : text.padEnd(widths[i]);
      });
      out.push(cells.join(' '));
    }
  });
  return out;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function collectLeaves(value: unknown, path = '', out: Leaf[] = [], seen = new Set<unknown>()): Leaf[] {
  if (value === null || value === undefined || value === '') return out;
  if (['string','number','boolean'].includes(typeof value)) {
    const text = String(value).trim();
    if (text) out.push({ path, value: text });
    return out;
  }
  if (typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, i) => collectLeaves(item, `${path}.${i}`, out, seen));
  else Object.entries(value as Record<string, unknown>).forEach(([k,v]) => collectLeaves(v, path ? `${path}.${k}` : k, out, seen));
  return out;
}

function airportItems(ofp: AnyRecord, key: 'origin'|'destination'|'alternate', child: string): AnyRecord[] {
  const root = dig<any>(ofp, `${key}.${child}`);
  if (!root) return [];
  if (Array.isArray(root)) return root as AnyRecord[];
  if (typeof root === 'object') {
    const item = (root as AnyRecord).item ?? (root as AnyRecord).items;
    if (item) return asArray(item) as AnyRecord[];
    const values = Object.values(root as AnyRecord).filter(v => v && typeof v === 'object');
    return values as AnyRecord[];
  }
  return [];
}

function stationNotams(ofp: AnyRecord, key: 'origin'|'destination'|'alternate', icao: string): string[] {
  const items = airportItems(ofp, key, 'notam');
  const rows: string[][] = [];
  const seen = new Set<string>();
  items.forEach(item => {
    const id = clean(dig(item, 'notam_id', 'id')) || '-';
    const text = clean(dig(item, 'notam_text', 'text', 'notam'));
    if (!text) return;
    const unique = `${id}|${text}`;
    if (seen.has(unique)) return;
    seen.add(unique);
    const effective = fmtTime(dig(item, 'date_effective', 'effective'));
    const expires = fmtTime(dig(item, 'date_expire', 'expires'));
    rows.push([id, effective, expires, text]);
  });
  if (!rows.length) return [];
  return [`${icao} NOTAMS (${rows.length})`, ...wrappedTable(['ID','EFFECTIVE','EXPIRES','NOTICE'], rows, [11,17,17,64]), ''];
}

function atisLines(ofp: AnyRecord, key: 'origin'|'destination', icao: string): string[] {
  const items = airportItems(ofp, key, 'atis');
  const rows: string[][] = [];
  items.forEach(item => {
    const letter = clean(dig(item, 'letter', 'phonetic')) || '-';
    const network = clean(dig(item, 'network')) || '-';
    const message = clean(dig(item, 'message', 'text'));
    if (message) rows.push([letter, network, message]);
  });
  return rows.length ? [`${icao} ATIS`, ...wrappedTable(['INFO','SOURCE','MESSAGE'], rows, [7,13,91]), ''] : [];
}

function profileRows(ofp: AnyRecord): string[][] {
  const candidates: Array<[string,string[]]> = [
    ['Cruise profile',['general.cruise_profile']], ['Climb profile',['general.climb_profile']],
    ['Descent profile',['general.descent_profile']], ['Alternate profile',['general.alternate_profile']],
    ['Contingency rule',['general.cont_rule']], ['Reserve profile',['general.reserve_profile']],
    ['Average wind',['general.avg_wind_dir']], ['Average wind speed',['general.avg_wind_spd']],
    ['Wind component',['general.avg_wind_comp']], ['Average ISA deviation',['general.avg_temp_dev']],
    ['Tropopause',['general.avg_tropopause']], ['Air distance',['general.air_distance']],
  ];
  return candidates.map(([label, paths]) => [label, clean(dig(ofp, ...paths))]).filter(row => row[1]);
}

function buildSections(ofp: AnyRecord, flight: FlightSummary, style: number): { sections: Section[]; coverage: CoverageSummary } {
  const { sid, star } = getProcedures(ofp);
  const alternates = asArray(dig(ofp, 'alternate')).map((a:any) => clean(a?.icao_code || a?.icao)).filter(Boolean).join(', ') || flight.alternate || 'NONE';
  const originWx = getWeather(ofp, 'origin');
  const destWx = getWeather(ofp, 'destination');
  const altWx = getWeather(ofp, 'alternate');
  const navlog = getNavlog(ofp);
  const atc = getICAOFlightPlan(ofp);
  const units = flight.units || clean(dig(ofp, 'params.units')) || 'LBS';
  const release = flight.release || clean(dig(ofp, 'general.release')) || '1';
  const flightId = `${flight.airline}${flight.flightNumber}`;
  const divider = style === 1 ? '='.repeat(MAX_COLS) : style === 2 ? '*'.repeat(MAX_COLS) : '-'.repeat(MAX_COLS);

  const overview = [
    divider,
    style === 0 ? 'AEROSLATE OPERATIONAL FLIGHT PLAN' : style === 1 ? 'AEROSLATE DISPATCH RELEASE' : style === 2 ? 'AEROSLATE AIR OPERATIONS RELEASE' : 'AEROSLATE CREW OFP',
    divider,
    `${flightId.padEnd(12)} ${flight.origin.padEnd(5)}-${flight.destination.padEnd(5)} RELEASE ${release.padEnd(3)} DATE ${flight.flightDate}`,
    `${flight.aircraft.padEnd(10)} REG ${flight.registration.padEnd(10)} CALLSIGN ${(flight.callsign || flightId).padEnd(12)} FORMAT ${clean(dig(ofp,'params.planformat','params.ofp_layout','general.planformat')) || 'STANDARD'}`,
    divider,
    ...table(['SCHEDULE','TIME','FLIGHT PLAN','VALUE'], [
      ['STD',flight.schedOut,'BLOCK',flight.blockTime], ['STA',flight.schedIn,'ETE',flight.ete],
      ['DISTANCE',`${flight.distance} NM`,'CRUISE',flight.cruiseAltitude], ['COST INDEX',String(flight.costIndex),'TAS / MACH',`${clean(dig(ofp,'general.cruise_tas')) || '-'} / ${clean(dig(ofp,'general.cruise_mach')) || '-'}`],
    ], [14,14,16,28]),
    '', kv('Dispatcher', clean(dig(ofp,'general.dx_name','general.dispatcher','params.dispatcher')) || '-'),
  ];

  const route = [
    ...table(['','ICAO / NAME','RUNWAY','PROCEDURE'], [
      ['DEP',`${flight.origin} ${flight.originName}`,flight.departureRunway || '-',sid || '-'],
      ['DEST',`${flight.destination} ${flight.destinationName}`,flight.arrivalRunway || '-',star || '-'],
      ['ALTN',alternates,'-','-'],
    ], [6,54,12,30]),
    '', 'ROUTE', ...wrap(flight.route || clean(dig(ofp,'general.route','atc.route')) || '-'),
  ];

  const aircraft = table(['ITEM','VALUE','ITEM','VALUE'], [[
    'Aircraft',`${flight.aircraft} / ${clean(dig(ofp,'aircraft.name')) || '-'}`,'Registration',flight.registration],
    ['Fleet / FIN',clean(dig(ofp,'aircraft.fin','aircraft.fleet_number')) || '-','SELCAL',getSelcal(ofp)],
    ['Engines',clean(dig(ofp,'aircraft.engines','aircraft.engine')) || '-','Equipment',clean(dig(ofp,'general.pbn','aircraft.equipment','atc.equipment')) || '-'],
  ], [18,34,18,34]);

  const fuel = table(['FUEL ITEM','PLANNED','FUEL ITEM','PLANNED'], [
    ['Ramp',num(dig(ofp,'fuel.plan_ramp'),` ${units}`),'Taxi',num(dig(ofp,'fuel.taxi'),` ${units}`)],
    ['Takeoff',num(dig(ofp,'fuel.plan_takeoff'),` ${units}`),'Trip',num(dig(ofp,'fuel.enroute_burn'),` ${units}`)],
    ['Contingency',num(dig(ofp,'fuel.contingency'),` ${units}`),'Alternate',num(dig(ofp,'fuel.alternate_burn'),` ${units}`)],
    ['Reserve',num(dig(ofp,'fuel.reserve'),` ${units}`),'Extra',num(dig(ofp,'fuel.extra'),` ${units}`)],
    ['Landing',num(dig(ofp,'fuel.plan_landing'),` ${units}`),'Total burn',num(dig(ofp,'general.total_burn','fuel.total_burn'),` ${units}`)],
  ], [18,23,18,23], [1,3]);

  const weights = table(['LOAD','ACTUAL / EST','LIMIT','MARGIN'], [
    ['Basic empty',num(dig(ofp,'weights.oew','weights.bow'),` ${units}`),'-','-'],
    ['Payload',num(dig(ofp,'weights.payload'),` ${units}`),'-','-'],
    ['Zero fuel',num(dig(ofp,'weights.est_zfw'),` ${units}`),num(dig(ofp,'weights.max_zfw'),` ${units}`),num(Number(dig(ofp,'weights.max_zfw'))-Number(dig(ofp,'weights.est_zfw')),` ${units}`)],
    ['Takeoff',num(dig(ofp,'weights.est_tow'),` ${units}`),num(dig(ofp,'weights.max_tow'),` ${units}`),num(Number(dig(ofp,'weights.max_tow'))-Number(dig(ofp,'weights.est_tow')),` ${units}`)],
    ['Landing',num(dig(ofp,'weights.est_ldw'),` ${units}`),num(dig(ofp,'weights.max_ldw'),` ${units}`),num(Number(dig(ofp,'weights.max_ldw'))-Number(dig(ofp,'weights.est_ldw')),` ${units}`)],
  ], [22,25,25,25], [1,2,3]);
  weights.push('', ...table(['LOAD DETAIL','COUNT','UNIT WT','TOTAL'], [
    ['Passengers',num(dig(ofp,'weights.pax_count')),num(dig(ofp,'weights.pax_weight'),` ${units}`),num(Number(dig(ofp,'weights.pax_count'))*Number(dig(ofp,'weights.pax_weight')),` ${units}`)],
    ['Bags',num(dig(ofp,'weights.bag_count')),num(dig(ofp,'weights.bag_weight'),` ${units}`),num(Number(dig(ofp,'weights.bag_count'))*Number(dig(ofp,'weights.bag_weight')),` ${units}`)],
    ['Cargo / freight','-','-',num(dig(ofp,'weights.cargo'),` ${units}`)],
  ], [26,16,24,28], [1,2,3]));

  const weather = [
    `${flight.origin} METAR`, ...wrap(originWx.metar || 'NOT AVAILABLE'), `${flight.origin} TAF`, ...wrap(originWx.taf || 'NOT AVAILABLE'), '',
    `${flight.destination} METAR`, ...wrap(destWx.metar || 'NOT AVAILABLE'), `${flight.destination} TAF`, ...wrap(destWx.taf || 'NOT AVAILABLE'),
  ];
  if (alternates !== 'NONE') weather.push('', `${alternates} METAR`, ...wrap(altWx.metar || 'NOT AVAILABLE'), `${alternates} TAF`, ...wrap(altWx.taf || 'NOT AVAILABLE'));

  const navRows = navlog.map((fix:AnyRecord, i) => [
    String(i+1), clean(dig(fix,'ident','name')), clean(dig(fix,'via_airway','via','airway')),
    num(dig(fix,'altitude_feet','altitude')), `${clean(dig(fix,'wind_dir')) || '-'}/${clean(dig(fix,'wind_spd')) || '-'}`,
    clean(dig(fix,'oat')) || '-', clean(dig(fix,'isa_dev','isa_deviation')) || '-',
    num(dig(fix,'fuel_leg')), num(dig(fix,'fuel_total')),
  ]);
  const nav = navRows.length ? table(['#','FIX','VIA','ALT','WIND','OAT','ISA','BURN','REMAIN'], navRows, [3,10,10,9,9,6,6,10,11], [0,3,5,6,7,8]) : ['NO NAVLOG DATA AVAILABLE'];

  const profile = profileRows(ofp);
  const operational = profile.length ? table(['FLIGHT PROFILE','VALUE'], profile, [34,55]) : ['NO ADDITIONAL FLIGHT PROFILE DATA.'];

  const atis = [...atisLines(ofp,'origin',flight.origin), ...atisLines(ofp,'destination',flight.destination)];
  const notams = [
    ...stationNotams(ofp,'origin',flight.origin), ...stationNotams(ofp,'destination',flight.destination),
    ...stationNotams(ofp,'alternate',alternates === 'NONE' ? 'ALTN' : alternates),
  ];
  if (!notams.length) notams.push('NO NOTAMS INCLUDED IN THE IMPORTED OFP.');

  const tlrRaw = clean(dig(ofp,'text.tlr'));
  const tlr = tlrRaw ? wrap(tlrRaw) : ['SEE RUNWAY ANALYSIS TAB FOR STRUCTURED TAKEOFF AND LANDING PERFORMANCE.'];
  const remarks = wrap(clean(dig(ofp,'general.dx_rmk','params.manualrmk','general.remarks','text.remarks')) || 'NO DISPATCHER REMARKS.');
  const atcLines = atc ? wrap(atc) : ['NO ICAO FLIGHT PLAN INCLUDED.'];

  const leaves = collectLeaves(ofp);
  const hidden = leaves.filter(l => /(?:url|html|xml|json|raw|source_id|account_id|date_created|date_modified|qcode|request_id|sequence_id|static_id|user_id)/i.test(l.path));
  const coverage: CoverageSummary = {
    totalLeaves: leaves.length,
    standardLeaves: leaves.length - hidden.length,
    appendixLeaves: 0,
    suppressedLeaves: hidden.length,
  };

  const sections: Section[] = [
    { title:'FLIGHT RELEASE', lines:overview }, { title:'ROUTE AND AIRPORTS', lines:route },
    { title:'AIRCRAFT AND EQUIPMENT', lines:aircraft }, { title:'FUEL PLAN', lines:fuel },
    { title:'WEIGHTS AND LOAD', lines:weights }, { title:'FLIGHT PROFILE', lines:operational },
    { title:'WEATHER', lines:weather }, ...(atis.length ? [{ title:'ATIS', lines:atis }] : []),
    { title:'NAVIGATION LOG', lines:nav }, { title:'ICAO FLIGHT PLAN', lines:atcLines },
    { title:'RUNWAY ANALYSIS / TLR', lines:tlr }, { title:'DISPATCH REMARKS', lines:remarks },
    { title:'NOTAMS', lines:notams },
  ];
  return { sections, coverage };
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g, ch => ({'→':'->','—':'-','–':'-','·':'/','°':' DEG ','’':"'",'“':'"','”':'"','−':'-'} as Record<string,string>)[ch] ?? '?');
}

function makePdf(pages: string[][], title: string): Uint8Array {
  const objects:string[]=[]; const add=(body:string)=>{objects.push(body);return objects.length;};
  const catalogId=add(''), pagesId=add(''), fontId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'), boldId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const pageIds:number[]=[];
  pages.forEach(lines=>{
    const commands=['BT',`/F1 ${FONT_SIZE} Tf`,`${LEADING} TL`,`${MARGIN_X} ${PAGE_H-MARGIN_TOP} Td`];
    lines.forEach((line,i)=>{ const bold=/^(?:AEROSLATE|FLIGHT RELEASE|ROUTE AND|AIRCRAFT AND|FUEL PLAN|WEIGHTS AND|FLIGHT PROFILE|WEATHER|ATIS|NAVIGATION LOG|NOTAMS|ICAO FLIGHT PLAN|RUNWAY ANALYSIS|DISPATCH REMARKS|PAGE \d)/.test(line); commands.push(`${bold?'/F2':'/F1'} ${FONT_SIZE} Tf`,`(${escapePdfText(line)}) Tj`); if(i<lines.length-1) commands.push('T*'); });
    commands.push('ET'); const stream=commands.join('\n'); const contentId=add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R /PageMode /UseNone >>`;
  objects[pagesId-1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf='%PDF-1.4\n% AeroSlate OFP\n'; const offsets=[0];
  objects.forEach((body,i)=>{offsets[i+1]=pdf.length;pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objects.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R /Info << /Title (${escapePdfText(title)}) /Producer (AeroSlate EFB) >> >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function buildOFPpdf(ofp: AnyRecord, flight: FlightSummary): PdfBuildResult {
  const seed=hash(`${flight.airline}${flight.flightNumber}-${flight.origin}-${flight.destination}-${flight.flightDate}-${flight.release}`);
  const style=seed%4; const styleNames=['Classic Telex','Dispatch Release','Air Operations','Crew Briefing'];
  const {sections,coverage}=buildSections(ofp,flight,style);
  const generatedAt=new Date().toISOString().replace('T',' ').slice(0,19)+'Z';
  const header=`${flight.airline}${flight.flightNumber}  ${flight.origin}-${flight.destination}  REL ${flight.release}  ${generatedAt}`;
  const footerBase=`${flight.airline}${flight.flightNumber} ${flight.origin}-${flight.destination}`;
  const maxBody=Math.floor((PAGE_H-MARGIN_TOP-MARGIN_BOTTOM)/LEADING)-7;
  const pages:string[][]=[]; let current:string[]=[];
  const flush=()=>{ if(current.length){pages.push(current);current=[];} };
  sections.forEach(section=>{
    const block=[section.title,'-'.repeat(Math.min(MAX_COLS,Math.max(28,section.title.length+8))),...section.lines,''];
    if(current.length && current.length+Math.min(block.length,18)>maxBody) flush();
    block.forEach(line=>{ if(current.length>=maxBody) flush(); current.push(line); });
  });
  flush();
  const rendered=pages.map((body,i)=>[header,'-'.repeat(MAX_COLS),...body,`${footerBase.padEnd(91)} PAGE ${i+1} OF ${pages.length}`]);
  return { bytes:makePdf(rendered,`${flight.airline}${flight.flightNumber} ${flight.origin}-${flight.destination} OFP`), filename:`${flight.airline}${flight.flightNumber}_${flight.origin}-${flight.destination}_OFP.pdf`, styleName:styleNames[style], coverage };
}
