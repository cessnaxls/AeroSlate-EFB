import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, CloudSun, FileText, Fuel, Plane, Plus, RotateCcw, Trash2 } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import type { Airport } from '../lib/dispatchlink';
import { airportMap, normalizeAirportCode } from '../lib/dispatchlink';
import { buildCustomOFP, type FuelProfile, type PlannerWeatherPayload } from '../lib/customPlanner';
import type { AnyRecord } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';
import { useSimTelemetry } from './SimPage';

const AIRPORTS = airportCatalog as Airport[];
const AIRPORT_MAP = airportMap(AIRPORTS);
const BLANK_PROFILE: FuelProfile = { id:'default', name:'', aircraft:'', registration:'', units:'LBS', cruiseTasKt:0, taxiFuel:0, climbFuel:0, climbMinutes:0, cruiseFlow:0, descentFuel:0, descentMinutes:0, holdingFlow:0, reserveMinutes:0, contingencyPct:0, usableFuel:0 };
interface LearnSample { at:number; fuel:number; altitude:number; vs:number; onGround:boolean; }
type FlightRules = '' | 'IFR' | 'VFR';
type Direction = '' | 'EAST' | 'WEST';

function numeric(value: string | number, fallback = 0) { const n=Number(value); return Number.isFinite(n)?n:fallback; }
function airportFor(value:string){ const code=normalizeAirportCode(value,AIRPORT_MAP); return AIRPORT_MAP.get(code) || null; }
function AirportInput({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){
  const found=airportFor(value); return <label className="planner-field"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value.toUpperCase())} maxLength={4} placeholder={placeholder}/><small>{found?`${found.name} · ${found.city}`:'ICAO or IATA'}</small></label>;
}
function profileNumber(profile: FuelProfile, key: keyof FuelProfile){ const value=profile[key]; return typeof value==='number' && value!==0 ? value : ''; }
function altitudeLabel(feet:number){ return feet>=18000 && feet%100===0 ? `FL${String(Math.round(feet/100)).padStart(3,'0')} · ${feet.toLocaleString()} ft` : `${feet.toLocaleString()} ft`; }
function altitudeOptions(rules:FlightRules,direction:Direction){
  if(!rules||!direction)return [] as number[];
  const values:number[]=[];
  // ForeFlight-style low-altitude list: 500-foot increments below 4,000 ft regardless of direction/rules.
  for(let altitude=1000;altitude<4000;altitude+=500)values.push(altitude);
  if(rules==='VFR'){
    const start=direction==='EAST'?5500:4500;
    for(let altitude=start;altitude<=17500;altitude+=2000)values.push(altitude);
  }else{
    const start=direction==='EAST'?5000:4000;
    for(let altitude=start;altitude<=45000;altitude+=2000)values.push(altitude);
  }
  return values;
}

function AltitudePicker({label,value,onChange,rules,onRulesChange,direction,onDirectionChange,optional=false}:{label:string;value:string;onChange:(v:string)=>void;rules:FlightRules;onRulesChange:(v:FlightRules)=>void;direction:Direction;onDirectionChange:(v:Direction)=>void;optional?:boolean}){
  const options=useMemo(()=>altitudeOptions(rules,direction),[rules,direction]);
  return <label className="planner-field altitude-picker-field"><span>{label}</span><details className="altitude-picker">
    <summary className={!value?'placeholder-select':''}>{value?altitudeLabel(Number(value)):(optional?'Select alternate altitude':'Select cruise altitude')}</summary>
    <div className="altitude-picker-menu">
      <div className="altitude-filter-row"><span>Rules</span><div className="segmented altitude-segmented"><button type="button" className={rules==='IFR'?'active':''} onClick={e=>{e.preventDefault();onRulesChange('IFR');onChange('')}}>IFR</button><button type="button" className={rules==='VFR'?'active':''} onClick={e=>{e.preventDefault();onRulesChange('VFR');onChange('')}}>VFR</button></div></div>
      <div className="altitude-filter-row"><span>Direction</span><div className="segmented altitude-segmented"><button type="button" className={direction==='EAST'?'active':''} onClick={e=>{e.preventDefault();onDirectionChange('EAST');onChange('')}}>Eastbound</button><button type="button" className={direction==='WEST'?'active':''} onClick={e=>{e.preventDefault();onDirectionChange('WEST');onChange('')}}>Westbound</button></div></div>
      <div className="altitude-option-list">{!rules||!direction?<small>Choose flight rules and direction to show valid altitudes.</small>:options.map(altitude=><button type="button" key={altitude} className={String(altitude)===value?'selected':''} onClick={e=>{onChange(String(altitude)); const details=(e.currentTarget.closest('details') as HTMLDetailsElement|null); if(details)details.open=false;}}>{altitudeLabel(altitude)}</button>)}</div>
    </div>
  </details><small>{rules&&direction?`${rules} · ${direction==='EAST'?'Eastbound':'Westbound'}`:'Choose rules + direction inside the altitude menu'}</small></label>;
}

