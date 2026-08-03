import { useEffect, useMemo, useState } from 'react';
import { Activity, Fuel, Gauge, HelpCircle, RefreshCw } from 'lucide-react';
import { weight, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';
import { minutesBetweenZulu, oooiStorageKey, useOOOITimes } from '../lib/flightTimes';
import { useSimTelemetry } from './SimPage';

interface FuelActual { ramp: string; takeoff: string; current: string; manualHours: string; manualMinutes: string; }
function durationMinutes(value: string) {
  const match = String(value || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
function format(value: number, units: string) { return Number.isFinite(value) && value > 0 ? `${Math.round(value).toLocaleString()} ${units}` : '—'; }
function initialActual(key: string): FuelActual {
  const stored = loadLocal<Record<string, string>>(key, {});
  const priorMinutes = Number(stored.manualElapsed || 0);
  return {
    ramp: stored.ramp || '', takeoff: stored.takeoff || '', current: stored.current || '',
    manualHours: stored.manualHours ?? (priorMinutes ? String(Math.floor(priorMinutes / 60)) : ''),
    manualMinutes: stored.manualMinutes ?? (priorMinutes ? String(priorMinutes % 60) : '')
  };
}

export function FuelPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const key = `aeroslate.fuel.${flight.release}.${flight.origin}${flight.destination}`;
  const [actual, setActual] = useState<FuelActual>(() => initialActual(key));
  useEffect(() => setActual(initialActual(key)), [key]);
  useEffect(() => saveLocal(key, actual), [key, actual]);
  const { telemetry, linked } = useSimTelemetry();
  const { times } = useOOOITimes(oooiStorageKey(flight.release, flight.origin, flight.destination));
  const now = telemetry?.simZulu || `${new Date().toISOString().slice(11, 16)}z`;
  const autoElapsedRaw = times.off ? minutesBetweenZulu(times.off, now) : null;
  const autoElapsed = autoElapsedRaw === null ? null : Math.max(0, autoElapsedRaw > 720 ? autoElapsedRaw - 1440 : autoElapsedRaw);
  const manualElapsed = Math.max(0, Number(actual.manualHours || 0) * 60 + Math.min(59, Number(actual.manualMinutes || 0)));
  const elapsed = autoElapsed ?? manualElapsed;
  const elapsedHours = Math.floor(elapsed / 60); const elapsedMinutes = elapsed % 60;

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
  const expectedNow = startFuel > 0 && flow > 0 ? Math.max(0, startFuel - flow * elapsed / 60) : 0;
  const variance = currentFuel > 0 && expectedNow > 0 ? currentFuel - expectedNow : 0;
  const remainingMinutes = Math.max(0, eteMinutes - elapsed);
  const predictedLanding = currentFuel > 0 && flow > 0 ? Math.max(0, currentFuel - flow * remainingMinutes / 60) : 0;
  const simFuel = flight.units === 'KGS' ? telemetry?.totalFuelKg : telemetry?.totalFuelLb;

  return <div className="fuel-page">
    <section className="card fuel-overview"><header><div><Fuel size={18} /><h3>SimBrief fuel plan</h3></div><span className="pill blue">OFP SOURCE</span></header><div className="card-body">
      <div className="fuel-journey"><div><span>Ramp</span><strong>{format(plan.ramp, flight.units)}</strong></div><i>− {format(plan.taxi, flight.units)}</i><div><span>Takeoff</span><strong>{format(plan.takeoff, flight.units)}</strong></div><i>− {format(plan.trip, flight.units)}</i><div><span>Landing</span><strong>{format(plan.landing, flight.units)}</strong></div></div>
      <div className="fuel-breakdown">{[['Contingency', plan.contingency], ['Alternate', plan.alternate], ['Final reserve', plan.reserve], ['ETOPS', plan.etops], ['Extra', plan.extra]].filter(([, value]) => Number(value) > 0).map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{format(Number(value), flight.units)}</strong></div>)}</div>
    </div></section>

    <div className="fuel-monitor-layout">
      <section className="card fuel-checkpoint-card"><header><div><Activity size={18} /><h3>Actual fuel checkpoint</h3></div>{linked && simFuel !== undefined && <button onClick={() => setActual(current => ({ ...current, current: String(Math.round(Number(simFuel))) }))}><RefreshCw size={15} /> Use simulator fuel</button>}</header><div className="card-body">
        <div className="fuel-checkpoint-fields"><label><span>Actual ramp fuel</span><input inputMode="decimal" value={actual.ramp} onChange={event => setActual({ ...actual, ramp: event.target.value })} placeholder={String(plan.ramp || '')} /></label><label><span>Actual takeoff fuel</span><input inputMode="decimal" value={actual.takeoff} onChange={event => setActual({ ...actual, takeoff: event.target.value })} placeholder={String(plan.takeoff || '')} /></label><label><span>Fuel remaining now</span><input inputMode="decimal" value={actual.current} onChange={event => setActual({ ...actual, current: event.target.value })} /></label>
          <fieldset className="elapsed-field"><legend>Elapsed airborne time</legend><div className="elapsed-inputs"><label><span>HH</span><input inputMode="numeric" min="0" max="99" type="number" value={autoElapsed !== null ? String(elapsedHours) : actual.manualHours} readOnly={autoElapsed !== null} onChange={event => setActual({ ...actual, manualHours: event.target.value })} /></label><b>:</b><label><span>MM</span><input inputMode="numeric" min="0" max="59" type="number" value={autoElapsed !== null ? String(elapsedMinutes).padStart(2, '0') : actual.manualMinutes} readOnly={autoElapsed !== null} onChange={event => setActual({ ...actual, manualMinutes: String(Math.min(59, Math.max(0, Number(event.target.value)))) })} /></label></div><small>{autoElapsed !== null ? 'Calculated from OFF and simulator/device Zulu' : 'Manual until OFF is recorded'}</small></fieldset>
        </div>
      </div></section>
      <section className="card fuel-trend-card"><header><div><Gauge size={18} /><h3>Fuel trend</h3></div><span className="pill neutral">ELAPSED {String(elapsedHours).padStart(2, '0')}:{String(elapsedMinutes).padStart(2, '0')}</span></header><div className="card-body"><div className="fuel-trend-metrics"><div><span>Expected now</span><strong>{format(expectedNow, flight.units)}</strong></div><div className={variance < -300 ? 'bad' : variance < 0 ? 'warn' : variance > 0 ? 'good' : ''}><span>Actual vs plan</span><strong>{variance ? `${variance > 0 ? '+' : ''}${Math.round(variance).toLocaleString()} ${flight.units}` : '—'}</strong></div><div><span>Projected landing</span><strong>{format(predictedLanding, flight.units)}</strong></div><div><span>Planning flow</span><strong>{format(flow, `${flight.units}/HR`)}</strong></div></div></div></section>
    </div>

    <section className="card fuel-explanation"><header><div><HelpCircle size={18} /><h3>How to read the trend</h3></div></header><div className="card-body"><p>AeroSlate compares actual fuel remaining with the SimBrief burn profile at the elapsed airborne time. Negative variance means fuel is below the simple planned trend; positive variance means fuel is above it. Projected landing fuel carries the current trend through the remaining planned ETE.</p><div className="source-values"><span>Minimum takeoff: <strong>{format(plan.minimumTakeoff, flight.units)}</strong></span><span>Tank capacity: <strong>{format(plan.maxTanks, flight.units)}</strong></span><span>Flow source: <strong>{ofpFlow ? 'SimBrief average flow' : calculatedFlow ? 'Trip fuel ÷ ETE' : 'Unavailable'}</strong></span></div><p className="disclaimer">Simulator planning aid only. AeroSlate does not replace aircraft performance or fuel-management procedures.</p></div></section>
  </div>;
}
