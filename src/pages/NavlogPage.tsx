import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Clock3, Fuel, Route } from 'lucide-react';
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
function SpeedStack({ fix }: { fix: AnyRecord }) {
  const tas = field(fix, 'tas', 'true_airspeed');
  const gs = field(fix, 'groundspeed', 'ground_speed');
  const mach = field(fix, 'mach');
  return <div className="navlog-stack speeds"><span><small>TAS</small>{tas || '—'}</span><span><small>GS</small>{gs || '—'}</span><span><small>M</small>{mach || '—'}</span></div>;
}
function nowZulu() { return `${new Date().toISOString().slice(11, 16)}z`; }
function signed(value: number, units: string) { return `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString()} ${units}`; }

export function NavlogPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const rawFixes = getNavlog(ofp);
  const [active, setActive] = useState(false);
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
    return rawFixes.map((fix, index) => {
      const legFuel = numeric(fix, 'fuel_leg');
      if (index === 0 && remaining <= 0) remaining = Number(field(fix, 'fuel_total')) + legFuel || 0;
      remaining = Math.max(0, remaining - legFuel);
      return { fix, index, legFuel, plannedRemaining: remaining };
    });
  }, [rawFixes, ofp]);

  const completed = useMemo(() => Object.values(rows).filter(row => row.complete).length, [rows]);
  const latestTrend = useMemo(() => fixes.map(({ fix, index, plannedRemaining }) => {
    const actual = Number(rows[rowKey(fix, index)]?.fuel || 0);
    return actual > 0 && plannedRemaining > 0 ? { ident: String(fix.ident || `FIX ${index + 1}`), actual, planned: plannedRemaining, variance: actual - plannedRemaining } : null;
  }).filter((item): item is { ident: string; actual: number; planned: number; variance: number } => Boolean(item)).at(-1) || null, [fixes, rows]);

  return <section className="card navlog-card">
    <header><div><Route size={18} /><h3>{flight.origin}–{flight.destination} navlog</h3></div><div className="header-actions"><span className="pill blue">{fixes.length} fixes</span><button className={active ? 'active' : ''} onClick={() => setActive(value => !value)}><Clock3 size={15} /> {active ? 'Active navlog on' : 'Use active navlog'}</button></div></header>
    <div className="card-body compact-card-body">
      {active && <div className="active-navlog-banner"><div><strong>Active navlog</strong><span>Record actual crossing, altitude, fuel and remarks. Fuel variance is compared with the planned remaining fuel at each fix.</span></div><span>{completed}/{fixes.length} complete</span></div>}
      {active && latestTrend && <div className={`navlog-fuel-trend ${latestTrend.variance < 0 ? 'behind' : 'ahead'}`}><div>{latestTrend.variance < 0 ? <AlertTriangle size={19} /> : <ArrowUpRight size={19} />}<span><strong>Latest fuel trend · {latestTrend.ident}</strong><small>Actual {Math.round(latestTrend.actual).toLocaleString()} · planned {Math.round(latestTrend.planned).toLocaleString()} {flight.units}</small></span></div><strong>{signed(latestTrend.variance, flight.units)}</strong></div>}
      <div className="table-scroll navlog-scroll"><table className={`navlog-table rich-navlog ${active ? 'active-mode' : ''}`}><thead><tr>
        <th>#</th><th>Fix / position</th><th>Via</th><th>CRS</th><th>Distance</th><th>Altitude</th><th>Speeds</th><th>Wind / OAT</th><th>Time</th><th>Fuel</th>
        {active && <><th>Actual checkpoint</th><th>Remarks</th><th>Done</th></>}
      </tr></thead><tbody>
        {fixes.map(({ fix, index, legFuel, plannedRemaining }) => {
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
            <td>{fix.wind_dir ? `${String(fix.wind_dir).padStart(3, '0')}/${fix.wind_spd || 0}` : '—'}<small>{field(fix, 'oat') !== undefined ? `${field(fix, 'oat')}°C` : ''}</small></td>
            <td>{duration(field(fix, 'time_leg'))}<small>{field(fix, 'time_total') !== undefined ? duration(field(fix, 'time_total')) : ''}</small></td>
            <td className="fuel-plan-cell"><strong>{numberText(legFuel, '', 0)}</strong><small>{plannedRemaining > 0 ? `${Math.round(plannedRemaining).toLocaleString()} remain` : '— remain'}</small></td>
            {active && <><td><div className="active-checkpoint-grid"><div className="inline-entry"><input value={actual.crossed} placeholder="HH:MMz" onChange={event => update(id, { crossed: event.target.value })} /><button title="Use current UTC" onClick={() => update(id, { crossed: nowZulu() })}>NOW</button></div><input inputMode="numeric" value={actual.altitude} placeholder="Actual alt" onChange={event => update(id, { altitude: event.target.value })} /><label className="actual-fuel-input"><Fuel size={13} /><input inputMode="decimal" value={actual.fuel} placeholder={`Fuel ${flight.units}`} onChange={event => update(id, { fuel: event.target.value })} /></label>{variance !== null && <small className={variance < 0 ? 'fuel-variance negative' : 'fuel-variance positive'}>{signed(variance, flight.units)} vs plan</small>}</div></td><td><input value={actual.remarks} placeholder="Notes" onChange={event => update(id, { remarks: event.target.value })} /></td><td><button className={`complete-button ${actual.complete ? 'done' : ''}`} onClick={() => update(id, { complete: !actual.complete })}><Check size={15} /></button></td></>}
          </tr>;
        })}
        {!fixes.length && <tr><td colSpan={active ? 13 : 10} className="empty-cell">No detailed navlog was included. Generate the SimBrief OFP with Detailed Navlog enabled.</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}
