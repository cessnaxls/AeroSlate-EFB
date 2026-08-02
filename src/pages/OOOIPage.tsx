import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, Plane, RotateCcw, Settings2 } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { formatMinutes, minutesBetweenZulu, normalizeZulu, oooiStorageKey, useOOOITimes, zuluNow, type OOOITimes } from '../lib/flightTimes';
import { useSimTelemetry } from './SimPage';
import { ZuluTimeInput } from '../components/ZuluTimeInput';

interface Presets { autoOut: boolean; autoOff: boolean; autoOn: boolean; autoIn: boolean; outGs: number; offGs: number; onGs: number; sustainSeconds: number; }
const DEFAULT_PRESETS: Presets = { autoOut: true, autoOff: true, autoOn: true, autoIn: true, outGs: 1, offGs: 45, onGs: 45, sustainSeconds: 2 };
export { oooiStorageKey } from '../lib/flightTimes';
export type { OOOITimes } from '../lib/flightTimes';

function adjustedDelay(value: number | null) { return value === null ? null : value > 720 ? value - 1440 : value; }
function delayText(value: number | null) { const adjusted = adjustedDelay(value); return adjusted === null ? 'PENDING' : `${adjusted > 0 ? '+' : ''}${adjusted} MIN`; }
function delayTone(value: number | null) { const adjusted = adjustedDelay(value); return adjusted === null ? 'neutral' : adjusted <= 0 ? 'good' : adjusted <= 15 ? 'warn' : 'bad'; }

