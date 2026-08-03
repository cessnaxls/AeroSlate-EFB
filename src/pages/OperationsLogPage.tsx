import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, Save } from 'lucide-react';
import type { FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

type Mode='preflight'|'postflight';
interface LogEntry { id:string; time:string; category:string; status:string; note:string; }
const categories:Record<Mode,string[]>= {preflight:['Crew','Aircraft','Documents','Fuel','Payload','Weather','Maintenance','Departure'],postflight:['Aircraft','Fuel','Maintenance','Cabin','Documents','Delay','Handoff','Closeout']};
export function OperationsLogPage({mode,flight,notify}:{mode:Mode;flight:FlightSummary;notify:(s:string)=>void}){
 const key=`aeroslate.opslog.${mode}.${flight.release}.${flight.origin}${flight.destination}`; const [entries,setEntries]=useState<LogEntry[]>(()=>loadLocal(key,[])); const [category,setCategory]=useState(categories[mode][0]); const [status,setStatus]=useState('Complete'); const [note,setNote]=useState('');
 useEffect(()=>setEntries(loadLocal(key,[])),[key]); useEffect(()=>saveLocal(key,entries),[key,entries]);
 const add=()=>{const e={id:crypto.randomUUID(),time:new Date().toISOString().slice(11,16)+'z',category,status,note:note.trim()};setEntries(v=>[...v,e]);setNote('');notify(`${mode==='preflight'?'Preflight':'Postflight'} entry saved.`)};
 const Icon=mode==='preflight'?ClipboardCheck:CheckCircle2;
 return <div className="ops-log-page"><section className="card"><header><div><Icon size={18}/><h3>{mode==='preflight'?'Preflight activity log':'Postflight activity log'}</h3></div><span className="pill blue">{entries.length} entries</span></header><div className="card-body"><div className="ops-log-entry"><label><span>Time</span><input value={new Date().toISOString().slice(11,16)+'z'} readOnly/></label><label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories[mode].map(x=><option key={x}>{x}</option>)}</select></label><label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option>Complete</option><option>Open</option><option>Deferred</option><option>Discrepancy</option></select></label><label className="grow"><span>Entry</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="What was completed, found, or handed off" onKeyDown={e=>{if(e.key==='Enter')add()}}/></label><button className="primary" onClick={add}><Plus size={16}/> Add</button></div><div className="ops-log-list">{entries.map(e=><div key={e.id}><strong>{e.time}</strong><span>{e.category}</span><span className={`pill ${e.status==='Complete'?'good':e.status==='Discrepancy'?'bad':'warn'}`}>{e.status}</span><p>{e.note||'No note'}</p></div>)}{!entries.length&&<div className="empty-cell">No entries yet. Build the operational record as work is completed.</div>}</div></div></section></div>;
}
