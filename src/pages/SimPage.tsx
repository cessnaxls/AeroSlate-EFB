import { useEffect, useMemo, useState } from 'react';
import { Activity, Gauge, Settings2, Wifi, WifiOff } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';

export interface SimTelemetry {
  receivedAt?: string; simulator?: string; simZulu?: string; latitude?: number; longitude?: number; headingTrue?: number;
  altitudeMslFt?: number; altitudeAglFt?: number; groundAltitudeM?: number; groundSpeedKt?: number; indicatedAirspeedKt?: number;
  verticalSpeedFpm?: number; onGround?: boolean; parkingBrake?: boolean; enginesRunning?: boolean; surfaceType?: string;
  surfaceCondition?: string; tcalcDirectory?: string; tcalcFile?: string; aircraftTitle?: string; registration?: string;
  totalFuelLb?: number; totalFuelKg?: number; totalWeightLb?: number; totalWeightKg?: number;
}

export function useSimTelemetry() {
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null);
  const [linked, setLinked] = useState(false);
  const refresh = async () => {
    try { const response = await fetch('/api/sim/telemetry', { cache: 'no-store' }); const data = await response.json(); setLinked(Boolean(data.linked)); setTelemetry(data.telemetry || null); }
    catch { setLinked(false); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1000); return () => window.clearInterval(timer); }, []);
  return { telemetry, linked, refresh };
}

interface MetricDefinition { key: keyof SimTelemetry; label: string; suffix?: string; digits?: number; booleanLabels?: [string, string]; }
const GROUPS: { id: string; label: string; metrics: MetricDefinition[] }[] = [
  { id: 'flight', label: 'Flight', metrics: [
    { key: 'altitudeMslFt', label: 'Altitude MSL', suffix: ' ft', digits: 0 }, { key: 'altitudeAglFt', label: 'Altitude AGL', suffix: ' ft', digits: 0 },
    { key: 'indicatedAirspeedKt', label: 'Indicated airspeed', suffix: ' kt', digits: 1 }, { key: 'groundSpeedKt', label: 'Ground speed', suffix: ' kt', digits: 1 },
    { key: 'verticalSpeedFpm', label: 'Vertical speed', suffix: ' fpm', digits: 0 }, { key: 'headingTrue', label: 'True heading', suffix: '°', digits: 1 }
  ]},
  { id: 'position', label: 'Position', metrics: [
    { key: 'latitude', label: 'Latitude', digits: 6 }, { key: 'longitude', label: 'Longitude', digits: 6 }, { key: 'groundAltitudeM', label: 'Ground elevation', suffix: ' m', digits: 1 }
  ]},
  { id: 'aircraft', label: 'Aircraft state', metrics: [
    { key: 'onGround', label: 'Flight state', booleanLabels: ['Airborne', 'On ground'] }, { key: 'parkingBrake', label: 'Parking brake', booleanLabels: ['Released', 'Set'] },
    { key: 'enginesRunning', label: 'Engines', booleanLabels: ['Stopped', 'Running'] }, { key: 'surfaceType', label: 'Surface' }, { key: 'surfaceCondition', label: 'Surface condition' }
  ]},
  { id: 'mass', label: 'Fuel & mass', metrics: [
    { key: 'totalFuelLb', label: 'Total fuel', suffix: ' lb', digits: 0 }, { key: 'totalFuelKg', label: 'Total fuel', suffix: ' kg', digits: 0 },
    { key: 'totalWeightLb', label: 'Total weight', suffix: ' lb', digits: 0 }, { key: 'totalWeightKg', label: 'Total weight', suffix: ' kg', digits: 0 }
  ]}
];
const DEFAULT_SELECTION = ['altitudeMslFt', 'altitudeAglFt', 'indicatedAirspeedKt', 'groundSpeedKt', 'verticalSpeedFpm', 'headingTrue', 'onGround', 'parkingBrake', 'enginesRunning', 'totalFuelLb', 'totalWeightLb'];

function display(metric: MetricDefinition, telemetry: SimTelemetry | null) {
  const raw = telemetry?.[metric.key];
  if (typeof raw === 'boolean' && metric.booleanLabels) return metric.booleanLabels[raw ? 1 : 0];
  if (typeof raw === 'number' && Number.isFinite(raw)) return `${raw.toFixed(metric.digits ?? 1)}${metric.suffix || ''}`;
  if (typeof raw === 'string' && raw) return raw;
  return '—';
}

export function SimPage() {
  const { telemetry, linked } = useSimTelemetry();
  const [configOpen, setConfigOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => loadLocal('aeroslate.sim.metrics', DEFAULT_SELECTION));
  useEffect(() => saveLocal('aeroslate.sim.metrics', selected), [selected]);
  const visibleGroups = useMemo(() => GROUPS.map(group => ({ ...group, metrics: group.metrics.filter(metric => selected.includes(metric.key)) })).filter(group => group.metrics.length), [selected]);
  const toggle = (key: string) => setSelected(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);

  return <div className="sim-data-page">
    <section className="card sim-connection-card"><header><div>{linked ? <Wifi size={18} /> : <WifiOff size={18} />}<h3>Live simulator data</h3></div><button onClick={() => setConfigOpen(value => !value)}><Settings2 size={15} /> Customize</button></header><div className="card-body"><div className={`connection-banner ${linked ? 'connected' : 'disconnected'}`}><div><strong>{linked ? `${telemetry?.simulator || 'Simulator'} connected` : 'Simulator bridge offline'}</strong><span>{linked ? `${telemetry?.aircraftTitle || 'Aircraft'} · ${telemetry?.registration || 'No registration'} · ${telemetry?.simZulu || '—'}` : 'Run bridge/aeroslate_bridge.py on the simulator computer.'}</span></div><span className="live-badge">{linked ? 'LIVE' : 'OFFLINE'}</span></div>
      {configOpen && <div className="metric-config">{GROUPS.map(group => <section key={group.id}><h4>{group.label}</h4><div>{group.metrics.map(metric => <label key={metric.key}><input type="checkbox" checked={selected.includes(metric.key)} onChange={() => toggle(metric.key)} /> {metric.label}{metric.suffix ? ` (${metric.suffix.trim()})` : ''}</label>)}</div></section>)}</div>}
    </div></section>
    <div className="sim-groups">{visibleGroups.map(group => <section className="card" key={group.id}><header><div>{group.id === 'flight' ? <Activity size={18} /> : <Gauge size={18} />}<h3>{group.label}</h3></div></header><div className="card-body sim-metric-grid">{group.metrics.map(metric => <div className="metric" key={metric.key}><span>{metric.label}</span><strong>{display(metric, telemetry)}</strong></div>)}</div></section>)}</div>
  </div>;
}