export function OOOIPage({ release, origin, destination, schedOut, schedIn }: { release: string; origin: string; destination: string; schedOut: string; schedIn: string }) {
  const key = oooiStorageKey(release, origin, destination);
  const { times, setTimes, blockMinutes, flightMinutes } = useOOOITimes(key);
  const [presets, setPresets] = useState<Presets>(() => loadLocal('aeroslate.oooi.presets', DEFAULT_PRESETS));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { telemetry, linked } = useSimTelemetry();
  const counters = useRef({ out: 0, off: 0, on: 0, in: 0 });
  useEffect(() => saveLocal('aeroslate.oooi.presets', presets), [presets]);

  useEffect(() => {
    if (!linked || !telemetry) { counters.current = { out: 0, off: 0, on: 0, in: 0 }; return; }
    const now = normalizeZulu(telemetry.simZulu || zuluNow());
    const tick = (field: keyof OOOITimes, condition: boolean, enabled: boolean) => {
      counters.current[field] = condition && enabled ? counters.current[field] + 1 : 0;
      if (!times[field] && counters.current[field] >= Math.max(1, presets.sustainSeconds)) setTimes(current => current[field] ? current : { ...current, [field]: now });
    };
    tick('out', !Boolean(telemetry.parkingBrake) && (telemetry.groundSpeedKt || 0) > presets.outGs, presets.autoOut);
    tick('off', Boolean(times.out) && (!telemetry.onGround || (telemetry.groundSpeedKt || 0) > presets.offGs), presets.autoOff);
    tick('on', Boolean(times.off) && Boolean(telemetry.onGround) && (telemetry.groundSpeedKt || 0) < presets.onGs, presets.autoOn);
    tick('in', Boolean(times.on) && Boolean(telemetry.parkingBrake) && !telemetry.enginesRunning, presets.autoIn);
  }, [linked, telemetry, presets, times, setTimes]);

  const setNow = (field: keyof OOOITimes) => setTimes(current => ({ ...current, [field]: normalizeZulu(telemetry?.simZulu || zuluNow()) }));
  const outDelay = minutesBetweenZulu(schedOut, times.out); const inDelay = minutesBetweenZulu(schedIn, times.in);
  const points: { key: keyof OOOITimes; title: string; subtitle: string }[] = [
    { key: 'out', title: 'OUT', subtitle: 'Gate departure' }, { key: 'off', title: 'OFF', subtitle: 'Airborne' },
    { key: 'on', title: 'ON', subtitle: 'Touchdown' }, { key: 'in', title: 'IN', subtitle: 'Gate arrival' }
  ];

  return <div className="oooi-page">
    <section className="card oooi-main"><header><div><Plane size={18} /><h3>OOOI timeline</h3></div><div className="header-actions"><span className={`pill ${linked ? 'good' : 'warn'}`}>{linked ? 'SIM ZULU' : 'DEVICE UTC'}</span><button onClick={() => setTimes({ out: '', off: '', on: '', in: '' })}><RotateCcw size={15} /> Clear</button></div></header><div className="card-body">
      <div className="oooi-timeline">{points.map((point, index) => <div className={`oooi-point ${times[point.key] ? 'recorded' : ''}`} key={point.key}>{index < points.length - 1 && <div className="oooi-connector" />}<div className="oooi-node">{index + 1}</div><div className="oooi-point-content"><div><strong>{point.title}</strong><span>{point.subtitle}</span></div><ZuluTimeInput value={times[point.key]} ariaLabel={`${point.title} time`} onChange={value => setTimes(current => ({ ...current, [point.key]: value }))} /><button onClick={() => setNow(point.key)}>NOW</button></div></div>)}</div>
      <div className="oooi-summary"><div><span>Block time</span><strong>{formatMinutes(blockMinutes)}</strong><small>OUT → IN</small></div><div><span>Airborne time</span><strong>{formatMinutes(flightMinutes)}</strong><small>OFF → ON</small></div><div><span>Schedule</span><strong>{schedOut} / {schedIn}</strong><small>STD / STA</small></div><div><span>Route</span><strong>{origin}–{destination}</strong></div></div>
    </div></section>

    <div className="content-grid two oooi-lower">
      <section className="card"><header><div><Clock3 size={18} /><h3>Schedule performance</h3></div></header><div className="card-body delay-cards"><div><span>Departure</span><strong className={`pill ${delayTone(outDelay)}`}>{delayText(outDelay)}</strong><small>Actual OUT versus STD</small></div><div><span>Arrival</span><strong className={`pill ${delayTone(inDelay)}`}>{delayText(inDelay)}</strong><small>Actual IN versus STA</small></div></div></section>
      <section className="card"><header><div><Settings2 size={18} /><h3>Automatic capture</h3></div><button onClick={() => setSettingsOpen(value => !value)}>{settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {settingsOpen ? 'Hide' : 'Configure'}</button></header><div className="card-body"><p className="muted">Enabled events are recorded from simulator state after the condition remains true for {presets.sustainSeconds} seconds.</p>{settingsOpen && <div className="oooi-settings">
        <label><input type="checkbox" checked={presets.autoOut} onChange={e => setPresets({ ...presets, autoOut: e.target.checked })} /><span><strong>OUT</strong><small>Parking brake released, GS above</small></span><input type="number" value={presets.outGs} onChange={e => setPresets({ ...presets, outGs: Number(e.target.value) })} /><em>kt</em></label>
        <label><input type="checkbox" checked={presets.autoOff} onChange={e => setPresets({ ...presets, autoOff: e.target.checked })} /><span><strong>OFF</strong><small>Airborne or GS above</small></span><input type="number" value={presets.offGs} onChange={e => setPresets({ ...presets, offGs: Number(e.target.value) })} /><em>kt</em></label>
        <label><input type="checkbox" checked={presets.autoOn} onChange={e => setPresets({ ...presets, autoOn: e.target.checked })} /><span><strong>ON</strong><small>On ground, GS below</small></span><input type="number" value={presets.onGs} onChange={e => setPresets({ ...presets, onGs: Number(e.target.value) })} /><em>kt</em></label>
        <label><input type="checkbox" checked={presets.autoIn} onChange={e => setPresets({ ...presets, autoIn: e.target.checked })} /><span><strong>IN</strong><small>Parking brake set, engines stopped</small></span><i>—</i><em /></label>
        <label className="sustain-setting"><span><strong>Debounce</strong><small>Condition must remain true</small></span><input type="number" min="1" max="30" value={presets.sustainSeconds} onChange={e => setPresets({ ...presets, sustainSeconds: Number(e.target.value) })} /><em>sec</em></label>
      </div>}</div></section>
    </div>
    <div className="copy-note">OOOI is the single source for actual flight times. Logbook and duty drafts update automatically; no duplicate re-entry is required.</div>
  </div>;
}
