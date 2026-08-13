import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CloudSun, FileText, Fuel, Plane, Plus, Save, Trash2 } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import type { Airport } from '../lib/dispatchlink';
import { airportMap, normalizeAirportCode } from '../lib/dispatchlink';
import { buildCustomOFP, type FuelProfile, type PlannerWeatherPayload } from '../lib/customPlanner';
import type { AnyRecord } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';
import { useSimTelemetry } from './SimPage';

const AIRPORTS = airportCatalog as Airport[];
const AIRPORT_MAP = airportMap(AIRPORTS);
const DEFAULT_PROFILE: FuelProfile = { id:'default', name:'New aircraft profile', aircraft:'', registration:'', units:'LBS', cruiseTasKt:120, taxiFuel:25, climbFuel:80, climbMinutes:12, cruiseFlow:55, descentFuel:25, descentMinutes:10, holdingFlow:45, reserveMinutes:45, contingencyPct:5, usableFuel:300 };
interface LearnSample { at:number; fuel:number; altitude:number; vs:number; onGround:boolean; }

function numeric(value: string | number, fallback = 0) { const n=Number(value); return Number.isFinite(n)?n:fallback; }
function airportFor(value:string){ const code=normalizeAirportCode(value,AIRPORT_MAP); return AIRPORT_MAP.get(code) || null; }
function AirportInput({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  const found=airportFor(value); return <label className="planner-field"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value.toUpperCase())} maxLength={4} placeholder="KIND"/><small>{found?`${found.name} · ${found.city}`:'Enter ICAO or IATA'}</small></label>;
}

