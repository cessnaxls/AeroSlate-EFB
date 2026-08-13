import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, CloudSun, FileText, Fuel, Import, Plane, Plus, RotateCcw, Trash2 } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import type { Airport } from '../lib/dispatchlink';
import { airportMap, normalizeAirportCode } from '../lib/dispatchlink';
import { buildCustomOFP, type FuelProfile, type PlannerWeatherPayload, type CruisePerformancePoint, type PhasePerformancePoint } from '../lib/customPlanner';
import { dig, type AnyRecord } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';
import { useSimTelemetry } from './SimPage';

const AIRPORTS = airportCatalog as Airport[];
const AIRPORT_MAP = airportMap(AIRPORTS);
const BLANK_PROFILE: FuelProfile = { id:'default', name:'', aircraft:'', registration:'', units:'LBS', cruiseTasKt:0, taxiFuel:0, climbFuel:0, climbMinutes:0, cruiseFlow:0, descentFuel:0, descentMinutes:0, holdingFlow:0, reserveMinutes:0, contingencyPct:0, usableFuel:0, defaultWeight:0, cruisePoints:[], climbPoints:[], descentPoints:[] };
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


function PerformanceTable({title,kind,rows,units,onChange}:{title:string;kind:'cruise'|'phase';rows:(CruisePerformancePoint|PhasePerformancePoint)[];units:'LBS'|'KGS';onChange:(rows:any[])=>void}){
  const add=()=>onChange([...rows,kind==='cruise'?{altitudeFt:0,weight:0,isaDevC:0,tasKt:0,fuelFlow:0}:{altitudeFt:0,weight:0,isaDevC:0,minutes:0,fuel:0,distanceNm:0}]);
  const set=(i:number,key:string,value:string)=>onChange(rows.map((r,j)=>j===i?{...r,[key]:numeric(value)}:r));
  const remove=(i:number)=>onChange(rows.filter((_,j)=>j!==i));
  return <div className="performance-table"><div className="performance-table-head"><div><strong>{title}</strong><small>{kind==='cruise'?'Enter POH/AFM cruise points. AeroSlate interpolates altitude, weight and ISA deviation.':'Enter cumulative values from departure/destination to the selected altitude.'}</small></div><button type="button" onClick={add}><Plus size={14}/>Add point</button></div>
    <div className={`performance-grid ${kind}`}><div className="performance-grid-labels"><span>Altitude ft</span><span>Weight {units}</span><span>ISA dev °C</span>{kind==='cruise'?<><span>TAS kt</span><span>Fuel/hr</span></>:<><span>Minutes</span><span>Fuel {units}</span><span>Distance NM</span></>}<span/></div>
    {rows.length===0?<div className="performance-empty">No points yet — add values directly from the aircraft POH/AFM or a trusted performance source.</div>:rows.map((row:any,i)=><div className="performance-grid-row" key={i}><input type="number" placeholder="e.g. 25000" value={row.altitudeFt||''} onChange={e=>set(i,'altitudeFt',e.target.value)}/><input type="number" placeholder="e.g. 24000" value={row.weight||''} onChange={e=>set(i,'weight',e.target.value)}/><input type="number" placeholder="e.g. 10" value={row.isaDevC||''} onChange={e=>set(i,'isaDevC',e.target.value)}/>{kind==='cruise'?<><input type="number" placeholder="e.g. 310" value={row.tasKt||''} onChange={e=>set(i,'tasKt',e.target.value)}/><input type="number" placeholder="e.g. 700" value={row.fuelFlow||''} onChange={e=>set(i,'fuelFlow',e.target.value)}/></>:<><input type="number" placeholder="e.g. 18" value={row.minutes||''} onChange={e=>set(i,'minutes',e.target.value)}/><input type="number" placeholder="e.g. 250" value={row.fuel||''} onChange={e=>set(i,'fuel',e.target.value)}/><input type="number" placeholder="e.g. 65" value={row.distanceNm||''} onChange={e=>set(i,'distanceNm',e.target.value)}/></>}<button className="icon-button" type="button" aria-label="Remove point" onClick={()=>remove(i)}><Trash2 size={14}/></button></div>)}</div>
  </div>;
}

