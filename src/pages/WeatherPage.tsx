import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CloudSun, ExternalLink, Filter, Wifi, RefreshCw, Search, Send, ShieldCheck, X } from 'lucide-react';
import { getAllNotams, getWeather, type AnyRecord, type FlightSummary, type ParsedNotam } from '../lib/ofp';

function categoryLabel(category: ParsedNotam['category']) { return ({ airport:'Airport',runway:'Runway',taxiway:'Taxiway',ramp:'Ramp / deicing',lighting:'Lighting',procedure:'Procedure',navaid:'Navaid',communication:'Communications',service:'Services',airspace:'Airspace',obstacle:'Obstacles',other:'Other' } as const)[category]; }
function operationalGroup(item: ParsedNotam) {
  const text=item.text.toUpperCase();
  if(item.category==='airport') return 'Airport closures & restrictions';
  if(item.category==='runway') return 'Runways';
  if(item.category==='taxiway') return 'Taxiways';
  if(item.category==='ramp') return 'Ramp, gates & deicing';
  if(item.category==='lighting') return 'Runway & approach lighting';
  if((item.category==='procedure'||item.category==='navaid')&&/(ILS|LOCALIZER|LOC |GLIDE ?SLOPE|MALSR|MARKER)/.test(text)&&item.priority==='critical') return 'Approach equipment';
  if(item.category==='procedure') return 'Procedures & minima';
  if(item.category==='navaid') return 'Navaids';
  if(item.category==='communication') return 'Communications';
  if(item.category==='service') return 'Airport services';
  return categoryLabel(item.category);
}
function statusLabel(item: ParsedNotam) {
  if (/\b(?:CLSD|CLOSED)\b/i.test(item.text)) return 'CLOSED';
  if (/\bNA\b|NOT AUTHORIZED/i.test(item.text) && item.category === 'procedure') return 'NOT AUTHORIZED';
  if (/NOT APPLICABLE/i.test(item.text) && item.category === 'procedure') return 'NOT APPLICABLE';
  if (item.category === 'procedure' && /INCREASE|RAISE|VISIBILITY|CEILING|MINIMA|AMDT|AMEND|REVISED|CHANGE/i.test(item.text)) return 'PROCEDURE CHANGE';
  if (/UNSERVICEABLE|\bU\/S\b/i.test(item.text)) return 'UNSERVICEABLE';
  if (/OUT OF SERVICE|\bOOS\b|\bOTS\b|INOPERATIVE|\bINOP\b/i.test(item.text)) return 'OUT OF SERVICE';
  if (/NOT AVBL|NOT AVAILABLE|SUSPENDED/i.test(item.text)) return 'NOT AVAILABLE';
  return item.priority === 'critical' ? 'ALERT' : item.priority === 'amendment' ? 'CHANGE' : 'ADVISORY';
}
function eText(item: ParsedNotam) {
  return item.text.match(/(?:^|\n)E\)\s*([\s\S]*)/i)?.[1]?.trim() || item.text;
}
function affectedSubject(item: ParsedNotam) {
  const text=eText(item).replace(/\s+/g,' ').trim();
  const patterns: [RegExp,string][] = [
    [/\bTWY\s+([A-Z0-9]+(?:\s+(?:BTN|FM|TO|AND)\s+[A-Z0-9/]+)*)/i,'Taxiway $1'],
    [/\bRWY\s+(\d{1,2}[LRC]?(?:\/\d{1,2}[LRC]?)?)/i,'Runway $1'],
    [/\b(?:DEICE|DEICING)\s+(?:PAD|AREA)?\s*([A-Z0-9-]*)/i,'Deicing area $1'],
    [/\b(?:APRON|RAMP|GATE|STAND)\s+([A-Z0-9-]+)/i,'$&'],
    [/\b(ILS|LOC|LOCALIZER|GLIDE ?SLOPE|MALSR|PAPI|VASI)\b(?:\s+RWY\s*(\d{1,2}[LRC]?))?/i,'$1 $2'],
    [/\b((?:RNAV|RNP|ILS|LOC|VOR|NDB)[^,.]{0,45}RWY\s*\d{1,2}[LRC]?)/i,'$1'],
    [/\b(SID|STAR)\s+([A-Z0-9-]+)/i,'$1 $2'],
    [/\b(VOR|DME|NDB|VORTAC)\s+([A-Z0-9-]+)/i,'$1 $2']
  ];
  for (const [pattern,label] of patterns) {
    const match=text.match(pattern);
    if(match) return label.replace(/\$(\d)/g,(_,n)=>match[Number(n)]||'').replace(/\s+/g,' ').trim().toUpperCase();
  }
  return categoryLabel(item.category).toUpperCase();
}
function headline(item: ParsedNotam) {
  const source=eText(item).split(/\n+/).map(x=>x.trim()).find(Boolean)||item.text;
  return source.replace(/\bCLSD\b/gi,'CLOSED').replace(/\bU\/S\b/gi,'UNSERVICEABLE').replace(/\bOOS\b/gi,'OUT OF SERVICE').replace(/\s+/g,' ').trim();
}
function validity(item: ParsedNotam) { if(item.temporalStatus==='undated')return 'Validity not machine-readable';const from=item.validFrom?new Date(item.validFrom).toISOString().slice(0,16).replace('T',' ')+'Z':'effective now';const to=item.validTo?new Date(item.validTo).toISOString().slice(0,16).replace('T',' ')+'Z':'until further notice';return `${from} → ${to}`; }
function rank(item:ParsedNotam){if(item.priority==='critical'&&item.category==='airport')return 0;if(item.priority==='critical'&&item.category==='runway')return 1;if(item.priority==='critical')return 2;if(item.priority==='amendment')return 3;return 4}

