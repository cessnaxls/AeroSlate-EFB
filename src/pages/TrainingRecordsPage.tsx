import { useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ClipboardCheck, Plus, Save, Trash2 } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { TRAINING_ACTIVE_KEY, TRAINING_KEY, TRAINING_RECORD_TARGET_KEY, type TrainingProfile, type TrainingRequirement } from './RecordsPage';

type Grade = '' | 'S' | 'U' | 'W' | 'N/A';
interface CheckItem { id:string; section:string; title:string; basis:string; required:boolean; note?:string; }
interface CheckItemResult { grade:Grade; location:'A/C'|'SIM'|'FTD'|''; comment:string; }
interface TrainingCheckRecord {
  id:string; profileId:string; requirementId:string; date:string; location:string; evaluator:string; evaluatorId:string;
  device:string; course:string; reference:string; overall:'OPEN'|'SATISFACTORY'|'UNSATISFACTORY'; remarks:string;
  items:Record<string,CheckItemResult>; createdAt:string; updatedAt:string;
}
const RECORDS_KEY='aeroslate.records.trainingChecks.v1';

function item(section:string,title:string,basis:string,required=true,note=''):CheckItem{return{id:`${section}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g,'-'),section,title,basis,required,note};}
const FAA_135_KNOWLEDGE:CheckItem[]=[
  item('Written / oral','Applicable regulations, OpSpecs and company manual','14 CFR 135.293(a)(1)'),
  item('Written / oral','Powerplant, components, systems and limitations','14 CFR 135.293(a)(2)'),
  item('Written / oral','Normal and emergency procedures / AFM','14 CFR 135.293(a)(2)'),
  item('Written / oral','Weight and balance, navigation and performance','14 CFR 135.293(a)(3)'),
  item('Written / oral','Navigation facilities and ATC procedures','14 CFR 135.293(a)(4)'),
  item('Written / oral','Meteorology, weather recognition and avoidance','14 CFR 135.293(a)(5)'),
  item('Written / oral','Operating in/near thunderstorms, turbulence and icing','14 CFR 135.293(a)(6)'),
  item('Written / oral','New equipment, procedures or techniques','14 CFR 135.293(a)(7)')
];
const FAA_AIRPLANE_COMPETENCY:CheckItem[]=[
  item('Ground operations','Preflight inspection','14 CFR 135.293(b) · FAA competency template'),
  item('Ground operations','Start procedures','14 CFR 135.293(b) · FAA competency template'),
  item('Ground operations','Taxi / runway operations','14 CFR 135.293(b) · FAA competency template'),
  item('Ground operations','Pretakeoff checks','14 CFR 135.293(b) · FAA competency template'),
  item('Takeoff / departure','Normal takeoff','14 CFR 135.293(b) · FAA competency template'),
  item('Takeoff / departure','Crosswind takeoff','14 CFR 135.293(b) · FAA competency template'),
  item('Takeoff / departure','Instrument takeoff / departure when applicable','14 CFR 135.293(b) · FAA competency template'),
  item('Takeoff / departure','Powerplant failure / rejected takeoff when applicable','14 CFR 135.293(b) · FAA competency template'),
  item('In-flight','Steep turns','14 CFR 135.293(b) · FAA competency template'),
  item('In-flight','Approach to stalls / stall prevention','14 CFR 135.293(b) · FAA competency template'),
  item('In-flight','Powerplant failure / engine-out handling','14 CFR 135.293(b) · FAA competency template'),
  item('Landing','Normal / crosswind landing','14 CFR 135.293(b) · FAA competency template'),
  item('Landing','Rejected landing / go-around','14 CFR 135.293(b) · FAA competency template'),
  item('Landing','Landing from instrument approach','14 CFR 135.293(b) · FAA competency template'),
  item('Landing','Engine-out landing when applicable','14 CFR 135.293(b) · FAA competency template'),
  item('Abnormal / emergency','System malfunction','14 CFR 135.293(b) · FAA competency template'),
  item('Abnormal / emergency','Navigation equipment malfunction','14 CFR 135.293(b) · FAA competency template'),
  item('Abnormal / emergency','Unusual attitude recovery','14 CFR 135.293(b) · FAA competency template'),
  item('Abnormal / emergency','Emergency / abnormal checklist use and CRM','14 CFR 135.293(b) · approved program')
];
const FAA_INSTRUMENT:CheckItem[]=[
  item('Instrument','Area departure / SID','14 CFR 135.297'), item('Instrument','Holding','14 CFR 135.297'), item('Instrument','Area arrival / STAR','14 CFR 135.297'),
  item('Instrument','Precision / 3D instrument approach','14 CFR 135.297'), item('Instrument','Engine-out instrument approach when applicable','14 CFR 135.297'),
  item('Instrument','Coupled approach / automation use','14 CFR 135.297'), item('Instrument','Nonprecision / 2D instrument approach','14 CFR 135.297'),
  item('Instrument','Missed approach / go-around','14 CFR 135.297'), item('Instrument','Circling approach when authorized/applicable','14 CFR 135.297',false,'May be N/A depending on authorization and aircraft.'),
  item('Instrument','Instrument procedures, ATC compliance and scan','14 CFR 135.297')
];
const FAA_LINE:CheckItem[]=[
  item('Line check','Preflight planning, weather, NOTAMs and dispatch/release','14 CFR 135.299'), item('Line check','Aircraft acceptance / preflight','14 CFR 135.299'),
  item('Line check','Normal cockpit procedures and checklist discipline','14 CFR 135.299'), item('Line check','Taxi, takeoff and departure','14 CFR 135.299'),
  item('Line check','En route navigation, ATC and situational awareness','14 CFR 135.299'), item('Line check','Arrival, approach and landing','14 CFR 135.299'),
  item('Line check','Route and airport knowledge','14 CFR 135.299'), item('Line check','Crew coordination / judgment / command duties','14 CFR 135.299')
];
const FAA_121_APPENDIX_F:CheckItem[]=[
  item('Equipment examination','Aircraft equipment, systems, limitations and normal/abnormal procedures','14 CFR Part 121 Appendix F I'),
  item('Preflight','Preflight inspection / cockpit preparation','14 CFR Part 121 Appendix F I'), item('Preflight','Taxiing and surface operations','14 CFR Part 121 Appendix F I'),
  item('Takeoff','Normal takeoff','14 CFR Part 121 Appendix F II'), item('Takeoff','Instrument takeoff / transition to instruments','14 CFR Part 121 Appendix F II'),
  item('Takeoff','Crosswind takeoff when practicable','14 CFR Part 121 Appendix F II'), item('Takeoff','Engine failure / rejected takeoff as applicable','14 CFR Part 121 Appendix F II'),
  item('Instrument procedures','Departure and arrival procedures','14 CFR Part 121 Appendix F III'), item('Instrument procedures','Holding procedures','14 CFR Part 121 Appendix F III'),
  item('Instrument procedures','ILS / 3D approach','14 CFR Part 121 Appendix F III'), item('Instrument procedures','Nonprecision / 2D approach','14 CFR Part 121 Appendix F III'),
  item('Instrument procedures','Missed approach, including engine-out when applicable','14 CFR Part 121 Appendix F III'),
  item('Approach / landing','Normal and crosswind landing','14 CFR Part 121 Appendix F IV'), item('Approach / landing','Landing from instrument approach','14 CFR Part 121 Appendix F IV'),
  item('Approach / landing','Go-around / rejected landing','14 CFR Part 121 Appendix F IV'), item('Approach / landing','Engine-out landing when applicable','14 CFR Part 121 Appendix F IV'),
  item('Maneuvers','Steep turns / maneuvering as applicable to crew position','14 CFR Part 121 Appendix F V'), item('Maneuvers','Stall prevention / recovery as applicable','14 CFR Part 121 Appendix F V'),
  item('Abnormal / emergency','Powerplant and system malfunctions','14 CFR Part 121 Appendix F V'), item('Abnormal / emergency','Emergency procedures required by approved program','14 CFR 121.441 · Appendix F')
];
const EASA_APPENDIX9:CheckItem[]=[
  item('Preflight','Flight planning, performance, mass and balance','Part-FCL Appendix 9'), item('Preflight','External/flight-deck inspection and checklist use','Part-FCL Appendix 9'),
  item('Normal operations','Engine start, taxi and before-takeoff procedures','Part-FCL Appendix 9'), item('Normal operations','Normal takeoff and departure','Part-FCL Appendix 9'),
  item('Instrument','SID/STAR and ATC compliance','Part-FCL Appendix 9'), item('Instrument','Holding','Part-FCL Appendix 9'),
  item('Instrument','3D precision approach','Part-FCL Appendix 9'), item('Instrument','2D nonprecision approach','Part-FCL Appendix 9'), item('Instrument','Missed approach / go-around','Part-FCL Appendix 9'),
  item('Abnormal / emergency','Rejected takeoff','Part-FCL Appendix 9'), item('Abnormal / emergency','Critical engine failure around takeoff','Part-FCL Appendix 9'),
  item('Abnormal / emergency','Engine-out approach and go-around','Part-FCL Appendix 9'), item('Abnormal / emergency','System malfunctions / emergency procedures','Part-FCL Appendix 9'),
  item('Landing','Normal landing','Part-FCL Appendix 9'), item('Landing','Engine-out landing when applicable','Part-FCL Appendix 9'),
  item('Competencies','Flight path management, automation, communication, leadership/teamwork, problem solving and workload management','ORO.FC.230 / operator competency framework')
];
const RECURRENT_GROUND:CheckItem[]=[
  item('Ground recurrent','Aircraft systems, limitations and performance','Approved training program'), item('Ground recurrent','Normal, abnormal and emergency procedures','Approved training program'),
  item('Ground recurrent','Weather, navigation and operational procedures','Approved training program'), item('Ground recurrent','Crew resource management / human factors','Approved training program'),
  item('Ground recurrent','Emergency equipment / evacuation / security / hazmat as applicable','Approved training program')
];
function checklist(profile:TrainingProfile,req:TrainingRequirement):CheckItem[]{
  const t=req.title.toLowerCase(), b=req.basis.toLowerCase();
  if(profile.authority==='EASA') return (t.includes('proficiency')||t.includes('competence')||t.includes('line check'))?EASA_APPENDIX9:RECURRENT_GROUND.map(x=>({...x,basis:req.basis||x.basis}));
  if(profile.operation==='Part 135'){
    if(b.includes('135.293(a)')||t.includes('knowledge')) return FAA_135_KNOWLEDGE;
    if(b.includes('135.293(b)')||t.includes('competency')) return FAA_AIRPLANE_COMPETENCY;
    if(b.includes('135.297')||t.includes('instrument proficiency')) return FAA_INSTRUMENT;
    if(b.includes('135.299')||t.includes('line check')) return FAA_LINE;
  }
  if(profile.operation==='Part 121' && t.includes('proficiency')) return FAA_121_APPENDIX_F;
  if(t.includes('recent experience')||t.includes('medical')||t.includes('qualification')) return [item('Documentation','Verify underlying qualification, validity and supporting evidence',req.basis,true,'This is primarily a qualification/currency documentation record rather than a maneuver check.')];
  return RECURRENT_GROUND.map(x=>({...x,basis:req.basis||x.basis}));
}
function today(){return new Date().toISOString().slice(0,10);}

export function TrainingRecordsPage({onBack}:{onBack?:()=>void}){
  const [profiles,setProfiles]=useState<TrainingProfile[]>(()=>loadLocal<TrainingProfile[]>(TRAINING_KEY,[]));
  const target=loadLocal<{profileId?:string;requirementId?:string}>(TRAINING_RECORD_TARGET_KEY,{});
  const [profileId,setProfileId]=useState(()=>target.profileId||loadLocal<string>(TRAINING_ACTIVE_KEY,'')||profiles[0]?.id||'');
  const profile=profiles.find(p=>p.id===profileId)||profiles[0]||null;
  const [requirementId,setRequirementId]=useState(()=>target.requirementId||profile?.requirements[0]?.id||'');
  const requirement=profile?.requirements.find(r=>r.id===requirementId)||profile?.requirements[0]||null;
  const [records,setRecords]=useState<TrainingCheckRecord[]>(()=>loadLocal<TrainingCheckRecord[]>(RECORDS_KEY,[]));
  const items=useMemo(()=>profile&&requirement?checklist(profile,requirement):[],[profile,requirement]);
  const scoped=records.filter(r=>r.profileId===profile?.id&&r.requirementId===requirement?.id).sort((a,b)=>b.date.localeCompare(a.date));
  const [activeId,setActiveId]=useState<string>('');
  const existing=scoped.find(r=>r.id===activeId)||scoped[0];
  const empty=():TrainingCheckRecord=>({id:`check-${Date.now()}`,profileId:profile?.id||'',requirementId:requirement?.id||'',date:today(),location:'',evaluator:'',evaluatorId:'',device:'',course:'',reference:'',overall:'OPEN',remarks:'',items:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const [draft,setDraft]=useState<TrainingCheckRecord>(()=>existing||empty());
  const switchRequirement=(id:string)=>{setRequirementId(id);setActiveId(''); const req=profile?.requirements.find(r=>r.id===id); const found=records.filter(r=>r.profileId===profile?.id&&r.requirementId===id).sort((a,b)=>b.date.localeCompare(a.date))[0]; setDraft(found||{...empty(),requirementId:req?.id||id}); saveLocal(TRAINING_RECORD_TARGET_KEY,{profileId:profile?.id,requirementId:id});};
  const switchProfile=(id:string)=>{const p=profiles.find(x=>x.id===id);setProfileId(id);saveLocal(TRAINING_ACTIVE_KEY,id);const rid=p?.requirements[0]?.id||'';setRequirementId(rid);setActiveId('');setDraft({...empty(),profileId:id,requirementId:rid});saveLocal(TRAINING_RECORD_TARGET_KEY,{profileId:id,requirementId:rid});};
  const updateItem=(id:string,patch:Partial<CheckItemResult>)=>setDraft(d=>({...d,items:{...d.items,[id]:{...(d.items[id]||{grade:'',location:'',comment:''}),...patch}}}));
  const save=(complete=false)=>{if(!profile||!requirement)return; const next={...draft,profileId:profile.id,requirementId:requirement.id,updatedAt:new Date().toISOString(),overall:complete?'SATISFACTORY':draft.overall} as TrainingCheckRecord; const nextRows=records.some(r=>r.id===next.id)?records.map(r=>r.id===next.id?next:r):[...records,next];setRecords(nextRows);saveLocal(RECORDS_KEY,nextRows);setDraft(next);setActiveId(next.id); if(complete){const ref=next.reference||`${next.evaluator||'Evaluator'} · ${next.date}`;const nextProfiles=profiles.map(p=>p.id!==profile.id?p:{...p,requirements:p.requirements.map(r=>r.id!==requirement.id?r:{...r,lastCompleted:next.date,evidence:ref})});setProfiles(nextProfiles);saveLocal(TRAINING_KEY,nextProfiles);}};
  const newRecord=()=>{const d=empty();setActiveId(d.id);setDraft(d);};
  const requiredCount=items.filter(i=>i.required).length; const gradedRequired=items.filter(i=>i.required&&['S','W','N/A'].includes(draft.items[i.id]?.grade||'')).length;
  return <div className="training-records-page">
    <section className="card training-record-header"><header><div><ClipboardCheck size={18}/><h3>Training records</h3></div><span className="pill blue">COMPETENCY & CHECKING</span></header><div className="card-body">
      <div className="training-record-toolbar">{onBack&&<button onClick={onBack}>← Qualifications</button>}<label><span>Operator / aircraft</span><select value={profile?.id||''} onChange={e=>switchProfile(e.target.value)}>{profiles.map(p=><option key={p.id} value={p.id}>{p.airline} · {p.aircraft} · {p.operation} · {p.position}</option>)}</select></label><label className="wide"><span>Required check / event</span><select value={requirement?.id||''} onChange={e=>switchRequirement(e.target.value)}>{profile?.requirements.map(r=><option key={r.id} value={r.id}>{r.title} · {r.basis}</option>)}</select></label><button className="primary" onClick={newRecord}><Plus size={14}/> New check</button></div>
      {!profile||!requirement?<div className="training-empty"><BookOpenCheck size={22}/><div><strong>No qualification record selected</strong><p>Create an aircraft/operator training record under Flights first.</p></div></div>:<>
      <div className="training-record-identity"><div><span>Record</span><strong>{profile.airline} · {profile.aircraft}</strong><small>{profile.authority} {profile.operation} · {profile.position}</small></div><div><span>Check / requirement</span><strong>{requirement.title}</strong><small>{requirement.basis}</small></div><div><span>Checklist</span><strong>{gradedRequired}/{requiredCount}</strong><small>required items recorded</small></div></div>
      {scoped.length>0&&<div className="training-record-history"><span>History</span>{scoped.map(r=><button key={r.id} className={draft.id===r.id?'active':''} onClick={()=>{setActiveId(r.id);setDraft(r);}}>{r.date} · {r.overall}</button>)}</div>}
      <div className="training-check-meta"><label><span>Date of check</span><input type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label><span>Location</span><input value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="Airport / training center"/></label><label><span>Evaluator / check pilot</span><input value={draft.evaluator} onChange={e=>setDraft({...draft,evaluator:e.target.value})}/></label><label><span>Evaluator ID / certificate</span><input value={draft.evaluatorId} onChange={e=>setDraft({...draft,evaluatorId:e.target.value})}/></label><label><span>Aircraft / FSTD</span><input value={draft.device} onChange={e=>setDraft({...draft,device:e.target.value})} placeholder={profile.aircraft}/></label><label><span>Curriculum / course</span><input value={draft.course} onChange={e=>setDraft({...draft,course:e.target.value})}/></label><label><span>Record / certificate #</span><input value={draft.reference} onChange={e=>setDraft({...draft,reference:e.target.value})}/></label><label><span>Overall result</span><select value={draft.overall} onChange={e=>setDraft({...draft,overall:e.target.value as TrainingCheckRecord['overall']})}><option>OPEN</option><option>SATISFACTORY</option><option>UNSATISFACTORY</option></select></label></div>
      <div className="competency-sheet"><div className="competency-sheet-head"><span>Item / maneuver / subject</span><span>Legal basis</span><span>Grade</span><span>Device</span><span>Comment</span></div>{items.map(i=>{const r=draft.items[i.id]||{grade:'',location:'',comment:''};return <div className="competency-sheet-row" key={i.id}><div><strong>{i.title}</strong><small>{i.section}{!i.required?' · when applicable':''}{i.note?` · ${i.note}`:''}</small></div><small>{i.basis}</small><select value={r.grade} onChange={e=>updateItem(i.id,{grade:e.target.value as Grade})}><option value="">—</option><option value="S">S</option><option value="U">U</option><option value="W">W</option><option value="N/A">N/A</option></select><select value={r.location} onChange={e=>updateItem(i.id,{location:e.target.value as CheckItemResult['location']})}><option value="">—</option><option>A/C</option><option>SIM</option><option>FTD</option></select><input value={r.comment} onChange={e=>updateItem(i.id,{comment:e.target.value})} placeholder="optional"/></div>})}</div>
      <label className="stacked-input training-record-remarks"><span>Remarks / limitations / additional training</span><textarea value={draft.remarks} onChange={e=>setDraft({...draft,remarks:e.target.value})}/></label>
      <div className="training-record-actions"><button onClick={()=>save(false)}><Save size={15}/> Save record</button><button className="primary" onClick={()=>save(true)} disabled={gradedRequired<requiredCount}><CheckCircle2 size={15}/> Complete satisfactory & update qualification</button>{records.some(r=>r.id===draft.id)&&<button className="danger-button" onClick={()=>{const rows=records.filter(r=>r.id!==draft.id);setRecords(rows);saveLocal(RECORDS_KEY,rows);newRecord();}}><Trash2 size={14}/> Delete</button>}</div>
      <p className="currency-disclaimer">This is a maintenance and checking record modeled on current competency/checking records, not an FAA or EASA form and not an approval. Part 121 proficiency checks must include at least Appendix F procedures unless an approved alternative applies; Part 135 and EASA operator programs may add, tailor, waive, or substitute items where the governing rule and approved program permit.</p>
      </>}
    </div></section>
  </div>;
}
