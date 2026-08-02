import { useEffect, useMemo, useState } from 'react';
import { Activity, Fuel, Gauge, HelpCircle, RefreshCw } from 'lucide-react';
import { dig, weight, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';
import { minutesBetweenZulu, oooiStorageKey, useOOOITimes } from '../lib/flightTimes';
import { useSimTelemetry } from './SimPage';

function durationMinutes(value: string) {
  const match = String(value || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
function format(value: number, units: string) { return Number.isFinite(value) && value > 0 ? `${Math.round(value).toLocaleString()} ${units}` : '—'; }

export function FuelPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const key = `aeroslate.fuel.${flight.release}.${flight.origin}${flight.destination}`;
  const [actual, setActual] = useState(() => loadLocal(key, { ramp: '', takeoff: '', current: '', manualElapsed: '' }));
  useEffect(() => setActual(loadLocal(key, { ramp: '', takeoff: '', current: '', manualElapsed: '' })), [key]);
  useEffect(() => saveLocal(key, actual), [key, actual]);
  const { telemetry, linked } = useSimTelemetry();
  const { times } = useOOOITimes(oooiStorageKey(flight.release, flight.origin, flight.destination));
  const now = telemetry?.simZulu || `${new Date().toISOString().slice(11, 16)}z`;
  const autoElapsed = times.off ? minutesBetweenZulu(times.off, now) : null;
  const elapsed = autoElapsed !== null ? ((autoElapsed > 720 ? autoElapsed - 1440 : autoElapsed) || 0) : Number(actual.manualElapsed || 0);

  const plan = useMemo(() => ({
    taxi: weight(ofp, 'fuel.taxi'), trip: weight(ofp, 'fuel.enroute_burn'), contingency: weight(ofp, 'fuel.contingency'),
    alternate: weight(ofp, 'fuel.alternate_burn'), reserve: weight(ofp, 'fuel.reserve'), etops: weight(ofp, 'fuel.etops'), extra: weight(ofp, 'fuel.extra'),
    ramp: weight(ofp, 'fuel.plan_ramp'), takeoff: weight(ofp, 'fuel.plan_takeoff'), landing: weight(ofp, 'fuel.plan_landing'),
    minimumTakeoff: weight(ofp, 'fuel.min_takeoff'), maxTanks: weight(ofp, 'fuel.max_tanks')
  }), [ofp]);
  const eteMinutes = durationMinutes(flight.ete);
  const ofpFlow = weight(ofp, 'fuel.avg_fuel_flow');
  const calculatedFlow = eteMinutes > 0 && plan.trip > 0 ? plan.trip / (eteMinutes / 60) : 0;
  const flow = ofpFlow || calculatedFlow;
  const startFuel = Number(actual.takeoff || actual.ramp || 0);
  const currentFuel = Number(actual.current || 0);
  const expectedNow = startFuel > 0 && flow > 0 ? Math.max(0, startFuel - flow * Math.max(0, elapsed) / 60) : 0;
  const variance = currentFuel > 0 && expectedNow > 0 ? currentFuel - expectedNow : 0;
  const remainingMinutes = Math.max(0, eteMinutes - Math.max(0, elapsed));
  const predictedLanding = currentFuel > 0 && flow > 0 ? Math.max(0, currentFuel - flow * remainingMinutes / 60) : 0;
  const simFuel = flight.units === 'KGS' ? telemetry?.totalFuelKg : telemetry?.totalFuelLb;

  return <div className="fuel-page">
    <section className="card fuel-overview"><header><div><Fuel size={18} /><h3>SimBrief fuel plan</h3></div><span className="pill blue">OFP source</span></header><div className="card-body">
      <div className="fuel-journey"><div><span>Ramp</span><strong>{format(plan.ramp, flight.units)}</strong></div><i>− {format(plan.taxi, flight.units)}</i><div><span>Takeoff</span><strong>{format(plan.takeoff, flight.units)}</strong></div><i>− {format(plan.trip, flight.units)}</i><div><span>Landing</span><strong>{format(plan.landing, flight.units)}</strong></div></div>
      <div className="fuel-breakdown">{[['Contingency', plan.contingency], ['Alternate', plan.alternate], ['Final reserve', plan.reserve], ['ETOPS', plan.etops], ['Extra', plan.extra]].filter(([, value]) => Number(value) > 0).map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{format(Number(value), flight.units)}</strong></div>)}</div>
    </div></section>

    <div className="content-grid two fuel-monitor-grid">
      <section className="card"><header><div><Activity size={18} /><h3>Actual fuel checkpoint</h3></div>{linked && simFuel !== undefined && <button onClick={() => setActual(current => ({ ...current, current: String(Math.round(Number(simFuel))) }))}><RefreshCw size={15} /> Use simulator fuel</button>}</header><div className="card-body">
        <div className="form-grid two"><label><span>Actual ramp fuel</span><input inputMode="decimal" value={actual.ramp} onChange={event => setActual({ ...actual, ramp: event.target.value })} placeholder={String(plan.ramp || '')} /></label><label><span>Actual takeoff fuel</span><input inputMode="decimal" value={actual.takeoff} onChange={event => setActual({ ...actual, takeoff: event.target.value })} placeholder={String(plan.takeoff || '')} /></label><label><span>Fuel remaining now</span><input inputMode="decimal" value={actual.current} onChange={event => setActual({ ...actual, current: event.target.value })} /></label><label><span>Elapsed airborne minutes</span><input inputMode="numeric" value={autoElapsed !== null ? String(Math.max(0, elapsed)) : actual.manualElapsed} readOnly={autoElapsed !== null} onChange={event => setActual({ ...actual, manualElapsed: event.target.value })} /><small>{autoElapsed !== null ? 'Calculated from OFF and simulator/device Zulu' : 'Enter manually until OFF is recorded'}</small></label></div>
      </div></section>
      <section className="card"><header><div><Gauge size={18} /><h3>Fuel trend</h3></div></header><div className="card-body"><div className="fuel-trend-metrics"><div><span>Expected now</span><strong>{format(expectedNow, flight.units)}</strong></div><div className={variance < -300 ? 'bad' : variance < 0 ? 'warn' : variance > 0 ? 'good' : ''}><span>Actual vs plan</span><strong>{variance ? `${variance > 0 ? '+' : ''}${Math.round(variance).toLocaleString()} ${flight.units}` : '—'}</strong></div><div><span>Projected landing</span><strong>{format(predictedLanding, flight.units)}</strong></div><div><span>Planning flow</span><strong>{format(flow, `${flight.units}/HR`)}</strong></div></div></div></section>
    </div>

    <section className="card fuel-explanation"><header><div><HelpCircle size={18} /><h3>What the monitor is doing</h3></div></header><div className="card-body"><p>It compares the fuel actually remaining with the SimBrief burn profile at the current elapsed flight time. A negative variance means you have less fuel than the simple plan trend predicts. Projected landing fuel continues that trend to the planned ETE.</p><div className="source-values"><span>Minimum takeoff: <strong>{format(plan.minimumTakeoff, flight.units)}</strong></span><span>Tank capacity: <strong>{format(plan.maxTanks, flight.units)}</strong></span><span>Flow source: <strong>{ofpFlow ? 'SimBrief OFP average flow' : calculatedFlow ? 'Trip fuel ÷ ETE' : 'Unavailable'}</strong></span></div><p className="disclaimer">This is a simulator planning comparison, not an aircraft-certified fuel prediction. All limits shown come from the imported OFP; AeroSlate does not insert aircraft limits.</p></div></section>
  </div>;
}
