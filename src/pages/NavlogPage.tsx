import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ArrowUpDown, ArrowUpRight, Check, Clock3, Route } from 'lucide-react';
import { duration, getNavlog, numberText, weight, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

interface ActualRow { crossed: string; altitude: string; fuel: string; remarks: string; complete: boolean; }
type ActiveRows = Record<string, ActualRow>;

function field(fix: AnyRecord, ...keys: string[]): any {
  for (const key of keys) if (fix?.[key] !== undefined && fix?.[key] !== null && fix?.[key] !== '') return fix[key];
  return undefined;
}
function numeric(fix: AnyRecord, ...keys: string[]): number {
  const value = Number(field(fix, ...keys));
  return Number.isFinite(value) ? value : 0;
}
function coordinates(fix: AnyRecord) {
  const lat = Number(field(fix, 'pos_lat', 'latitude', 'lat'));
  const lon = Number(field(fix, 'pos_long', 'longitude', 'lon'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : '—';
}
function course(fix: AnyRecord) {
  const value = Number(field(fix, 'course', 'track_mag', 'mag_course', 'heading'));
  return Number.isFinite(value) ? `${String(Math.round(value)).padStart(3, '0')}°` : '—';
}
function isaTemperature(altitudeFeet: number): number {
  if (!Number.isFinite(altitudeFeet)) return NaN;
  return altitudeFeet <= 36089 ? 15 - (1.98 * altitudeFeet / 1000) : -56.5;
}
function NavWeather({ fix }: { fix: AnyRecord }) {
  const direction = Number(field(fix, 'wind_dir', 'wind_direction'));
  const speed = Number(field(fix, 'wind_spd', 'wind_speed'));
  const oat = Number(field(fix, 'oat', 'temperature'));
  const providedIsa = Number(field(fix, 'isa_dev', 'isa_deviation', 'isa'));
  const altitude = Number(field(fix, 'altitude_feet', 'altitude', 'alt'));
  const calculatedIsa = Number.isFinite(oat) && Number.isFinite(altitude) ? oat - isaTemperature(altitude) : NaN;
  const isa = Number.isFinite(providedIsa) ? providedIsa : calculatedIsa;
  const fmt = (value: number) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${Math.round(value)}°C` : '—';
  return <div className="navlog-weather-stack">
    <strong>{Number.isFinite(direction) ? String(Math.round(direction)).padStart(3, '0') : '—'}/{Number.isFinite(speed) ? String(Math.round(speed)).padStart(2, '0') : '—'}</strong>
    <span>OAT {fmt(oat)}</span>
    <span className="isa-dev">ISA {fmt(isa)}</span>
  </div>;
}

function SpeedStack({ fix }: { fix: AnyRecord }) {
  const tas = field(fix, 'tas', 'true_airspeed');
  const gs = field(fix, 'groundspeed', 'ground_speed');
  const mach = field(fix, 'mach');
  return <div className="navlog-stack speeds"><span><small>TAS</small>{tas || '—'}</span><span><small>GS</small>{gs || '—'}</span><span><small>M</small>{mach || '—'}</span></div>;
}
function nowZulu() { return `${new Date().toISOString().slice(11, 16)}z`; }
function signed(value: number, units: string) { return `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString()} ${units}`; }

function clockMinutes(value: string): number | null {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return Number.isFinite(hours + minutes) ? ((hours * 60 + minutes) % 1440) : null;
}
function addClock(base: string, deltaMinutes: number): string {
  const start = clockMinutes(base); if (start === null) return '—';
  const total = ((start + Math.round(deltaMinutes)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}z`;
}
function durationMinutes(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (/^\d+:\d{2}$/.test(raw)) { const [h, m] = raw.split(':').map(Number); return h * 60 + m; }
  const number = Number(raw); if (!Number.isFinite(number)) return 0;
  return number > 1000 ? number / 60 : number > 20 ? number / 60 : number * 60;
}

export function NavlogPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const rawFixes = getNavlog(ofp);
  const [active, setActive] = useState(false);
  const [scrollAxis, setScrollAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const changeAxis = (next: 'vertical' | 'horizontal') => {
    const node = scrollRef.current; const top = node?.scrollTop || 0; const left = node?.scrollLeft || 0;
    setScrollAxis(next);
    window.requestAnimationFrame(() => { if (scrollRef.current) { scrollRef.current.scrollTop = top; scrollRef.current.scrollLeft = left; } });
  };
  const key = `aeroslate.active-navlog.${flight.release}.${flight.origin}${flight.destination}`;
  const [rows, setRows] = useState<ActiveRows>(() => loadLocal(key, {}));
  useEffect(() => setRows(loadLocal(key, {})), [key]);
  useEffect(() => saveLocal(key, rows), [key, rows]);
  const rowKey = (fix: AnyRecord, index: number) => `${String(fix.ident || fix.name || 'FIX')}-${index}`;
  const update = (id: string, patch: Partial<ActualRow>) => setRows(current => ({ ...current, [id]: { ...(current[id] || { crossed: '', altitude: '', fuel: '', remarks: '', complete: false }), ...patch } }));

  const fixes = useMemo(() => {
    const explicitTotals = rawFixes.map(fix => Number(field(fix, 'fuel_total', 'fuel_remaining'))).filter(Number.isFinite);
    const firstLeg = rawFixes.length ? numeric(rawFixes[0], 'fuel_leg') : 0;
    let remaining = weight(ofp, 'fuel.plan_takeoff') || weight(ofp, 'fuel.plan_ramp') || ((explicitTotals[0] || 0) + firstLeg);
    let elapsedMinutes = 0;
    return rawFixes.map((fix, index) => {
      const legFuel = numeric(fix, 'fuel_leg');
      if (index === 0 && remaining <= 0) remaining = Number(field(fix, 'fuel_total')) + legFuel || 0;
      remaining = Math.max(0, remaining - legFuel);
      elapsedMinutes += durationMinutes(field(fix, 'time_leg'));
      return { fix, index, legFuel, plannedRemaining: remaining, plannedElapsedMinutes: elapsedMinutes, plannedEta: addClock(flight.schedOut, elapsedMinutes) };
    });
  }, [rawFixes, ofp]);

  const completed = useMemo(() => Object.values(rows).filter(row => row.complete).length, [rows]);
  const latestTrend = useMemo(() => fixes.map(({ fix, index, plannedRemaining }) => {
    const actual = Number(rows[rowKey(fix, index)]?.fuel || 0);
    return actual > 0 && plannedRemaining > 0 ? { ident: String(fix.ident || `FIX ${index + 1}`), actual, planned: plannedRemaining, variance: actual - plannedRemaining } : null;
  }).filter((item): item is { ident: string; actual: number; planned: number; variance: number } => Boolean(item)).at(-1) || null, [fixes, rows]);

  const activeReference = useMemo(() => {
    for (let i = fixes.length - 1; i >= 0; i -= 1) {
      const entered = rows[rowKey(fixes[i].fix, fixes[i].index)]?.crossed;
      const minute = clockMinutes(entered || '');
      if (minute !== null) return { minute, elapsed: fixes[i].plannedElapsedMinutes };
    }
    return null;
  }, [fixes, rows]);
  const displayAta = (plannedElapsed: number, entered: string) => entered || (activeReference ? addClock(`${String(Math.floor(activeReference.minute / 60)).padStart(2, '0')}:${String(activeReference.minute % 60).padStart(2, '0')}z`, plannedElapsed - activeReference.elapsed) : '—');

  return <section className="card navlog-card">
    <header><div><Route size={18} /><h3>{flight.origin}–{flight.destination} navlog</h3></div><div className="header-actions"><span className="pill blue">{fixes.length} fixes</span><div className="segmented compact-axis" data-axis={scrollAxis} role="group" aria-label="Navlog scroll direction"><button className={scrollAxis === 'vertical' ? 'active' : ''} aria-pressed={scrollAxis === 'vertical'} title="Scroll rows vertically" onClick={() => changeAxis('vertical')}><ArrowUpDown size={14}/><span>Rows</span></button><button className={scrollAxis === 'horizontal' ? 'active' : ''} aria-pressed={scrollAxis === 'horizontal'} title="Pan columns horizontally" onClick={() => changeAxis('horizontal')}><ArrowLeftRight size={14}/><span>Columns</span></button></div><button className={active ? 'active' : ''} onClick={() => setActive(value => !value)}><Clock3 size={15} /> {active ? 'Active navlog on' : 'Use active navlog'}</button></div></header>
    <div className="card-body compact-card-body">
      {active && <div className="active-navlog-banner"><div><strong>Active navlog</strong><span>Record actual crossing, altitude, fuel and remarks. Fuel variance is compared with the planned remaining fuel at each fix.</span></div><span>{completed}/{fixes.length} complete</span></div>}
      {active && latestTrend && <div className={`navlog-fuel-trend ${latestTrend.variance < 0 ? 'behind' : 'ahead'}`}><div>{latestTrend.variance < 0 ? <AlertTriangle size={19} /> : <ArrowUpRight size={19} />}<span><strong>Latest fuel trend · {latestTrend.ident}</strong><small>Actual {Math.round(latestTrend.actual).toLocaleString()} · planned {Math.round(latestTrend.planned).toLocaleString()} {flight.units}</small></span></div><strong>{signed(latestTrend.variance, flight.units)}</strong></div>}
      <div ref={scrollRef} className={`table-scroll navlog-scroll axis-${scrollAxis}`}><table className={`navlog-table rich-navlog ${active ? 'active-mode' : ''}`}><thead><tr>
        <th>#</th><th>Fix</th><th>Via</th><th>CRS</th><th>Dist</th><th>ALT</th><th>SPD</th><th>Wind & temp</th><th>LEG / ETA</th><th>Fuel</th>
        {active && <th>ATA / ALT / FUEL / REMARKS</th>}
      </tr></thead><tbody>
        {fixes.map(({ fix, index, legFuel, plannedRemaining, plannedElapsedMinutes, plannedEta }) => {
          const id = rowKey(fix, index); const actual = rows[id] || { crossed: '', altitude: '', fuel: '', remarks: '', complete: false };
          const legDistance = field(fix, 'distance', 'distance_leg', 'dist_leg');
          const remainingDistance = field(fix, 'distance_total', 'dist_total', 'distance_remaining');
          const actualFuel = Number(actual.fuel || 0); const variance = actualFuel > 0 && plannedRemaining > 0 ? actualFuel - plannedRemaining : null;
          return <tr key={id} className={actual.complete ? 'navlog-complete' : ''}>
            <td>{index + 1}</td>
            <td><strong>{fix.ident || '—'}</strong><small>{fix.name || coordinates(fix)}</small><small>{fix.name ? coordinates(fix) : ''}</small></td>
            <td>{fix.via_airway || fix.via || 'DCT'}</td><td>{course(fix)}</td>
            <td>{numberText(legDistance, ' NM', 1)}<small>{remainingDistance !== undefined ? `${numberText(remainingDistance, ' NM', 1)} remain` : ''}</small></td>
            <td>{numberText(field(fix, 'altitude_feet', 'altitude'), ' ft')}</td><td><SpeedStack fix={fix} /></td>
            <td><NavWeather fix={fix} /></td>
            <td>{duration(field(fix, 'time_leg'))}<small>ETA {plannedEta}</small>{active && <small className="active-eta">ATA {displayAta(plannedElapsedMinutes, actual.crossed)}</small>}</td>
            <td className="fuel-plan-cell"><strong>{numberText(legFuel, '', 0)}</strong><small>{plannedRemaining > 0 ? `${Math.round(plannedRemaining).toLocaleString()} remain` : '— remain'}</small>{variance !== null && <small className={variance < 0 ? 'fuel-variance negative' : 'fuel-variance positive'}>{signed(variance, flight.units)}</small>}</td>
            {active && <td><div className="active-checkpoint-line"><input className="ata-input" value={actual.crossed} placeholder={displayAta(plannedElapsedMinutes, '') === '—' ? 'ATA' : displayAta(plannedElapsedMinutes, '')} onChange={event => update(id, { crossed: event.target.value })} /><button className="now-mini" title="Use current UTC" onClick={() => update(id, { crossed: nowZulu() })}>NOW</button><input className="alt-input" inputMode="numeric" value={actual.altitude} placeholder="ALT" onChange={event => update(id, { altitude: event.target.value })} /><input className="fuel-input" inputMode="decimal" value={actual.fuel} placeholder="FUEL" aria-label="Actual fuel" onChange={event => update(id, { fuel: event.target.value })} /><input className="remark-input" value={actual.remarks} placeholder="Remarks" onChange={event => update(id, { remarks: event.target.value })} /><button className={`complete-button ${actual.complete ? 'done' : ''}`} title="Mark complete" onClick={() => update(id, { complete: !actual.complete })}><Check size={15} /></button></div></td>}
          </tr>;
        })}
        {!fixes.length && <tr><td colSpan={active ? 11 : 10} className="empty-cell">No detailed navlog was included. Generate the SimBrief OFP with Detailed Navlog enabled.</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}
