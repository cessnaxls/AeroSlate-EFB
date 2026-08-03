import { Clipboard, FileText, Gauge, Plane, Route, ShieldCheck, Clock3, CloudSun } from 'lucide-react';
import { asArray, dig, getICAOFlightPlan, getWeather, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal } from '../lib/storage';
interface Props { ofp: AnyRecord | null; flight: FlightSummary; notify: (message: string) => void; }

function scalar(value: unknown, fallback = '—'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(item => scalar(item, '')).filter(Boolean);
    return values.length ? values.join(', ') : fallback;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['value', 'text', '#text', '_text', 'code', 'name', 'selcal', 'fin']) {
      const candidate = scalar(object[key], '');
      if (candidate) return candidate;
    }
    const leaves = Object.values(object).map(item => scalar(item, '')).filter(Boolean);
    return leaves.length === 1 ? leaves[0] : fallback;
  }
  return fallback;
}
const num=(v:unknown,u='')=>{const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString()}${u}`:'—'};
function List({items}:{items:[string,unknown][]}){return <div className="status-list">{items.map(([k,v])=><div key={k}><span>{k}</span><strong>{scalar(v)}</strong></div>)}</div>}
function procedureName(value: unknown, fallback='—') {
  const text = scalar(value, '');
  return text && !/^\d{1,2}[LRC]?$/i.test(text) ? text : fallback;
}

export function OFPPage({ofp,flight,notify}:Props){
 const atc=getICAOFlightPlan(ofp); const copy=async()=>{if(!atc)return notify('No ICAO flight plan was included in this OFP.');await navigator.clipboard.writeText(atc);notify('ICAO flight plan copied.');};
 const alternates=asArray(dig(ofp,'alternate')).map((a:any)=>scalar(a?.icao_code||a?.icao,'')).filter(Boolean).join(', ')||flight.alternate;
 const remarks=scalar(dig(ofp,'general.dx_rmk','params.manualrmk','general.remarks'),'No dispatcher remarks.');
 const fuel:[string,unknown][]=[['Ramp',dig(ofp,'fuel.plan_ramp')],['Taxi',dig(ofp,'fuel.taxi')],['Takeoff',dig(ofp,'fuel.plan_takeoff')],['Trip',dig(ofp,'fuel.enroute_burn')],['Contingency',dig(ofp,'fuel.contingency')],['Alternate',dig(ofp,'fuel.alternate_burn')],['Reserve',dig(ofp,'fuel.reserve')],['Extra',dig(ofp,'fuel.extra')],['Landing',dig(ofp,'fuel.plan_landing')]];
 const generated=loadLocal<any>('aeroslate.lastDispatchLoad',null); const matching=generated&&generated.flightNumber===`${flight.airline}${flight.flightNumber}`?generated:null;
 const weights:[string,unknown][]=[['Passengers',matching?.pax??dig(ofp,'weights.pax_count')],['Passenger weight',matching?matching.pax*190:dig(ofp,'weights.pax_weight')],['Baggage',matching?.bags??dig(ofp,'weights.bag_count')],['Bag weight',matching?.bagWeight??dig(ofp,'weights.bag_weight')],['Freight',matching?.freight??dig(ofp,'weights.cargo')],['Payload',matching?.payload??dig(ofp,'weights.payload')],['ZFW',dig(ofp,'weights.est_zfw')],['TOW',dig(ofp,'weights.est_tow')],['LDW',dig(ofp,'weights.est_ldw')],['MTOW',dig(ofp,'weights.max_tow')],['MLW',dig(ofp,'weights.max_ldw')]];
 const depwx=getWeather(ofp,'origin').metar, arrwx=getWeather(ofp,'destination').metar;
 const ofpLayout=scalar(dig(ofp,'params.planformat','params.ofp_layout','params.layout','general.planformat','general.ofp_layout','params.airline'),flight.airline||'—');
 const dispatcher=scalar(dig(ofp,'general.dx_name','general.dispatcher','params.dispatcher'),'—');
 const generatedStatus=scalar(dig(ofp,'fetch.status','general.status'),'Generated');
 const fin=scalar(dig(ofp,'aircraft.fin','aircraft.fleet_number','aircraft.tail_fin'),'—');
 const selcal=scalar(dig(ofp,'aircraft.selcal','aircraft.selcal_code','general.selcal'),'—');
 const sid=procedureName(dig(ofp,'origin.sid','origin.sid_name','general.sid','params.sid'));
 const star=procedureName(dig(ofp,'destination.star','destination.star_name','general.star','params.star'));
 return <div className="ofp-briefing-page">
  <section className="card ofp-hero"><div className="card-body"><div className="ofp-title-block"><span>{flight.airline}{flight.flightNumber}</span><strong>{flight.origin} → {flight.destination}</strong><small>{flight.aircraft} · {flight.registration} · Release {flight.release}</small></div><button onClick={copy}><Clipboard size={16}/> Copy ICAO FPL</button></div></section>
  <div className="content-grid two ofp-professional-grid">
   <section className="card"><header><div><Gauge size={18}/><h3>Dispatch overview</h3></div></header><div className="card-body"><List items={[["Release",flight.release],["Flight date",flight.flightDate],["Callsign",flight.callsign||`${flight.airline}${flight.flightNumber}`],["OFP layout",ofpLayout],["Dispatcher",dispatcher],["Status",generatedStatus]]}/></div></section>
   <section className="card"><header><div><Clock3 size={18}/><h3>Schedule & flight profile</h3></div></header><div className="card-body"><List items={[["STD / STA",`${flight.schedOut} / ${flight.schedIn}`],["Block / ETE",`${flight.blockTime} / ${flight.ete}`],["Air distance",flight.distance],["Cruise altitude",flight.cruiseAltitude],["Cost index",flight.costIndex],["Cruise TAS / Mach",`${scalar(dig(ofp,'general.cruise_tas'))} / ${scalar(dig(ofp,'general.cruise_mach'))}`]]}/></div></section>
   <section className="card span-2"><header><div><Route size={18}/><h3>Route & airports</h3></div></header><div className="card-body"><div className="route-briefing-text">{flight.route}</div><div className="ofp-kpi-grid route-airport-grid"><div><span>Departure</span><strong>{flight.origin} · RWY {flight.departureRunway}</strong></div><div><span>Destination</span><strong>{flight.destination} · RWY {flight.arrivalRunway}</strong></div><div><span>Alternate(s)</span><strong>{alternates}</strong></div><div><span>SID / STAR</span><strong>{sid} / {star}</strong></div></div></div></section>
   <section className="card"><header><div><Plane size={18}/><h3>Aircraft & configuration</h3></div></header><div className="card-body"><List items={[["Type",`${flight.aircraft} · ${scalar(dig(ofp,'aircraft.name'))}`],["Registration",flight.registration],["FIN / SELCAL",`${fin} / ${selcal}`],["Engines",scalar(dig(ofp,'aircraft.engines','aircraft.engine'))],["Ceiling",num(dig(ofp,'aircraft.max_ceiling'),' ft')],["Units",flight.units]]}/></div></section>
   <section className="card"><header><div><CloudSun size={18}/><h3>Weather snapshot</h3></div></header><div className="card-body weather-ofp-summary"><div><span>{flight.origin} METAR</span><p>{depwx}</p></div><div><span>{flight.destination} METAR</span><p>{arrwx}</p></div></div></section>
   <section className="card"><header><div><Plane size={18}/><h3>Fuel plan</h3></div></header><div className="card-body ofp-kpi-grid">{fuel.map(([k,v])=><div key={k}><span>{k}</span><strong>{num(v,` ${flight.units}`)}</strong></div>)}</div></section>
   <section className="card"><header><div><Gauge size={18}/><h3>Weights & load</h3></div></header><div className="card-body ofp-kpi-grid">{weights.map(([k,v])=><div key={k}><span>{k}</span><strong>{k==='Passengers'||k==='Baggage'?num(v):num(v,` ${flight.units}`)}</strong></div>)}</div></section>
   <section className="card span-2"><header><div><FileText size={18}/><h3>ICAO flight plan</h3></div><button onClick={copy}><Clipboard size={15}/> Copy</button></header><div className="card-body"><pre className="flightplan-text compact-fpl">{atc||'No ICAO flight plan available.'}</pre></div></section>
   <section className="card span-2"><header><div><ShieldCheck size={18}/><h3>Operational remarks</h3></div></header><div className="card-body"><div className="block-text">{remarks}</div></div></section>
  </div>
 </div>;
}