type AtisResult={airport:string;realWorld:{id:string;type:string;text:string;timestamp:string;source:string}[];vatsim:{callsign:string;frequency:string;code:string;text:string;updatedAt:string}[];warnings:string[]};
type VatsimStatus={filed:boolean;routeMatch:boolean;source:string|null;flightPlan:any;checkedAt:string;prefileUrl:string};

export function WeatherPage({ofp,flight}:{ofp:AnyRecord|null;flight:FlightSummary}){
  const stations=([{key:'origin',code:flight.origin,label:'Departure'},{key:'destination',code:flight.destination,label:'Destination'},{key:'alternate',code:flight.alternate,label:'Alternate'}] as const).filter(x=>x.code&&x.code!=='----'&&x.code!=='—');
  const all=useMemo(()=>getAllNotams(ofp),[ofp]);const active=useMemo(()=>all.filter(x=>x.temporalStatus==='active'||x.temporalStatus==='undated'),[all]);const alerts=useMemo(()=>active.filter(x=>x.important).sort((a,b)=>a.station.localeCompare(b.station)||rank(a)-rank(b)),[active]);
  const[timeFilter,setTimeFilter]=useState<'active'|'future'|'past'|'all'>('active'),[filter,setFilter]=useState<'all'|ParsedNotam['category']>('all'),[query,setQuery]=useState(''),[station,setStation]=useState('');
  const [atis,setAtis]=useState<Record<string,AtisResult>>({}); const [atisBusy,setAtisBusy]=useState(false);
  const [vatsim,setVatsim]=useState<VatsimStatus|null>(null); const [vatsimBusy,setVatsimBusy]=useState(false);
  const routeOrder=[flight.origin,flight.destination,flight.alternate].filter(Boolean);const alertGroups=useMemo(()=>alerts.reduce<Record<string,ParsedNotam[]>>((a,x)=>{(a[x.station]??=[]).push(x);return a},{}),[alerts]);const alertStations=Object.keys(alertGroups).sort((a,b)=>{const ai=routeOrder.indexOf(a),bi=routeOrder.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b)});
  useEffect(()=>{if(alertStations.length&&!alertStations.includes(station))setStation(alertStations[0]);if(!alertStations.length)setStation('')},[alertStations.join('|'),station]);
  const loadAtis=async()=>{setAtisBusy(true);try{const entries=await Promise.all(stations.slice(0,2).map(async s=>{const r=await fetch(`/api/atis?airport=${encodeURIComponent(s.code)}`,{cache:'no-store'});return [s.code,await r.json()] as const}));setAtis(Object.fromEntries(entries));}finally{setAtisBusy(false)}};
  const verifyVatsim=async()=>{setVatsimBusy(true);try{const q=new URLSearchParams({callsign:flight.callsign||`${flight.airline}${flight.flightNumber}`,origin:flight.origin,destination:flight.destination});const r=await fetch(`/api/vatsim/flightplan?${q}`,{cache:'no-store'});setVatsim(await r.json());}finally{setVatsimBusy(false)}};
  useEffect(()=>{void loadAtis();void verifyVatsim()},[flight.origin,flight.destination,flight.callsign,flight.airline,flight.flightNumber]);
  const visible=all.filter(x=>(timeFilter==='all'||(timeFilter==='active'?(x.temporalStatus==='active'||x.temporalStatus==='undated'):x.temporalStatus===timeFilter))&&(filter==='all'||x.category===filter)&&(!query.trim()||`${x.station} ${x.text}`.toLowerCase().includes(query.trim().toLowerCase())));const grouped=visible.reduce<Record<string,ParsedNotam[]>>((a,x)=>{(a[x.station]??=[]).push(x);return a},{});
  const critical=alerts.filter(x=>x.priority==='critical').length,changes=alerts.filter(x=>x.priority==='amendment').length;const counts={active:active.length,future:all.filter(x=>x.temporalStatus==='future').length,past:all.filter(x=>x.temporalStatus==='past').length};
  const selected=alertGroups[station]||[]; const selectedByCategory=selected.reduce<Record<string,ParsedNotam[]>>((a,x)=>{const k=operationalGroup(x);(a[k]??=[]).push(x);return a},{});
  return <div className="weather-page foreflight-briefing">
    <section className="wx-network-grid">
      <section className="card"><header><div><Wifi size={18}/><h3>D-ATIS</h3></div><button onClick={()=>void loadAtis()} disabled={atisBusy}><RefreshCw className={atisBusy?'spin':''} size={15}/>Refresh</button></header><div className="card-body atis-grid">{stations.slice(0,2).map(s=>{const data=atis[s.code];return <div className="atis-station" key={s.code}><strong>{s.code}</strong><div><span>Real-world</span><p>{data?.realWorld?.[0]?.text||'No current public D-ATIS returned.'}</p></div><div><span>VATSIM</span><p>{data?.vatsim?.[0]?.text||'No VATSIM ATIS online.'}</p></div></div>})}<small>Real-world messages come from public D-ATIS/ACARS feeds and may be delayed. Use the VATSIM ATIS when flying on VATSIM.</small></div></section>
      <section className={`card vatsim-filing ${vatsim?.filed&&vatsim.routeMatch?'ok':vatsim?'warn':''}`}><header><div>{vatsim?.filed&&vatsim.routeMatch?<CheckCircle2 size={18}/>:<X size={18}/>}<h3>VATSIM flight plan</h3></div><button onClick={()=>void verifyVatsim()} disabled={vatsimBusy}><RefreshCw className={vatsimBusy?'spin':''} size={15}/>Verify</button></header><div className="card-body"><strong>{vatsim?.filed?(vatsim.routeMatch?'Filed and route-matched':'Filed, but route differs'):'No matching plan found'}</strong><p>{flight.callsign||`${flight.airline}${flight.flightNumber}`} · {flight.origin} → {flight.destination}</p>{!vatsim?.filed&&<button className="primary" onClick={()=>window.open('https://my.vatsim.net/pilots/flightplan','aeroslate-vatsim-prefile')}><Send size={15}/>File on VATSIM</button>}</div></section>
    </section>

    <section className="foreflight-notam-banner"><div><AlertTriangle size={18}/><span><strong>{critical?`${critical} active operational alert${critical===1?'':'s'}`:'No active critical alert identified'}</strong><small>{changes} procedure/minima change{changes===1?'':'s'} · complete legal briefing retained</small></span></div><div className="notam-banner-pills"><span className={critical?'danger':''}>{critical} Critical</span><span className={changes?'caution':''}>{changes} Procedure changes</span></div></section>
    <section className="briefing-section card"><details><summary><div><CloudSun size={18}/><span><strong>Weather</strong><small>METAR and TAF by flight station</small></span></div><ChevronDown size={17}/></summary><div className="card-body weather-grid compact-weather-grid">{stations.map(s=>{const wx=getWeather(ofp,s.key);return <details className="weather-station" key={s.key} open={s.key!=='alternate'}><summary><span><strong>{s.code}</strong><small>{s.label}</small></span><ChevronDown size={15}/></summary><div className="weather-station-body"><div className="weather-block"><span>METAR</span><p>{wx.metar}</p></div><div className="weather-block"><span>TAF</span><p>{wx.taf}</p></div></div></details>})}</div></details></section>
    <section className="card foreflight-alert-center"><header><div><ShieldCheck size={18}/><h3>Alert NOTAMs</h3></div><small>Current operational items only</small></header><div className="foreflight-alert-layout"><aside className="foreflight-stations">{alertStations.map(code=>{const items=alertGroups[code],c=items.filter(x=>x.priority==='critical').length;return <button className={station===code?'active':''} key={code} onClick={()=>setStation(code)}><strong>{code}</strong><span>{c?`${c} alert${c===1?'':'s'}`:`${items.length} change${items.length===1?'':'s'}`}</span></button>})}{!alertStations.length&&<div className="empty-cell">No current operational alerts identified.</div>}</aside><div className="foreflight-alert-detail grouped-alert-detail">{Object.entries(selectedByCategory).map(([group,items])=><details className="alert-category-group" key={group} open={group==='Airport closures & restrictions'||group==='Runways'||group==='Approach equipment'}><summary><span><strong>{group}</strong><small>{items.length} item{items.length===1?'':'s'}</small></span><ChevronDown size={15}/></summary><div>{items.map(item=><article className={`foreflight-notam-row priority-${item.priority}`} key={item.id}><div className="notam-subject"><span>{affectedSubject(item)}</span><strong>{statusLabel(item)}</strong></div><p>{headline(item)}</p><small>{validity(item)}</small><details><summary>Legal text</summary><pre>{item.text}</pre></details></article>)}</div></details>)}{station&&!selected.length&&<div className="empty-cell">No current alert for {station}.</div>}</div></div></section>
    <section className="briefing-section card all-notams"><details><summary><div><Filter size={18}/><span><strong>Complete NOTAM briefing</strong><small>Every imported notice · grouped by station</small></span></div><div className="summary-badges"><span className="pill neutral">{all.length}</span><ChevronDown size={17}/></div></summary><div className="notam-toolbar"><div className="notam-time-filter"><button className={timeFilter==='active'?'active':''}onClick={()=>setTimeFilter('active')}>Current {counts.active}</button><button className={timeFilter==='future'?'active':''}onClick={()=>setTimeFilter('future')}>Future {counts.future}</button><button className={timeFilter==='past'?'active':''}onClick={()=>setTimeFilter('past')}>Past {counts.past}</button><button className={timeFilter==='all'?'active':''}onClick={()=>setTimeFilter('all')}>All {all.length}</button></div><div className="notam-filter-bar">{(['all','airport','runway','taxiway','ramp','lighting','procedure','navaid','communication','service','airspace','obstacle','other'] as const).map(x=><button key={x} className={filter===x?'active':''}onClick={()=>setFilter(x)}>{x==='all'?'All types':categoryLabel(x)}</button>)}</div><label className="notam-search"><Search size={15}/><input value={query}onChange={e=>setQuery(e.target.value)}placeholder="Search station or text"/></label></div><div className="card-body notam-groups">{Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([code,items])=><details key={code} className="notam-airport-group"><summary><strong>{code}</strong><span>{items.length} notice{items.length===1?'':'s'}</span><ChevronDown size={16}/></summary><div>{items.map(item=><article className={`notam-full-item priority-${item.priority}`} key={item.id}><div className="notam-subject"><span>{affectedSubject(item)}</span><strong>{statusLabel(item)}</strong></div><p>{headline(item)}</p><small>{validity(item)}</small><details><summary>Full legal text</summary><pre>{item.text}</pre></details></article>)}</div></details>)}{!Object.keys(grouped).length&&<div className="empty-cell">No NOTAMs match the selected filters.</div>}</div></details></section>
  </div>;
}
