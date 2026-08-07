import { Clipboard, Clock3, CloudSun, FileText, Fuel, Plane, Route, ShieldCheck, Gauge } from 'lucide-react';
import { asArray, dig, getICAOFlightPlan, getProcedures, getSelcal, getWeather, leafText, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { loadLocal } from '../lib/storage';
interface Props { ofp: AnyRecord | null; flight: FlightSummary; notify: (message: string) => void; }

function scalar(value: unknown, fallback = '—'): string { return leafText(value, fallback); }
const num=(v:unknown,u='')=>{const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString()}${u}`:'—'};
function Rows({items}:{items:[string,unknown][]}){return <div className="ofp-rows">{items.map(([k,v])=><div key={k}><span>{k}</span><strong>{scalar(v)}</strong></div>)}</div>}
function Kpis({items,units,countKeys=[]}:{items:[string,unknown][],units:string,countKeys?:string[]}){return <div className="ofp-mini-kpis">{items.map(([k,v])=><div key={k}><span>{k}</span><strong>{countKeys.includes(k)?num(v):num(v,` ${units}`)}</strong></div>)}</div>}

export function OFPPage({ofp,flight,notify}:Props){
 const atc=getICAOFlightPlan(ofp); const copy=async()=>{if(!atc)return notify('No ICAO flight plan was included in this OFP.');await navigator.clipboard.writeText(atc);notify('ICAO flight plan copied.');};
 const alternates=asArray(dig(ofp,'alternate')).map((a:any)=>scalar(a?.icao_code||a?.icao,'')).filter(Boolean).join(', ')||flight.alternate;
 const remarks=scalar(dig(ofp,'general.dx_rmk','params.manualrmk','general.remarks'),'No dispatcher remarks.');
 const generated=loadLocal<any>('aeroslate.lastDispatchLoad',null); const matching=generated&&generated.flightNumber===`${flight.airline}${flight.flightNumber}`?generated:null;
 const fuel:[string,unknown][]=[['Ramp',dig(ofp,'fuel.plan_ramp')],['Taxi',dig(ofp,'fuel.taxi')],['Takeoff',dig(ofp,'fuel.plan_takeoff')],['Trip',dig(ofp,'fuel.enroute_burn')],['Contingency',dig(ofp,'fuel.contingency')],['Alternate',dig(ofp,'fuel.alternate_burn')],['Reserve',dig(ofp,'fuel.reserve')],['Landing',dig(ofp,'fuel.plan_landing')]];
 const weights:[string,unknown][]=[['Pax',matching?.pax??dig(ofp,'weights.pax_count')],['Pax wt',matching?matching.pax*190:dig(ofp,'weights.pax_weight')],['Bags',matching?.bags??dig(ofp,'weights.bag_count')],['Bag wt',matching?.bagWeight??dig(ofp,'weights.bag_weight')],['Freight',matching?.freight??dig(ofp,'weights.cargo')],['Payload',matching?.payload??dig(ofp,'weights.payload')],['ZFW',dig(ofp,'weights.est_zfw')],['TOW',dig(ofp,'weights.est_tow')],['LDW',dig(ofp,'weights.est_ldw')],['MTOW',dig(ofp,'weights.max_tow')],['MLW',dig(ofp,'weights.max_ldw')]];
 const depwx=getWeather(ofp,'origin').metar, arrwx=getWeather(ofp,'destination').metar;
 const ofpLayout=scalar(dig(ofp,'params.planformat','params.ofp_layout','params.layout','general.planformat','general.ofp_layout'),'—').toUpperCase();
 const dispatcher=scalar(dig(ofp,'general.dx_name','general.dispatcher','params.dispatcher'),'—');
 const fin=leafText(dig(ofp,'aircraft.fin','aircraft.fleet_number','aircraft.tail_fin'),'—'); const selcal=getSelcal(ofp); const {sid,star}=getProcedures(ofp);
 const cruise=`${scalar(dig(ofp,'general.cruise_tas'))} KT / M${scalar(dig(ofp,'general.cruise_mach'))}`;
 return <div className="ofp-release-frame ofp-scrollable-release">
  <section className="ofp-release-header"><div><span>{flight.airline}{flight.flightNumber}</span><strong>{flight.origin} → {flight.destination}</strong><small>{flight.aircraft} · {flight.registration} · REL {flight.release}</small></div><button onClick={copy}><Clipboard size={16}/>Copy ICAO FPL</button></section>
  <section className="card ofp-route-card ofp-route-card-standalone"><header><div><Route size={17}/><h3>Route & airports</h3></div></header><div className="card-body"><div className="route-briefing-text">{flight.route}</div><div className="ofp-route-strip"><div><span>DEP</span><strong>{flight.origin} · {flight.departureRunway}</strong><small>{sid}</small></div><div><span>ARR</span><strong>{flight.destination} · {flight.arrivalRunway}</strong><small>{star}</small></div><div><span>ALT</span><strong>{alternates}</strong><small>{scalar(dig(ofp,'alternate.plan_rwy'),'—')}</small></div></div></div></section>
  <div className="ofp-frame-grid ofp-detail-grid">
   <section className="card"><header><div><Clock3 size={17}/><h3>Schedule & profile</h3></div></header><div className="card-body"><Rows items={[["STD / STA",`${flight.schedOut} / ${flight.schedIn}`],["Block / ETE",`${flight.blockTime} / ${flight.ete}`],["Distance",flight.distance],["Cruise",`${flight.cruiseAltitude} · ${cruise}`],["Cost index",flight.costIndex]]}/></div></section>
   <section className="card"><header><div><Gauge size={17}/><h3>Release</h3></div></header><div className="card-body"><Rows items={[["Release / date",`${flight.release} · ${flight.flightDate}`],["Callsign",flight.callsign||`${flight.airline}${flight.flightNumber}`],["OFP format",ofpLayout],["Dispatcher",dispatcher]]}/></div></section>
   <section className="card"><header><div><Plane size={17}/><h3>Aircraft</h3></div></header><div className="card-body"><Rows items={[["Type",`${flight.aircraft} · ${scalar(dig(ofp,'aircraft.name'))}`],["Registration",flight.registration],["FIN / SELCAL",`${fin} / ${selcal}`],["Engines",scalar(dig(ofp,'aircraft.engines','aircraft.engine'))]]}/></div></section>
   <section className="card"><header><div><CloudSun size={17}/><h3>Weather</h3></div></header><div className="card-body ofp-weather-compact"><div><span>{flight.origin}</span><p>{depwx}</p></div><div><span>{flight.destination}</span><p>{arrwx}</p></div></div></section>
   <section className="card"><header><div><Fuel size={17}/><h3>Fuel plan</h3></div></header><div className="card-body"><Kpis items={fuel} units={flight.units}/></div></section>
   <section className="card"><header><div><Gauge size={17}/><h3>Weights & load</h3></div></header><div className="card-body"><Kpis items={weights} units={flight.units} countKeys={['Pax','Bags']}/></div></section>
   <section className="card ofp-bottom-card"><header><div><FileText size={17}/><h3>ICAO flight plan</h3></div><button onClick={copy}><Clipboard size={14}/>Copy</button></header><div className="card-body"><pre className="ofp-icao-line">{atc||'No ICAO flight plan available.'}</pre></div></section>
   <section className="card ofp-bottom-card"><header><div><ShieldCheck size={17}/><h3>Operational remarks</h3></div></header><div className="card-body"><div className="ofp-remarks-line">{remarks}</div></div></section>
  </div>
 </div>;
}
