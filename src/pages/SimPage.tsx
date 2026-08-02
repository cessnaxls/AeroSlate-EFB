import { useEffect, useState } from 'react';
import { Activity, Gauge, RefreshCw, Wifi, WifiOff } from 'lucide-react';

export interface SimTelemetry {
  receivedAt?: string;
  simulator?: string;
  simZulu?: string;
  latitude?: number;
  longitude?: number;
  headingTrue?: number;
  altitudeMslFt?: number;
  altitudeAglFt?: number;
  groundAltitudeM?: number;
  groundSpeedKt?: number;
  indicatedAirspeedKt?: number;
  verticalSpeedFpm?: number;
  onGround?: boolean;
  parkingBrake?: boolean;
  enginesRunning?: boolean;
  surfaceType?: string;
  surfaceCondition?: string;
  tcalcDirectory?: string;
  tcalcFile?: string;
  aircraftTitle?: string;
  registration?: string;
}

export function useSimTelemetry() {
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null);
  const [linked, setLinked] = useState(false);
  const refresh = async () => {
    try {
      const response = await fetch('/api/sim/telemetry', { cache: 'no-store' });
      const data = await response.json();
      setLinked(Boolean(data.linked));
      setTelemetry(data.telemetry || null);
    } catch { setLinked(false); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1000); return () => window.clearInterval(timer); }, []);
  return { telemetry, linked, refresh };
}

function value(value: unknown, suffix = '', digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';
}

export function SimPage() {
  const { telemetry, linked, refresh } = useSimTelemetry();
  return <div className="content-grid two">
    <section className="card"><header><div>{linked ? <Wifi size={18} /> : <WifiOff size={18} />}<h3>Simulator bridge</h3></div><button className="text-button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></header><div className="card-body">
      <div className={`connection-banner ${linked ? 'connected' : 'disconnected'}`}><strong>{linked ? `${telemetry?.simulator || 'Simulator'} connected` : 'Bridge offline'}</strong><span>{linked ? `Last data ${telemetry?.receivedAt || 'now'}` : 'Run bridge/dispatchlink_bridge.py on the simulator computer.'}</span></div>
      <div className="status-list"><div><span>Aircraft</span><strong>{telemetry?.aircraftTitle || '—'}</strong></div><div><span>Registration</span><strong>{telemetry?.registration || '—'}</strong></div><div><span>Simulator Zulu</span><strong>{telemetry?.simZulu || '—'}</strong></div><div><span>State</span><strong>{telemetry?.onGround ? 'On ground' : 'Airborne'} · {telemetry?.parkingBrake ? 'Parking brake set' : 'Parking brake released'}</strong></div><div><span>Engines</span><strong>{telemetry?.enginesRunning ? 'Running' : 'Stopped'}</strong></div></div>
    </div></section>

    <section className="card"><header><div><Gauge size={18} /><h3>TCalc-compatible position</h3></div></header><div className="card-body"><div className="metric-strip mini"><div className="metric"><span>Latitude</span><strong>{value(telemetry?.latitude, '', 6)}</strong></div><div className="metric"><span>Longitude</span><strong>{value(telemetry?.longitude, '', 6)}</strong></div><div className="metric"><span>True heading</span><strong>{value(telemetry?.headingTrue, '°', 1)}</strong></div><div className="metric"><span>Ground altitude</span><strong>{value(telemetry?.groundAltitudeM, ' m', 1)}</strong></div></div><div className="tcalc-grid"><div><span>Directory number</span><strong>{telemetry?.tcalcDirectory || '—'}</strong></div><div><span>File number</span><strong>{telemetry?.tcalcFile || '—'}</strong></div><div><span>Surface</span><strong>{telemetry?.surfaceType || 'Unknown'}</strong></div><div><span>Condition</span><strong>{telemetry?.surfaceCondition || 'Unknown'}</strong></div></div></div></section>

    <section className="card span-2"><header><div><Activity size={18} /><h3>Live flight data</h3></div></header><div className="card-body"><div className="metric-strip"><div className="metric"><span>Altitude MSL</span><strong>{value(telemetry?.altitudeMslFt, ' ft', 0)}</strong></div><div className="metric"><span>Altitude AGL</span><strong>{value(telemetry?.altitudeAglFt, ' ft', 0)}</strong></div><div className="metric"><span>Ground speed</span><strong>{value(telemetry?.groundSpeedKt, ' kt', 1)}</strong></div><div className="metric"><span>Indicated airspeed</span><strong>{value(telemetry?.indicatedAirspeedKt, ' kt', 1)}</strong></div><div className="metric"><span>Vertical speed</span><strong>{value(telemetry?.verticalSpeedFpm, ' fpm', 0)}</strong></div></div></div></section>
  </div>;
}