export function FlightPlannerPage({ onLoadOFP, notify }:{onLoadOFP:(ofp:AnyRecord)=>void;notify:(message:string)=>void}){
  const [profiles,setProfiles]=useState<FuelProfile[]>(()=>loadLocal('aeroslate.planner.profiles',[DEFAULT_PROFILE]));
  const [profileId,setProfileId]=useState(()=>loadLocal('aeroslate.planner.profileId','default'));
  const profile=profiles.find(p=>p.id===profileId) || profiles[0] || DEFAULT_PROFILE;
  const updateProfile=(patch:Partial<FuelProfile>)=>setProfiles(current=>current.map(p=>p.id===profile.id?{...p,...patch}:p));
  useEffect(()=>{saveLocal('aeroslate.planner.profiles',profiles);saveLocal('aeroslate.planner.profileId',profileId)},[profiles,profileId]);

  const [departure,setDeparture]=useState(()=>loadLocal('aeroslate.planner.dep','KIND'));
  const [destination,setDestination]=useState(()=>loadLocal('aeroslate.planner.dest',''));
  const [alternate,setAlternate]=useState(()=>loadLocal('aeroslate.planner.alt',''));
  const [cruiseAltitude,setCruiseAltitude]=useState(()=>loadLocal('aeroslate.planner.cruise','10000'));
  const [alternateAltitude,setAlternateAltitude]=useState(()=>loadLocal('aeroslate.planner.altCruise','6000'));
  const [route,setRoute]=useState(()=>loadLocal('aeroslate.planner.route','DCT'));
  const [flightNumber,setFlightNumber]=useState(()=>loadLocal('aeroslate.planner.flightNumber','AS001'));
  const [schedOut,setSchedOut]=useState(()=>loadLocal('aeroslate.planner.schedOut',`${String(new Date().getUTCHours()).padStart(2,'0')}:${String(new Date().getUTCMinutes()).padStart(2,'0')}`));
  const [busy,setBusy]=useState(false); const [weather,setWeather]=useState<PlannerWeatherPayload|null>(null);
  useEffect(()=>{saveLocal('aeroslate.planner.dep',departure);saveLocal('aeroslate.planner.dest',destination);saveLocal('aeroslate.planner.alt',alternate);saveLocal('aeroslate.planner.cruise',cruiseAltitude);saveLocal('aeroslate.planner.altCruise',alternateAltitude);saveLocal('aeroslate.planner.route',route);saveLocal('aeroslate.planner.flightNumber',flightNumber);saveLocal('aeroslate.planner.schedOut',schedOut);},[departure,destination,alternate,cruiseAltitude,alternateAltitude,route,flightNumber,schedOut]);

  const {telemetry,linked}=useSimTelemetry(); const [learning,setLearning]=useState(false); const samples=useRef<LearnSample[]>([]); const lastSample=useRef(0);
  useEffect(()=>{
    if(!learning||!linked||!telemetry||typeof telemetry.totalFuelLb!=='number')return;
    const now=Date.now(); if(now-lastSample.current<10000)return; lastSample.current=now;
    const fuel=profile.units==='KGS'?Number(telemetry.totalFuelKg||0):Number(telemetry.totalFuelLb||0);
    samples.current.push({at:now,fuel,altitude:Number(telemetry.altitudeMslFt||0),vs:Number(telemetry.verticalSpeedFpm||0),onGround:Boolean(telemetry.onGround)});
  },[learning,linked,telemetry,profile.units]);
  const stopLearning=()=>{
    setLearning(false); const rows=samples.current; samples.current=[]; if(rows.length<3){notify('Not enough simulator samples were collected.');return;}
    const buckets:{climb:number[];cruise:number[];descent:number[];ground:number[]}={climb:[],cruise:[],descent:[],ground:[]};
    for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];const hours=(b.at-a.at)/3600000;if(hours<=0)continue;const burn=a.fuel-b.fuel;if(burn<0||burn/hours>100000)continue;const flow=burn/hours;const bucket=b.onGround?'ground':b.vs>300?'climb':b.vs<-300?'descent':'cruise';buckets[bucket].push(flow)}
    const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0; const cruise=avg(buckets.cruise); const climb=avg(buckets.climb); const descent=avg(buckets.descent);
    updateProfile({cruiseFlow:cruise||profile.cruiseFlow,climbFuel:climb?climb*profile.climbMinutes/60:profile.climbFuel,descentFuel:descent?descent*profile.descentMinutes/60:profile.descentFuel,learned:{samples:rows.length,flights:(profile.learned?.flights||0)+1,hours:(profile.learned?.hours||0)+(rows.at(-1)!.at-rows[0].at)/3600000,climbFlow:climb||profile.learned?.climbFlow,cruiseFlow:cruise||profile.learned?.cruiseFlow,descentFlow:descent||profile.learned?.descentFlow,updatedAt:new Date().toISOString()}}); notify('Simulator fuel observations were incorporated into this profile.');
  };

  const createProfile=()=>{const id=`profile-${Date.now()}`;const next={...DEFAULT_PROFILE,id,name:'New aircraft profile'};setProfiles(current=>[...current,next]);setProfileId(id)};
  const removeProfile=()=>{if(profiles.length<=1)return notify('Keep at least one fuel profile.');const next=profiles.filter(p=>p.id!==profile.id);setProfiles(next);setProfileId(next[0].id)};
  const valid=useMemo(()=>Boolean(airportFor(departure)&&airportFor(destination)&&numeric(cruiseAltitude)>0&&profile.cruiseTasKt>0&&profile.cruiseFlow>0),[departure,destination,cruiseAltitude,profile]);

  const generate=async()=>{
    const dep=airportFor(departure),dest=airportFor(destination),alt=alternate.trim()?airportFor(alternate):null;
    if(!dep||!dest)return notify('Enter valid departure and destination airports.'); if(alternate.trim()&&!alt)return notify('Enter a valid alternate or leave it blank.');
    setBusy(true); try{
      const ids=[dep.icao,dest.icao,...(alt?[alt.icao]:[])]; const windStations=[dep.iata||dep.icao.slice(-3),dest.iata||dest.icao.slice(-3),...(alt?[alt.iata||alt.icao.slice(-3)]:[])];
      const q=new URLSearchParams({ids:ids.join(','),windStations:windStations.join(','),altitudes:[cruiseAltitude,alternateAltitude].join(',')}); const response=await fetch(`/api/planner/weather?${q}`,{cache:'no-store'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Weather retrieval failed.'); setWeather(data);
      const ofp=buildCustomOFP({departure:dep,destination:dest,alternate:alt,cruiseAltitudeFt:numeric(cruiseAltitude),alternateAltitudeFt:numeric(alternateAltitude,6000),route,flightNumber,schedOut,flightDate:new Date().toISOString().slice(0,10)},profile,data); onLoadOFP(ofp); notify(`Generated ${dep.icao}–${dest.icao} with the ${profile.name} fuel profile and loaded it across AeroSlate.`);
    }catch(error){notify(error instanceof Error?error.message:'Unable to generate custom OFP.')}finally{setBusy(false)}
  };

  return <div className="custom-planner-page">
    <section className="card planner-profile-card"><header><div><Fuel size={18}/><h3>Aircraft fuel profiles</h3></div><div className="header-actions"><button onClick={createProfile}><Plus size={15}/>New</button><button onClick={removeProfile}><Trash2 size={15}/>Delete</button></div></header><div className="card-body custom-profile-layout">
      <div className="profile-selector"><label><span>Profile</span><select value={profile.id} onChange={e=>setProfileId(e.target.value)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>Profile name</span><input value={profile.name} onChange={e=>updateProfile({name:e.target.value})}/></label><label><span>Aircraft</span><input value={profile.aircraft} onChange={e=>updateProfile({aircraft:e.target.value.toUpperCase()})} placeholder="C172"/></label><label><span>Registration</span><input value={profile.registration} onChange={e=>updateProfile({registration:e.target.value.toUpperCase()})} placeholder="N123AB"/></label><label><span>Units</span><select value={profile.units} onChange={e=>updateProfile({units:e.target.value as 'LBS'|'KGS'})}><option>LBS</option><option>KGS</option></select></label></div>
      <div className="fuel-profile-grid">{[
        ['Cruise TAS', 'cruiseTasKt','kt'],['Taxi fuel','taxiFuel',profile.units],['Climb fuel','climbFuel',profile.units],['Climb time','climbMinutes','min'],['Cruise flow','cruiseFlow',`${profile.units}/hr`],['Descent fuel','descentFuel',profile.units],['Descent time','descentMinutes','min'],['Holding flow','holdingFlow',`${profile.units}/hr`],['Final reserve','reserveMinutes','min'],['Contingency','contingencyPct','%'],['Usable fuel','usableFuel',profile.units]
      ].map(([label,key,suffix])=><label key={key}><span>{label}</span><div><input type="number" step="any" value={(profile as any)[key]} onChange={e=>updateProfile({[key]:numeric(e.target.value)} as any)}/><small>{suffix}</small></div></label>)}</div>
      <div className={`learning-panel ${learning?'active':''}`}><div><Activity size={18}/><span><strong>Learn from simulator</strong><small>{profile.learned?.samples?`${profile.learned.samples} samples · ${profile.learned.flights} session${profile.learned.flights===1?'':'s'} · ${profile.learned.hours.toFixed(1)} hr observed`:'No learned data yet. Manual values remain authoritative until observations are collected.'}</small></span></div><button className={learning?'danger-button':'primary'} disabled={!linked&&!learning} onClick={()=>{if(learning)stopLearning();else{samples.current=[];lastSample.current=0;setLearning(true)}}}>{learning?'Stop & update profile':linked?'Start learning':'Simulator offline'}</button></div>
    </div></section>

    <section className="card custom-plan-card"><header><div><Plane size={18}/><h3>AeroSlate flight planner</h3></div><span className="pill blue">CUSTOM OFP</span></header><div className="card-body">
      <div className="custom-plan-grid"><AirportInput label="Departure" value={departure} onChange={setDeparture}/><AirportInput label="Destination" value={destination} onChange={setDestination}/><AirportInput label="Alternate (optional)" value={alternate} onChange={setAlternate}/><label className="planner-field"><span>Cruise altitude</span><input type="number" value={cruiseAltitude} onChange={e=>setCruiseAltitude(e.target.value)}/><small>feet MSL</small></label><label className="planner-field"><span>Alternate cruise</span><input type="number" value={alternateAltitude} onChange={e=>setAlternateAltitude(e.target.value)}/><small>feet MSL</small></label><label className="planner-field"><span>Flight / callsign</span><input value={flightNumber} onChange={e=>setFlightNumber(e.target.value.toUpperCase())}/><small>Used on the generated release</small></label><label className="planner-field"><span>STD (Zulu)</span><input type="time" value={schedOut} onChange={e=>setSchedOut(e.target.value)}/><small>Planned departure</small></label><label className="planner-field route-field"><span>Route</span><input value={route} onChange={e=>setRoute(e.target.value.toUpperCase())} placeholder="DCT or route string"/><small>Route text is preserved in the OFP; fuel/time uses great-circle distance in this version.</small></label></div>
      <div className="planner-generate-row"><div><CloudSun size={18}/><span><strong>Live weather planning</strong><small>AviationWeather.gov METAR/TAF plus official U.S. FD winds/temps where available. Missing or stale data is flagged rather than invented.</small></span></div><button className="primary" disabled={!valid||busy} onClick={()=>void generate()}>{busy?<><Activity className="spin" size={16}/>Building plan…</>:<><FileText size={16}/>Generate & load OFP</>}</button></div>
      {weather&&<div className="planner-weather-status"><strong>Weather loaded</strong><span>{weather.source} · {new Date(weather.fetchedAt).toLocaleString()}</span>{weather.warnings?.map((warning,i)=><small key={i}>{warning}</small>)}</div>}
    </div></section>
  </div>;
}