export function FlightPlannerPage({ onLoadOFP, onFetchSimBriefOFP, notify }:{onLoadOFP:(ofp:AnyRecord)=>void;onFetchSimBriefOFP:()=>Promise<AnyRecord|null>;notify:(message:string)=>void}){
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
  const [plannedWeight,setPlannedWeight]=useState(()=>loadLocal('aeroslate.planner.v3.weight',''));
  const [busy,setBusy]=useState(false); const [weather,setWeather]=useState<PlannerWeatherPayload|null>(null);
  useEffect(()=>{saveLocal('aeroslate.planner.v2.dep',departure);saveLocal('aeroslate.planner.v2.dest',destination);saveLocal('aeroslate.planner.v2.alt',alternate);saveLocal('aeroslate.planner.v2.rules',flightRules);saveLocal('aeroslate.planner.v2.direction',direction);saveLocal('aeroslate.planner.v2.cruise',cruiseAltitude);saveLocal('aeroslate.planner.v2.altCruise',alternateAltitude);saveLocal('aeroslate.planner.v2.altRules',alternateFlightRules);saveLocal('aeroslate.planner.v2.altDirection',alternateDirection);saveLocal('aeroslate.planner.v2.route',route);saveLocal('aeroslate.planner.v2.flightNumber',flightNumber);saveLocal('aeroslate.planner.v2.schedOut',schedOut);saveLocal('aeroslate.planner.v3.weight',plannedWeight);},[departure,destination,alternate,flightRules,direction,cruiseAltitude,alternateAltitude,alternateFlightRules,alternateDirection,route,flightNumber,schedOut,plannedWeight]);
  const clearPlan=()=>{setDeparture('');setDestination('');setAlternate('');setFlightRules('');setDirection('');setCruiseAltitude('');setAlternateAltitude('');setAlternateFlightRules('');setAlternateDirection('');setRoute('');setFlightNumber('');setSchedOut('');setPlannedWeight('');setWeather(null)};
  const [importingSimBrief,setImportingSimBrief]=useState(false);
  const applySimBriefPlan=(data:AnyRecord)=>{
    const dep=String(dig(data,'origin.icao_code','params.orig')||'').toUpperCase();
    const dest=String(dig(data,'destination.icao_code','params.dest')||'').toUpperCase();
    const alt=String(dig(data,'alternate.icao_code','params.altn')||'').toUpperCase();
    const importedRoute=String(dig(data,'general.route','params.route')||'').trim().toUpperCase();
    if(!dep||!dest)throw new Error('The SimBrief OFP does not contain a valid departure and destination.');
    setDeparture(dep); setDestination(dest); setAlternate(alt); setRoute(importedRoute||'DCT');
    const importedFlight=String(dig(data,'general.flight_number','general.callsign')||'').trim().toUpperCase();
    if(importedFlight)setFlightNumber(importedFlight);
    const importedCruise=numeric(String(dig(data,'general.initial_altitude','params.initial_altitude')||''));
    if(importedCruise>0)setCruiseAltitude(String(importedCruise));
    const importedAltCruise=numeric(String(dig(data,'alternate.cruise_altitude')||''));
    if(importedAltCruise>0)setAlternateAltitude(String(importedAltCruise));
    const importedTow=numeric(String(dig(data,'weights.est_takeoff_weight','weights.est_tow','weights.takeoff')||'')); if(importedTow>0)setPlannedWeight(String(importedTow));
    const rawStd=dig<any>(data,'times.sched_out','times.sched_out_time');
    if(rawStd!==undefined&&rawStd!==null){
      const text=String(rawStd);
      if(/^\d{1,2}:\d{2}$/.test(text))setSchedOut(text.padStart(5,'0'));
      else if(/^\d+$/.test(text)){const seconds=Number(text);if(Number.isFinite(seconds)){const d=new Date(seconds*1000);setSchedOut(`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`)}}
    }
    setWeather(null);
    notify(`Imported ${dep}–${dest}${alt?` via alternate ${alt}`:''} from SimBrief. Select your AeroSlate aircraft profile and generate the new OFP.`);
  };
  const importSimBriefPlan=async()=>{
    setImportingSimBrief(true);
    try{const data=await onFetchSimBriefOFP();if(data)applySimBriefPlan(data)}
    catch(error){notify(error instanceof Error?error.message:'Unable to import SimBrief plan data.')}
    finally{setImportingSimBrief(false)}
  };

  const {linked}=useSimTelemetry();
  const [learning,setLearning]=useState(false);
  const [learningStatus,setLearningStatus]=useState<{samples:number;hours:number;linked?:boolean}>({samples:0,hours:0});
  const refreshLearning=async()=>{try{const r=await fetch('/api/sim/learning/status',{cache:'no-store'});const d=await r.json();setLearning(Boolean(d.active));setLearningStatus({samples:Number(d.samples||0),hours:Number(d.hours||0),linked:Boolean(d.linked)});}catch{}};
  useEffect(()=>{void refreshLearning();const timer=window.setInterval(()=>void refreshLearning(),5000);return()=>window.clearInterval(timer)},[]);
  const startLearning=async()=>{try{const r=await fetch('/api/sim/learning/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileId:profile.id,units:profile.units})});if(!r.ok)throw new Error('Unable to start simulator learning.');setLearning(true);setLearningStatus({samples:0,hours:0,linked});notify('Server-side simulator learning started. It will continue if AeroSlate is backgrounded or closed.');}catch(error){notify(error instanceof Error?error.message:'Unable to start simulator learning.')}};
  const stopLearning=async()=>{try{const r=await fetch('/api/sim/learning/stop',{method:'POST'});const d=await r.json();setLearning(false);setLearningStatus({samples:Number(d.samples||0),hours:Number(d.hours||0),linked});if(Number(d.samples||0)<3){notify('Not enough simulator samples were collected.');return;}const cruise=Number(d.cruiseFlow||0),climb=Number(d.climbFlow||0),descent=Number(d.descentFlow||0);updateProfile({cruiseFlow:cruise||profile.cruiseFlow,climbFuel:climb&&profile.climbMinutes?climb*profile.climbMinutes/60:profile.climbFuel,descentFuel:descent&&profile.descentMinutes?descent*profile.descentMinutes/60:profile.descentFuel,learned:{samples:Number(d.samples||0),flights:(profile.learned?.flights||0)+1,hours:(profile.learned?.hours||0)+Number(d.hours||0),climbFlow:climb||profile.learned?.climbFlow,cruiseFlow:cruise||profile.learned?.cruiseFlow,descentFlow:descent||profile.learned?.descentFlow,updatedAt:new Date().toISOString()}});notify('Background simulator observations were incorporated into this profile.');}catch(error){notify(error instanceof Error?error.message:'Unable to stop simulator learning.')}};

  const createProfile=()=>{const id=`profile-${Date.now()}`;const next={...BLANK_PROFILE,id};setProfiles(current=>[...current,next]);setProfileId(id);setProfileOpen(true)};
  const removeProfile=()=>{if(profiles.length<=1)return notify('Keep at least one fuel profile.');const next=profiles.filter(p=>p.id!==profile.id);setProfiles(next);setProfileId(next[0].id)};
  const valid=useMemo(()=>Boolean(airportFor(departure)&&airportFor(destination)&&numeric(cruiseAltitude)>0&&((profile.cruisePoints?.some(p=>p.tasKt>0&&p.fuelFlow>0))||(profile.cruiseTasKt>0&&profile.cruiseFlow>0))),[departure,destination,cruiseAltitude,profile]);

  const generate=async()=>{
    const dep=airportFor(departure),dest=airportFor(destination),alt=alternate.trim()?airportFor(alternate):null;
    if(!dep||!dest)return notify('Enter valid departure and destination airports.'); if(alternate.trim()&&!alt)return notify('Enter a valid alternate or leave it blank.');
    setBusy(true); try{
      const ids=[dep.icao,dest.icao,...(alt?[alt.icao]:[])]; const windStations=[dep.iata||dep.icao.slice(-3),dest.iata||dest.icao.slice(-3),...(alt?[alt.iata||alt.icao.slice(-3)]:[])];
      const q=new URLSearchParams({ids:ids.join(','),windStations:windStations.join(','),altitudes:[cruiseAltitude,alternateAltitude||'6000'].join(',')}); const response=await fetch(`/api/planner/weather?${q}`,{cache:'no-store'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Weather retrieval failed.'); setWeather(data);
      const ofp=buildCustomOFP({departure:dep,destination:dest,alternate:alt,cruiseAltitudeFt:numeric(cruiseAltitude),alternateAltitudeFt:numeric(alternateAltitude,6000),route:route.trim()||'DCT',flightNumber:flightNumber.trim()||profile.registration||'CUSTOM',schedOut:schedOut.trim()||`${String(new Date().getUTCHours()).padStart(2,'0')}:${String(new Date().getUTCMinutes()).padStart(2,'0')}`,flightDate:new Date().toISOString().slice(0,10),plannedTakeoffWeight:numeric(plannedWeight,profile.defaultWeight||0)},profile,data); onLoadOFP(ofp); notify(`Generated ${dep.icao}–${dest.icao} with the ${profile.name||profile.aircraft||'selected'} fuel profile and loaded it across AeroSlate.`);
    }catch(error){notify(error instanceof Error?error.message:'Unable to generate custom OFP.')}finally{setBusy(false)}
  };

  return <div className="custom-planner-page">
    <section className={`card planner-profile-card ${profileOpen?'':'collapsed'}`}><header><div><Fuel size={18}/><h3>Aircraft fuel profiles</h3></div><div className="header-actions"><button onClick={createProfile}><Plus size={15}/>New</button><button onClick={removeProfile}><Trash2 size={15}/>Delete</button><button className="profile-collapse-button" aria-expanded={profileOpen} onClick={()=>setProfileOpen(value=>!value)}><ChevronDown size={16}/>{profileOpen?'Collapse':'Expand'}</button></div></header>{profileOpen&&<div className="card-body custom-profile-layout">
      <div className="profile-selector"><label><span>Profile</span><select value={profile.id} onChange={e=>setProfileId(e.target.value)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name||p.aircraft||'Untitled profile'}</option>)}</select></label><label><span>Profile name</span><input value={profile.name} onChange={e=>updateProfile({name:e.target.value})} placeholder="e.g. C172 economy"/></label><label><span>Aircraft</span><input value={profile.aircraft} onChange={e=>updateProfile({aircraft:e.target.value.toUpperCase()})} placeholder="e.g. C172"/></label><label><span>Registration</span><input value={profile.registration} onChange={e=>updateProfile({registration:e.target.value.toUpperCase()})} placeholder="e.g. N123AB"/></label><label><span>Units</span><select value={profile.units} onChange={e=>updateProfile({units:e.target.value as 'LBS'|'KGS'})}><option>LBS</option><option>KGS</option></select></label></div>
      <div className="profile-essentials">
        <label><span>Default planning weight</span><div><input type="number" step="any" value={profileNumber(profile,'defaultWeight')} placeholder={`e.g. ${profile.units==='LBS'?'24000':'11000'}`} onChange={e=>updateProfile({defaultWeight:numeric(e.target.value)})}/><small>{profile.units}</small></div></label>
        <label><span>Taxi fuel</span><div><input type="number" step="any" value={profileNumber(profile,'taxiFuel')} placeholder="e.g. 25" onChange={e=>updateProfile({taxiFuel:numeric(e.target.value)})}/><small>{profile.units}</small></div></label>
        <label><span>Holding flow</span><div><input type="number" step="any" value={profileNumber(profile,'holdingFlow')} placeholder="e.g. 45" onChange={e=>updateProfile({holdingFlow:numeric(e.target.value)})}/><small>{profile.units}/hr</small></div></label>
        <label><span>Final reserve</span><div><input type="number" step="any" value={profileNumber(profile,'reserveMinutes')} placeholder="e.g. 45" onChange={e=>updateProfile({reserveMinutes:numeric(e.target.value)})}/><small>min</small></div></label>
        <label><span>Contingency</span><div><input type="number" step="any" value={profileNumber(profile,'contingencyPct')} placeholder="e.g. 5" onChange={e=>updateProfile({contingencyPct:numeric(e.target.value)})}/><small>%</small></div></label>
        <label><span>Usable fuel</span><div><input type="number" step="any" value={profileNumber(profile,'usableFuel')} placeholder="e.g. 300" onChange={e=>updateProfile({usableFuel:numeric(e.target.value)})}/><small>{profile.units}</small></div></label>
      </div>
      <div className="performance-help"><strong>Performance model</strong><span>Add several points from the POH/AFM across the altitudes, weights and temperatures you actually use. More coverage gives AeroSlate a better interpolation instead of relying on one generic fuel-flow number.</span></div>
      <PerformanceTable title="Cruise performance" kind="cruise" units={profile.units} rows={profile.cruisePoints||[]} onChange={rows=>updateProfile({cruisePoints:rows})}/>
      <PerformanceTable title="Climb performance" kind="phase" units={profile.units} rows={profile.climbPoints||[]} onChange={rows=>updateProfile({climbPoints:rows})}/>
      <PerformanceTable title="Descent performance" kind="phase" units={profile.units} rows={profile.descentPoints||[]} onChange={rows=>updateProfile({descentPoints:rows})}/>
      <details className="legacy-performance"><summary>Simple fallback values</summary><div className="fuel-profile-grid">{[
        ['Cruise TAS', 'cruiseTasKt','kt','e.g. 120'],['Climb fuel','climbFuel',profile.units,'e.g. 80'],['Climb time','climbMinutes','min','e.g. 12'],['Cruise flow','cruiseFlow',`${profile.units}/hr`,'e.g. 55'],['Descent fuel','descentFuel',profile.units,'e.g. 25'],['Descent time','descentMinutes','min','e.g. 10']
      ].map(([label,key,suffix,prompt])=><label key={key}><span>{label}</span><div><input type="number" step="any" value={profileNumber(profile,key as keyof FuelProfile)} placeholder={prompt} onChange={e=>updateProfile({[key]:numeric(e.target.value)} as any)}/><small>{suffix}</small></div></label>)}</div></details>
      <div className={`learning-panel ${learning?'active':''}`}><div><Activity size={18}/><span><strong>Learn from simulator</strong><small>{learning?`${learningStatus.samples} server samples · ${learningStatus.hours.toFixed(1)} hr this session · continues in background`:profile.learned?.samples?`${profile.learned.samples} samples · ${profile.learned.flights} session${profile.learned.flights===1?'':'s'} · ${profile.learned.hours.toFixed(1)} hr observed`:'No learned data yet. Manual values remain authoritative until observations are collected.'}</small></span></div><button className={learning?'danger-button':'primary'} disabled={!linked&&!learning} onClick={()=>{if(learning)void stopLearning();else void startLearning()}}>{learning?'Stop & update profile':linked?'Start learning':'Simulator offline'}</button></div>
    </div>}</section>

    <section className="card custom-plan-card"><header><div><Plane size={18}/><h3>AeroSlate flight planner</h3></div><div className="header-actions"><button onClick={()=>void importSimBriefPlan()} disabled={importingSimBrief}>{importingSimBrief?<Activity className="spin" size={15}/>:<Import size={15}/>} {importingSimBrief?'Importing…':'Import SimBrief plan'}</button><button onClick={clearPlan}><RotateCcw size={15}/>New plan</button><span className="pill blue">CUSTOM OFP</span></div></header><div className="card-body">
      <div className="custom-plan-grid">
        <label className="planner-field planner-profile-select"><span>Aircraft profile</span><select value={profile.id} onChange={e=>setProfileId(e.target.value)}><option value="" disabled>Select aircraft profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name||p.aircraft||'Untitled profile'}</option>)}</select><small>{profile.aircraft||profile.registration?`${profile.aircraft||'Aircraft'}${profile.registration?` · ${profile.registration}`:''}`:'Fuel and performance source'}</small></label>
        <label className="planner-field"><span>Planned takeoff weight</span><input type="number" value={plannedWeight} onChange={e=>setPlannedWeight(e.target.value)} placeholder={profile.defaultWeight?`Default ${profile.defaultWeight} ${profile.units}`:`e.g. ${profile.units==='LBS'?'24000':'11000'}`}/><small>{profile.units} · used to interpolate performance</small></label>
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
