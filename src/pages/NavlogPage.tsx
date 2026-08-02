import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Route } from 'lucide-react';
import { duration, getNavlog, numberText, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

interface ActualRow { crossed: string; altitude: string; fuel: string; remarks: string; complete: boolean; }
type ActiveRows = Record<string, ActualRow>;

function field(fix: AnyRecord, ...keys: string[]): any {
  for (const key of keys) if (fix?.[key] !== undefined && fix?.[key] !== null && fix?.[key] !== '') return fix[key];
  return undefined;
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
function speed(fix: AnyRecord) {
  const tas = field(fix, 'tas', 'true_airspeed');
  const gs = field(fix, 'groundspeed', 'ground_speed');
  const mach = field(fix, 'mach');
  return [tas ? `TAS ${tas}` : '', gs ? `GS ${gs}` : '', mach ? `M ${mach}` : ''].filter(Boolean).join(' · ') || '—';
}
function nowZulu() { return `${new Date().toISOString().slice(11, 16)}z`; }

export function NavlogPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const fixes = getNavlog(ofp);
  const [active, setActive] = useState(false);
  const key = `aeroslate.active-navlog.${flight.release}.${flight.origin}${flight.destination}`;
  const [rows, setRows] = useState<ActiveRows>(() => loadLocal(key, {}));
  useEffect(() => setRows(loadLocal(key, {})), [key]);
  useEffect(() => saveLocal(key, rows), [key, rows]);
  const completed = useMemo(() => Object.values(rows).filter(row => row.complete).length, [rows]);
  const rowKey = (fix: AnyRecord, index: number) => `${String(fix.ident || fix.name || 'FIX')}-${index}`;
  const update = (id: string, patch: Partial<ActualRow>) => setRows(current => ({ ...current, [id]: { ...(current[id] || { crossed: '', altitude: '', fuel: '', remarks: '', complete: false }), ...patch } }));

  return <section className="card navlog-card">
    <header><div><Route size={18} /><h3>{flight.origin}–{flight.destination} navlog</h3></div><div className="header-actions"><span className="pill blue">{fixes.length} fixes</span><button className={active ? 'active' : ''} onClick={() => setActive(value => !value)}><Clock3 size={15} /> {active ? 'Active navlog on' : 'Use active navlog'}</button></div></header>
    <div className="card-body compact-card-body">
      {active && <div className="active-navlog-banner"><div><strong>Active navlog</strong><span>Enter actual crossing time, altitude, fuel and remarks. Entries stay with this flight on this device.</span></div><span>{completed}/{fixes.length} complete</span></div>}
      <div className="table-scroll navlog-scroll"><table className="navlog-table rich-navlog"><thead><tr>
        <th>#</th><th>Fix / coordinates</th><th>Via</th><th>Course</th><th>Leg / remaining</th><th>Altitude</th><th>Speed</th><th>Wind / OAT</th><th>Time leg / total</th><th>Fuel leg / remaining</th>
        {active && <><th>Actual crossing</th><th>Actual alt</th><th>Actual fuel</th><th>Remarks</th><th>Done</th></>}
      </tr></thead><tbody>
        {fixes.map((fix, index) => {
          const id = rowKey(fix, index); const actual = rows[id] || { crossed: '', altitude: '', fuel: '', remarks: '', complete: false };
          const legDistance = field(fix, 'distance', 'distance_leg', 'dist_leg');
          const remainingDistance = field(fix, 'distance_total', 'dist_total', 'distance_remaining');
          return <tr key={id} className={actual.complete ? 'navlog-complete' : ''}>
            <td>{index + 1}</td>
            <td><strong>{fix.ident || '—'}</strong><small>{fix.name || coordinates(fix)}</small><small>{fix.name ? coordinates(fix) : ''}</small></td>
            <td>{fix.via_airway || fix.via || 'DCT'}</td><td>{course(fix)}</td>
            <td>{numberText(legDistance, ' NM', 1)}<small>{remainingDistance !== undefined ? `${numberText(remainingDistance, ' NM', 1)} remain` : ''}</small></td>
            <td>{numberText(field(fix, 'altitude_feet', 'altitude'), ' ft')}</td><td>{speed(fix)}</td>
            <td>{fix.wind_dir ? `${String(fix.wind_dir).padStart(3, '0')}/${fix.wind_spd || 0}` : '—'}<small>{field(fix, 'oat') !== undefined ? `${field(fix, 'oat')}°C` : ''}</small></td>
            <td>{duration(field(fix, 'time_leg'))}<small>{field(fix, 'time_total') !== undefined ? duration(field(fix, 'time_total')) : ''}</small></td>
            <td>{numberText(field(fix, 'fuel_leg'), '', 0)}<small>{field(fix, 'fuel_total') !== undefined ? `${numberText(field(fix, 'fuel_total'))} remain` : ''}</small></td>
            {active && <><td><div className="inline-entry"><input value={actual.crossed} placeholder="HH:MMz" onChange={event => update(id, { crossed: event.target.value })} /><button title="Use current UTC" onClick={() => update(id, { crossed: nowZulu() })}>NOW</button></div></td><td><input inputMode="numeric" value={actual.altitude} placeholder="ft" onChange={event => update(id, { altitude: event.target.value })} /></td><td><input inputMode="decimal" value={actual.fuel} placeholder={flight.units} onChange={event => update(id, { fuel: event.target.value })} /></td><td><input value={actual.remarks} placeholder="Notes" onChange={event => update(id, { remarks: event.target.value })} /></td><td><button className={`complete-button ${actual.complete ? 'done' : ''}`} onClick={() => update(id, { complete: !actual.complete })}><Check size={15} /></button></td></>}
          </tr>;
        })}
        {!fixes.length && <tr><td colSpan={active ? 15 : 10} className="empty-cell">No detailed navlog was included. Generate the SimBrief OFP with Detailed Navlog enabled.</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}
