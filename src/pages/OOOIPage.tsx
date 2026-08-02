import { useEffect, useRef, useState } from 'react';
import { Plane, RotateCcw, Save, Timer } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { useSimTelemetry } from './SimPage';

export interface OOOITimes { out: string; off: string; on: string; in: string; }
interface Presets { autoOut: boolean; autoOff: boolean; autoOn: boolean; autoIn: boolean; outGs: number; offGs: number; onGs: number; sustainSeconds: number; }
const DEFAULT_PRESETS: Presets = { autoOut: true, autoOff: true, autoOn: true, autoIn: true, outGs: 1, offGs: 45, onGs: 45, sustainSeconds: 2 };

function utcNow() { return `${new Date().toISOString().slice(11, 16)}z`; }
function normalize(value: string) { const match = value.replace(/z/gi, '').match(/^(\d{1,2}):?(\d{2})$/); return match ? `${match[1].padStart(2, '0')}:${match[2]}z` : value; }
function minutes(a: string, b: string) { const p = (v: string) => { const m = v.match(/(\d{2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }; const x = p(a), y = p(b); return x === null || y === null ? null : (y - x + 1440) % 1440; }
function duration(value: number | null) { return value === null ? '--:--' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

export function oooiStorageKey(release: string, origin: string, destination: string) { return `dispatchlink.times.${release}.${origin}${destination}`; }

export function OOOIPage({ release, origin, destination, schedOut, schedIn }: { release: string; origin: string; destination: string; schedOut: string; schedIn: string }) {
  const key = oooiStorageKey(release, origin, destination);
  const [times, setTimes] = useState<OOOITimes>(() => loadLocal(key, { out: '', off: '', on: '', in: '' }));
  const [presets, setPresets] = useState<Presets>(() => loadLocal('dispatchlink.oooi.presets', DEFAULT_PRESETS));
  const { telemetry, linked } = useSimTelemetry();
  const counters = useRef({ out: 0, off: 0, on: 0, in: 0 });
  useEffect(() => saveLocal(key, times), [key, times]);
  useEffect(() => saveLocal('dispatchlink.oooi.presets', presets), [presets]);

  useEffect(() => {
    if (!linked || !telemetry) { counters.current = { out: 0, off: 0, on: 0, in: 0 }; return; }
    const now = telemetry.simZulu || utcNow();
    const tick = (field: keyof OOOITimes, condition: boolean, enabled: boolean) => {
      counters.current[field] = condition && enabled ? counters.current[field] + 1 : 0;
      if (!times[field] && counters.current[field] >= Math.max(1, presets.sustainSeconds)) setTimes(current => current[field] ? current : { ...current, [field]: normalize(now) });
    };
    tick('out', !Boolean(telemetry.parkingBrake) && (telemetry.groundSpeedKt || 0) > presets.outGs, presets.autoOut);
    tick('off', Boolean(times.out) && (!telemetry.onGround || (telemetry.groundSpeedKt || 0) > presets.offGs), presets.autoOff);
    tick('on', Boolean(times.off) && Boolean(telemetry.onGround) && (telemetry.groundSpeedKt || 0) < presets.onGs, presets.autoOn);
    tick('in', Boolean(times.on) && Boolean(telemetry.parkingBrake) && !telemetry.enginesRunning, presets.autoIn);
  }, [linked, telemetry, presets, times]);

  const setNow = (field: keyof OOOITimes) => setTimes({ ...times, [field]: normalize(telemetry?.simZulu || utcNow()) });
  const block = minutes(times.out, times.in); const flight = minutes(times.off, times.on);
  const field = (name: keyof OOOITimes) => <label><span>{name.toUpperCase()}</span><input value={times[name]} placeholder="HH:MMz" onChange={event => setTimes({ ...times, [name]: normalize(event.target.value) })} /><button onClick={() => setNow(name)}>NOW</button></label>;

  return <div className="content-grid two">
    <section className="card"><header><div><Plane size={18} /><h3>OOOI times</h3></div><button onClick={() => setTimes({ out: '', off: '', on: '', in: '' })}><RotateCcw size={15} /> Clear</button></header><div className="card-body"><div className="oooi-grid">{field('out')}{field('off')}{field('on')}{field('in')}</div><div className="metric-strip mini"><div className="metric"><span>Block</span><strong>{duration(block)}</strong></div><div className="metric"><span>Flight</span><strong>{duration(flight)}</strong></div><div className="metric"><span>Clock source</span><strong>{linked ? 'Simulator Zulu' : 'Device UTC'}</strong></div></div></div></section>
    <section className="card"><header><div><Timer size={18} /><h3>Schedule</h3></div></header><div className="card-body"><div className="metric-strip mini"><div className="metric"><span>STD</span><strong>{schedOut || '—'}</strong></div><div className="metric"><span>STA</span><strong>{schedIn || '—'}</strong></div><div className="metric"><span>Route</span><strong>{origin}–{destination}</strong></div></div><p>Automatic events are written once and never overwritten. Use NOW for manual capture or correction.</p></div></section>
    <section className="card span-2"><header><div><Save size={18} /><h3>Automatic event presets</h3></div><span className={`pill ${linked ? 'good' : 'warn'}`}>{linked ? 'Bridge connected' : 'Bridge required'}</span></header><div className="card-body"><div className="preset-grid"><label><input type="checkbox" checked={presets.autoOut} onChange={e => setPresets({ ...presets, autoOut: e.target.checked })} /> OUT: parking brake released and GS above <input type="number" value={presets.outGs} onChange={e => setPresets({ ...presets, outGs: Number(e.target.value) })} /> kt</label><label><input type="checkbox" checked={presets.autoOff} onChange={e => setPresets({ ...presets, autoOff: e.target.checked })} /> OFF: airborne or GS above <input type="number" value={presets.offGs} onChange={e => setPresets({ ...presets, offGs: Number(e.target.value) })} /> kt</label><label><input type="checkbox" checked={presets.autoOn} onChange={e => setPresets({ ...presets, autoOn: e.target.checked })} /> ON: on ground and GS below <input type="number" value={presets.onGs} onChange={e => setPresets({ ...presets, onGs: Number(e.target.value) })} /> kt</label><label><input type="checkbox" checked={presets.autoIn} onChange={e => setPresets({ ...presets, autoIn: e.target.checked })} /> IN: parking brake set and engines stopped</label><label>Sustain condition for <input type="number" min="1" max="30" value={presets.sustainSeconds} onChange={e => setPresets({ ...presets, sustainSeconds: Number(e.target.value) })} /> seconds</label></div></div></section>
  </div>;
}
