import { Clipboard, FileText, Gauge, Plane, Route, ShieldCheck } from 'lucide-react';
import { asArray, dig, getICAOFlightPlan, type AnyRecord, type FlightSummary } from '../lib/ofp';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; notify: (message: string) => void; }
const text = (value: unknown, fallback='—') => value === undefined || value === null || value === '' ? fallback : String(value);
const num = (value: unknown, units='') => { const n=Number(value); return Number.isFinite(n) ? `${n.toLocaleString()}${units}` : '—'; };

export function OFPPage({ ofp, flight, notify }: Props) {
  const atc=getICAOFlightPlan(ofp);
  const copy=async()=>{ if(!atc) return notify('No ICAO flight plan was included in this OFP.'); await navigator.clipboard.writeText(atc); notify('ICAO flight plan copied.'); };
  const alternates=asArray(dig(ofp,'alternate')).map((a:any)=>a?.icao_code).filter(Boolean).join(', ') || flight.alternate;
  const remarks=text(dig(ofp,'general.dx_rmk','params.manualrmk'),'No dispatcher remarks.');
  const fuel=[['Ramp',dig(ofp,'fuel.plan_ramp')],['Taxi',dig(ofp,'fuel.taxi')],['Trip',dig(ofp,'fuel.enroute_burn')],['Contingency',dig(ofp,'fuel.contingency')],['Alternate',dig(ofp,'fuel.alternate_burn')],['Reserve',dig(ofp,'fuel.reserve')],['Extra',dig(ofp,'fuel.extra')],['Landing',dig(ofp,'fuel.plan_landing')]];
  const weights=[['Pax',dig(ofp,'weights.pax_count')],['Payload',dig(ofp,'weights.payload')],['Cargo',dig(ofp,'weights.cargo')],['ZFW',dig(ofp,'weights.est_zfw')],['TOW',dig(ofp,'weights.est_tow')],['LDW',dig(ofp,'weights.est_ldw')],['MTOW',dig(ofp,'weights.max_tow')],['MLW',dig(ofp,'weights.max_ldw')]];
  return <div className="ofp-briefing-page">
    <section className="card ofp-hero"><div className="card-body"><div className="ofp-title-block"><span>{flight.airline}{flight.flightNumber}</span><strong>{flight.origin} → {flight.destination}</strong><small>{flight.aircraft} · {flight.registration} · Release {flight.release}</small></div><div className="button-row"><button onClick={copy}><Clipboard size={16}/> Copy ICAO FPL</button></div></div></section>
    <div className="content-grid two ofp-professional-grid">
      <section className="card"><header><div><Gauge size={18}/><h3>Flight overview</h3></div></header><div className="card-body status-list"><div><span>STD / STA</span><strong>{flight.schedOut} / {flight.schedIn}</strong></div><div><span>Block / ETE</span><strong>{flight.blockTime} / {flight.ete}</strong></div><div><span>Distance</span><strong>{flight.distance}</strong></div><div><span>Cruise / CI</span><strong>{flight.cruiseAltitude} / {flight.costIndex}</strong></div><div><span>Runways</span><strong>{flight.departureRunway} / {flight.arrivalRunway}</strong></div><div><span>Alternate</span><strong>{alternates}</strong></div></div></section>
      <section className="card"><header><div><Route size={18}/><h3>Route</h3></div></header><div className="card-body"><div className="route-briefing-text">{flight.route}</div></div></section>
      <section className="card"><header><div><Plane size={18}/><h3>Fuel plan</h3></div></header><div className="card-body ofp-kpi-grid">{fuel.map(([k,v])=><div key={String(k)}><span>{k}</span><strong>{num(v,` ${flight.units}`)}</strong></div>)}</div></section>
      <section className="card"><header><div><ShieldCheck size={18}/><h3>Weights & load</h3></div></header><div className="card-body ofp-kpi-grid">{weights.map(([k,v])=><div key={String(k)}><span>{k}</span><strong>{k==='Pax'?num(v):num(v,` ${flight.units}`)}</strong></div>)}</div></section>
      <section className="card span-2"><header><div><FileText size={18}/><h3>ICAO flight plan</h3></div><button onClick={copy}><Clipboard size={15}/> Copy</button></header><div className="card-body"><pre className="flightplan-text compact-fpl">{atc || 'No ICAO flight plan available.'}</pre></div></section>
      <section className="card span-2"><header><div><FileText size={18}/><h3>Dispatcher remarks</h3></div></header><div className="card-body"><div className="block-text">{remarks}</div></div></section>
    </div>
  </div>;
}