export function FlightPlannerPage({ onLoadOFP, notify }:{onLoadOFP:(ofp:AnyRecord)=>void;notify:(message:string)=>void}){
  const [profiles,setProfiles]=useState<FuelProfile[]>(()=>loadLocal('aeroslate.planner.profiles',[BLANK_PROFILE]));
  const [profileId,setProfileId]=useState(()=>loadLocal('aeroslate.planner.profileId','default'));
  const profile=profiles.find(p=>p.id===profileId) || profiles[0] || BLANK_PROFILE;
  const updateProfile=(patch:Partial<FuelProfile>)=>setProfiles(current=>current.map(p=>p.id===profile.id?{...p,...patch}:p));
  useEffect(()=>{saveLocal('aeroslate.planner.profiles',profiles);saveLocal('aeroslate.planner.profileId',profileId)},[profiles,profileId]);

  const [profileOpen,setProfileOpen]=useState(()=>loadLocal('aeroslate.planner.profileOpen',true));
  useEffect(()=>saveLocal('aeroslate.planner.profileOpen',profileOpen),[profileOpen]);

  // v2 plan keys intentionally start blank so a new installation/update does not prefill editable fields.
  const [departure,setDeparture]=useState(()=>loadLocal('aeroslate.planner.v2.dep',''));
  const [destination,setDestination]=useState(()=>loadLocal('aeroslate.planner.v2.dest',''));
  const [alternate,setAlternate]=useState(()=>loadLocal('aeroslate.planner.v2.alt',''));
  const [flightRules,setFlightRules]=useState<FlightRules>(()=>loadLocal('aeroslate.planner.v2.rules',''));
  const [direction,setDirection]=useState<Direction>(()=>loadLocal('aeroslate.planner.v2.direction',''));
  const [cruiseAltitude,setCruiseAltitude]=useState(()=>loadLocal('aeroslate.planner.v2.cruise',''));
  const [alternateAltitude,setAlternateAltitude]=useState(()=>loadLocal('aeroslate.planner.v2.altCruise',''));
  const [alternateFlightRules,setAlternateFlightRules]=useState<FlightRules>(()=>loadLocal('aeroslate.planner.v2.altRules',''));
  const [alternateDirection,setAlternateDirection]=useState<Direction>(()=>loadLocal('aeroslate.planner.v2.altDirection',''));
  const [route,setRoute]=useState(()=>loadLocal('aeroslate.planner.v2.route',''));
  const [flightNumber,setFlightNumber]=useState(()=>loadLocal('aeroslate.planner.v2.flightNumber',''));
  const [schedOut,setSchedOut]=useState(()=>loadLocal('aeroslate.planner.v2.schedOut',''));
  const [busy,setBusy]=useState(false); const [weather,setWeather]=useState<PlannerWeatherPayload|null>(null);
  useEffect(()=>{saveLocal('aeroslate.planner.v2.dep',departure);saveLocal('aeroslate.planner.v2.dest',destination);saveLocal('aeroslate.planner.v2.alt',alternate);saveLocal('aeroslate.planner.v2.rules',flightRules);saveLocal('aeroslate.planner.v2.direction',direction);saveLocal('aeroslate.planner.v2.cruise',cruiseAltitude);saveLocal('aeroslate.planner.v2.altCruise',alternateAltitude);saveLocal('aeroslate.planner.v2.altRules',alternateFlightRules);saveLocal('aeroslate.planner.v2.altDirection',alternateDirection);saveLocal('aeroslate.planner.v2.route',route);saveLocal('aeroslate.planner.v2.flightNumber',flightNumber);saveLocal('aeroslate.planner.v2.schedOut',schedOut);},[departure,destination,alternate,flightRules,direction,cruiseAltitude,alternateAltitude,alternateFlightRules,alternateDirection,route,flightNumber,schedOut]);
  const clearPlan=()=>{setDeparture('');setDestination('');setAlternate('');setFlightRules('');setDirection('');setCruiseAltitude('');setAlternateAltitude('');setAlternateFlightRules('');setAlternateDirection('');setRoute('');setFlightNumber('');setSchedOut('');setWeather(null)};

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
    updateProfile({cruiseFlow:cruise||profile.cruiseFlow,climbFuel:climb&&profile.climbMinutes?climb*profile.climbMinutes/60:profile.climbFuel,descentFuel:descent&&profile.descentMinutes?descent*profile.descentMinutes/60:profile.descentFuel,learned:{samples:rows.length,flights:(profile.learned?.flights||0)+1,hours:(profile.learned?.hours||0)+(rows.at(-1)!.at-rows[0].at)/3600000,climbFlow:climb||profile.learned?.climbFlow,cruiseFlow:cruise||profile.learned?.cruiseFlow,descentFlow:descent||profile.learned?.descentFlow,updatedAt:new Date().toISOString()}}); notify('Simulator fuel observations were incorporated into this profile.');
  };

  const createProfile=()=>{const id=`profile-${Date.now()}`;const next={...BLANK_PROFILE,id};setProfiles(current=>[...current,next]);setProfileId(id);setProfileOpen(true)};
  const removeProfile=()=>{if(profiles.length<=1)return notify('Keep at least one fuel profile.');const next=profiles.filter(p=>p.id!==profile.id);setProfiles(next);setProfileId(next[0].id)};
  const valid=useMemo(()=>Boolean(airportFor(departure)&&airportFor(destination)&&numeric(cruiseAltitude)>0&&profile.cruiseTasKt>0&&profile.cruiseFlow>0),[departure,destination,cruiseAltitude,profile]);

  const generate=async()=>{
    const dep=airportFor(departure),dest=airportFor(destination),alt=alternate.trim()?airportFor(alternate):null;
    if(!dep||!dest)return notify('Enter valid departure and destination airports.'); if(alternate.trim()&&!alt)return notify('Enter a valid alternate or leave it blank.');
    setBusy(true); try{
      const ids=[dep.icao,dest.icao,...(alt?[alt.icao]:[])]; const windStations=[dep.iata||dep.icao.slice(-3),dest.iata||dest.icao.slice(-3),...(alt?[alt.iata||alt.icao.slice(-3)]:[])];
      const q=new URLSearchParams({ids:ids.join(','),windStations:windStations.join(','),altitudes:[cruiseAltitude,alternateAltitude||'6000'].join(',')}); const response=await fetch(`/api/planner/weather?${q}`,{cache:'no-store'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Weather retrieval failed.'); setWeather(data);
      const ofp=buildCustomOFP({departure:dep,destination:dest,alternate:alt,cruiseAltitudeFt:numeric(cruiseAltitude),alternateAltitudeFt:numeric(alternateAltitude,6000),route:route.trim()||'DCT',flightNumber:flightNumber.trim()||profile.registration||'CUSTOM',schedOut:schedOut.trim()||`${String(new Date().getUTCHours()).padStart(2,'0')}:${String(new Date().getUTCMinutes()).padStart(2,'0')}`,flightDate:new Date().toISOString().slice(0,10)},profile,data); onLoadOFP(ofp); notify(`Generated ${dep.icao}–${dest.icao} with the ${profile.name||profile.aircraft||'selected'} fuel profile and loaded it across AeroSlate.`);
    }catch(error){notify(error instanceof Error?error.message:'Unable to generate custom OFP.')}finally{setBusy(false)}
  };

  return <div className="custom-planner-page">
    <section className={`card planner-profile-card ${profileOpen?'':'collapsed'}`}><header><div><Fuel size={18}/><h3>Aircraft fuel profiles</h3></div><div className="header-actions"><button onClick={createProfile}><Plus size={15}/>New</button><button onClick={removeProfile}><Trash2 size={15}/>Delete</button><button className="profile-collapse-button" aria-expanded={profileOpen} onClick={()=>setProfileOpen(value=>!value)}><ChevronDown size={16}/>{profileOpen?'Collapse':'Expand'}</button></div></header>{profileOpen&&<div className="card-body custom-profile-layout">
      <div className="profile-selector"><label><span>Profile</span><select value={profile.id} onChange={e=>setProfileId(e.target.value)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name||p.aircraft||'Untitled profile'}</option>)}</select></label><label><span>Profile name</span><input value={profile.name} onChange={e=>updateProfile({name:e.target.value})} placeholder="e.g. C172 economy"/></label><label><span>Aircraft</span><input value={profile.aircraft} onChange={e=>updateProfile({aircraft:e.target.value.toUpperCase()})} placeholder="e.g. C172"/></label><label><span>Registration</span><input value={profile.registration} onChange={e=>updateProfile({registration:e.target.value.toUpperCase()})} placeholder="e.g. N123AB"/></label><label><span>Units</span><select value={profile.units} onChange={e=>updateProfile({units:e.target.value as 'LBS'|'KGS'})}><option>LBS</option><option>KGS</option></select></label></div>
      <div className="fuel-profile-grid">{[
        ['Cruise TAS', 'cruiseTasKt','kt','120'],['Taxi fuel','taxiFuel',profile.units,'25'],['Climb fuel','climbFuel',profile.units,'80'],['Climb time','climbMinutes','min','12'],['Cruise flow','cruiseFlow',`${profile.units}/hr`,'55'],['Descent fuel','descentFuel',profile.units,'25'],['Descent time','descentMinutes','min','10'],['Holding flow','holdingFlow',`${profile.units}/hr`,'45'],['Final reserve','reserveMinutes','min','45'],['Contingency','contingencyPct','%','5'],['Usable fuel','usableFuel',profile.units,'300']
      ].map(([label,key,suffix,prompt])=><label key={key}><span>{label}</span><div><input type="number" step="any" value={profileNumber(profile,key as keyof FuelProfile)} placeholder={prompt} onChange={e=>updateProfile({[key]:numeric(e.target.value)} as any)}/><small>{suffix}</small></div></label>)}</div>
      <div className={`learning-panel ${learning?'active':''}`}><div><Activity size={18}/><span><strong>Learn from simulator</strong><small>{profile.learned?.samples?`${profile.learned.samples} samples · ${profile.learned.flights} session${profile.learned.flights===1?'':'s'} · ${profile.learned.hours.toFixed(1)} hr observed`:'No learned data yet. Manual values remain authoritative until observations are collected.'}</small></span></div><button className={learning?'danger-button':'primary'} disabled={!linked&&!learning} onClick={()=>{if(learning)stopLearning();else{samples.current=[];lastSample.current=0;setLearning(true)}}}>{learning?'Stop & update profile':linked?'Start learning':'Simulator offline'}</button></div>
    </div>}</section>

    <section className="card custom-plan-card"><header><div><Plane size={18}/><h3>AeroSlate flight planner</h3></div><div className="header-actions"><button onClick={clearPlan}><RotateCcw size={15}/>New plan</button><span className="pill blue">CUSTOM OFP</span></div></header><div className="card-body">
      <div className="custom-plan-grid">
        <label className="planner-field planner-profile-select"><span>Aircraft profile</span><select value={profile.id} onChange={e=>setProfileId(e.target.value)}><option value="" disabled>Select aircraft profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name||p.aircraft||'Untitled profile'}</option>)}</select><small>{profile.aircraft||profile.registration?`${profile.aircraft||'Aircraft'}${profile.registration?` · ${profile.registration}`:''}`:'Fuel and performance source'}</small></label>
        <AirportInput label="Departure" value={departure} onChange={setDeparture} placeholder="e.g. KIND"/>
        <AirportInput label="Destination" value={destination} onChange={setDestination} placeholder="e.g. KORD"/>
        <AirportInput label="Alternate (optional)" value={alternate} onChange={setAlternate} placeholder="e.g. KSBN"/>
        <AltitudePicker label="Cruise altitude" value={cruiseAltitude} onChange={setCruiseAltitude} rules={flightRules} onRulesChange={setFlightRules} direction={direction} onDirectionChange={setDirection}/>
        <AltitudePicker label="Alternate cruise" value={alternateAltitude} onChange={setAlternateAltitude} rules={alternateFlightRules} onRulesChange={setAlternateFlightRules} direction={alternateDirection} onDirectionChange={setAlternateDirection} optional/>
        <label className="planner-field"><span>Flight / callsign</span><input value={flightNumber} onChange={e=>setFlightNumber(e.target.value.toUpperCase())} placeholder="e.g. AS001"/><small>Used on the generated release</small></label>
        <label className="planner-field"><span>STD (Zulu)</span><input value={schedOut} onChange={e=>setSchedOut(e.target.value)} placeholder="e.g. 14:30" inputMode="numeric"/><small>HH:MM Zulu</small></label>
        <label className="planner-field route-field"><span>Route</span><input value={route} onChange={e=>setRoute(e.target.value.toUpperCase())} placeholder="e.g. DCT or route string"/><small>Route text is preserved in the OFP; fuel/time uses great-circle distance in this version.</small></label>
      </div>
      <div className="planner-generate-row"><div><CloudSun size={18}/><span><strong>Live weather planning</strong><small>AviationWeather.gov METAR/TAF plus official U.S. FD winds/temps where available. Missing or stale data is flagged rather than invented.</small></span></div><button className="primary" disabled={!valid||busy} onClick={()=>void generate()}>{busy?<><Activity className="spin" size={16}/>Building plan…</>:<><FileText size={16}/>Generate & load OFP</>}</button></div>
      {weather&&<div className="planner-weather-status"><strong>Weather loaded</strong><span>{weather.source} · {new Date(weather.fetchedAt).toLocaleString()}</span>{weather.warnings?.map((warning,i)=><small key={i}>{warning}</small>)}</div>}
    </div></section>
  </div>;
}
