import { useEffect, useMemo, useState } from 'react';
import { Calculator, Save, Wind } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';

interface ToldInputs {
  runwayLength: number;
  runwayHeading: number;
  windDirection: number;
  windSpeed: number;
  elevation: number;
  altimeter: number;
  oat: number;
  slope: number;
  weight: number;
  referenceWeight: number;
  takeoffBaseline: number;
  landingBaseline: number;
  altitudePctPer1000: number;
  tempPctPer10: number;
  headwindPctPer10: number;
  tailwindPctPer10: number;
  upslopePctPer1: number;
  wetFactor: number;
  surface: 'dry' | 'wet';
}

const DEFAULTS: ToldInputs = {
  runwayLength: 6000, runwayHeading: 180, windDirection: 180, windSpeed: 10,
  elevation: 800, altimeter: 29.92, oat: 20, slope: 0, weight: 12000, referenceWeight: 12000,
  takeoffBaseline: 3000, landingBaseline: 2800, altitudePctPer1000: 4, tempPctPer10: 5,
  headwindPctPer10: 5, tailwindPctPer10: 10, upslopePctPer1: 10, wetFactor: 1.15, surface: 'dry'
};

function n(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function round(value: number) { return Math.max(0, Math.round(value)); }

export function ToldPage() {
  const [inputs, setInputs] = useState<ToldInputs>(() => loadLocal('dispatchlink.told.profile', DEFAULTS));
  useEffect(() => saveLocal('dispatchlink.told.profile', inputs), [inputs]);

  const result = useMemo(() => {
    const angle = (inputs.windDirection - inputs.runwayHeading) * Math.PI / 180;
    const headwind = Math.cos(angle) * inputs.windSpeed;
    const crosswind = Math.sin(angle) * inputs.windSpeed;
    const pressureAltitude = inputs.elevation + (29.92 - inputs.altimeter) * 1000;
    const isa = 15 - 1.98 * (pressureAltitude / 1000);
    const densityAltitude = pressureAltitude + 120 * (inputs.oat - isa);
    const weightFactor = inputs.referenceWeight > 0 ? Math.pow(inputs.weight / inputs.referenceWeight, 2) : 1;
    const altitudeFactor = 1 + Math.max(0, densityAltitude) / 1000 * inputs.altitudePctPer1000 / 100;
    const tempFactor = 1 + Math.max(0, inputs.oat - isa) / 10 * inputs.tempPctPer10 / 100;
    const windFactor = headwind >= 0
      ? Math.max(0.7, 1 - headwind / 10 * inputs.headwindPctPer10 / 100)
      : 1 + Math.abs(headwind) / 10 * inputs.tailwindPctPer10 / 100;
    const slopeFactor = inputs.slope >= 0 ? 1 + inputs.slope * inputs.upslopePctPer1 / 100 : Math.max(0.8, 1 + inputs.slope * 0.05);
    const surfaceFactor = inputs.surface === 'wet' ? inputs.wetFactor : 1;
    const takeoff = inputs.takeoffBaseline * weightFactor * altitudeFactor * tempFactor * windFactor * slopeFactor * surfaceFactor;
    const landing = inputs.landingBaseline * weightFactor * altitudeFactor * tempFactor * windFactor * slopeFactor * surfaceFactor;
    return { headwind, crosswind, pressureAltitude, isa, densityAltitude, takeoff, landing, takeoffMargin: inputs.runwayLength - takeoff, landingMargin: inputs.runwayLength - landing };
  }, [inputs]);

  const field = (label: string, key: keyof ToldInputs, unit?: string, step = '1') => <label><span>{label}</span><div className="unit-input"><input type="number" step={step} value={inputs[key] as number} onChange={event => setInputs({ ...inputs, [key]: n(event.target.value) })} />{unit && <small>{unit}</small>}</div></label>;

  return <div className="content-grid two">
    <section className="card"><header><div><Calculator size={18} /><h3>TOLD planning worksheet</h3></div><button onClick={() => setInputs(DEFAULTS)}><Save size={15} /> Reset example</button></header><div className="card-body">
      <div className="notice warn"><strong>Aircraft data required</strong><p>Enter baseline distances and correction percentages from the applicable AFM/POH or approved operator performance source. DispatchLink does not invent certified aircraft performance data.</p></div>
      <div className="form-grid three">{field('Runway available', 'runwayLength', 'ft')}{field('Runway heading', 'runwayHeading', '°')}{field('Runway slope', 'slope', '%', '0.1')}{field('Airport elevation', 'elevation', 'ft')}{field('Altimeter', 'altimeter', 'inHg', '0.01')}{field('OAT', 'oat', '°C')}{field('Wind direction', 'windDirection', '°')}{field('Wind speed', 'windSpeed', 'kt')}{field('Actual weight', 'weight', 'lb')}{field('Reference weight', 'referenceWeight', 'lb')}{field('AFM takeoff baseline', 'takeoffBaseline', 'ft')}{field('AFM landing baseline', 'landingBaseline', 'ft')}</div>
      <label className="stacked-input"><span>Runway surface</span><select value={inputs.surface} onChange={event => setInputs({ ...inputs, surface: event.target.value as ToldInputs['surface'] })}><option value="dry">Dry</option><option value="wet">Wet / contaminated factor</option></select></label>
    </div></section>

    <section className="card"><header><div><Wind size={18} /><h3>Calculated result</h3></div></header><div className="card-body">
      <div className="metric-strip mini"><div className="metric"><span>Pressure altitude</span><strong>{round(result.pressureAltitude).toLocaleString()} ft</strong></div><div className="metric"><span>Density altitude</span><strong>{round(result.densityAltitude).toLocaleString()} ft</strong></div><div className="metric"><span>ISA temperature</span><strong>{result.isa.toFixed(1)} °C</strong></div></div>
      <div className="wind-box"><div><span>{result.headwind >= 0 ? 'Headwind' : 'Tailwind'}</span><strong>{Math.abs(result.headwind).toFixed(1)} kt</strong></div><div><span>Crosswind</span><strong>{Math.abs(result.crosswind).toFixed(1)} kt {result.crosswind > 0 ? 'from left' : 'from right'}</strong></div></div>
      <div className="told-results"><div className={result.takeoffMargin >= 0 ? 'good' : 'bad'}><span>Adjusted takeoff distance</span><strong>{round(result.takeoff).toLocaleString()} ft</strong><small>{round(result.takeoffMargin).toLocaleString()} ft margin</small></div><div className={result.landingMargin >= 0 ? 'good' : 'bad'}><span>Adjusted landing distance</span><strong>{round(result.landing).toLocaleString()} ft</strong><small>{round(result.landingMargin).toLocaleString()} ft margin</small></div></div>
      <p className="disclaimer">This is a configurable simulation/planning worksheet, not an AFM, approved performance program, or operational release. Verify every result against the aircraft’s approved data.</p>
    </div></section>

    <section className="card span-2"><header><div><Calculator size={18} /><h3>Correction model</h3></div></header><div className="card-body"><div className="form-grid six">{field('Altitude / 1,000 ft', 'altitudePctPer1000', '%')}{field('Temperature / 10°C', 'tempPctPer10', '%')}{field('Headwind / 10 kt', 'headwindPctPer10', '%')}{field('Tailwind / 10 kt', 'tailwindPctPer10', '%')}{field('Upslope / 1%', 'upslopePctPer1', '%')}{field('Wet factor', 'wetFactor', '×', '0.01')}</div></div></section>
  </div>;
}
