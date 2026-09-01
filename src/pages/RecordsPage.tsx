import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, Calculator, ChevronDown, ChevronUp, CloudDownload, CloudUpload, Download, HardDrive, KeyRound, Plus, RefreshCw, Save, Search, ShieldCheck, Plane, Timer, Trash2, Upload, X } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { addMinutesZulu, decimalHours, formatMinutes, minutesBetweenZulu, normalizeZulu, oooiStorageKey, useOOOITimes } from '../lib/flightTimes';
import { ZuluTimeInput } from '../components/ZuluTimeInput';
import type { FlightSummary } from '../lib/ofp';
import {
  appendLedgerRecord,
  decryptLedger,
  downloadText,
  emptyLedger,
  encryptLedger,
  getOrCreateDeviceId,
  mergeLedgers,
  normalizeLedger,
  readLedgerGist,
  recordsToCsv,
  synchronizeLedger,
  writeLedgerGist,
  type AeroSlateLedger,
  type GitHubCloudConfig,
  type RecordData,
  type RecordKind
} from '../lib/cloudLedger';

interface RecordPresets { role: 'PIC' | 'SIC' | 'Dual' | 'Instructor'; operation: string; rules: 'IFR' | 'VFR'; crossCountry: boolean; autoDutyTimes: boolean; reportLeadMinutes: number; postFlightMinutes: number; defaultNight: number; defaultInstrument: number; defaultSimulatedInstrument: number; defaultDayLandings: number; defaultNightLandings: number; defaultApproaches: string; defaultRemarks: string; defaultSigner: string; dutyRegulation: string; dutyRole: string; restBefore: number; maxDuty: number; maxFdp: number; minRest: number; }
interface CloudPrefs { gistId: string; token: string; passphrase: string; autoSync: boolean; rememberSecrets: boolean; }
interface TrainingRequirement { id: string; title: string; category: string; basis: string; intervalMonths: number; lastCompleted: string; dueOverride: string; evidence: string; notes: string; required: boolean; }
interface AircraftCurrencyConfig { lookbackDays:number; requiredFlights:number; requiredHours:number; requiredDayLandings:number; requiredNightLandings:number; requiredApproaches:number; requiredHolds:number; requireTracking:boolean; registrationFilter:string; }
interface TrainingProfile { id: string; airline: string; aircraft: string; operation: string; position: 'PIC' | 'SIC'; authority: 'FAA' | 'EASA'; createdAt: string; requirements: TrainingRequirement[]; currency?: AircraftCurrencyConfig; }
interface CareerRequirement { id:string; label:string; kind:'auto'|'manual'; metric:string; target:number; aircraftFilter:string; operationFilter:string; roleFilter:string; completed:boolean; notes:string; }
interface CareerStage { id:string; title:string; targetDate:string; notes:string; requirements:CareerRequirement[]; }
interface CareerPlan { id:string; name:string; goal:string; createdAt:string; stages:CareerStage[]; }
const TRAINING_KEY = 'aeroslate.records.trainingProfiles.v1';
const TRAINING_ACTIVE_KEY = 'aeroslate.records.trainingProfiles.active.v1';
const CAREER_KEY = 'aeroslate.records.careerPlans.v1';
const CAREER_ACTIVE_KEY = 'aeroslate.records.careerPlans.active.v1';
const CAREER_METRICS = [
  {key:'totalTime',label:'Total time'}, {key:'pic',label:'PIC'}, {key:'sic',label:'SIC / co-pilot'}, {key:'night',label:'Night'},
  {key:'instrument',label:'Actual instrument'}, {key:'crossCountry',label:'Cross-country'}, {key:'dayLandings',label:'Day landings'},
  {key:'nightLandings',label:'Night landings'}, {key:'approaches',label:'Approaches'}, {key:'holds',label:'Holding events'},
  {key:'flights',label:'Flights'}, {key:'uniqueTails',label:'Unique registrations'}, {key:'uniqueTypes',label:'Unique aircraft types'}
];
const DEFAULT_AIRCRAFT_CURRENCY: AircraftCurrencyConfig = { lookbackDays:90, requiredFlights:0, requiredHours:0, requiredDayLandings:3, requiredNightLandings:3, requiredApproaches:0, requiredHolds:0, requireTracking:false, registrationFilter:'' };
function req(title:string, category:string, basis:string, intervalMonths:number, notes=''): TrainingRequirement {
  return { id:`req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title, category, basis, intervalMonths, lastCompleted:'', dueOverride:'', evidence:'', notes, required:true };
}
function baselineTraining(authority:'FAA'|'EASA', operation:string, position:'PIC'|'SIC'): TrainingRequirement[] {
  if (authority === 'FAA') {
    if (operation === 'Part 135') return [
      req('Knowledge / oral test','Recurrent','14 CFR 135.293(a)',12,'Required recurrent pilot knowledge test.'),
      req('Aircraft competency check','Checking','14 CFR 135.293(b)',12,'Aircraft/class/type competency check.'),
      ...(position==='PIC' ? [req('Instrument proficiency check','Checking','14 CFR 135.297',6,'PIC under IFR.'), req('Line check — routes & airports','Line','14 CFR 135.299',12,'PIC line check.')] : []),
      req('Operator recurrent training','Training','14 CFR Part 135 approved program',12,'Verify the certificate holder training program, OpSpecs and checking month.'),
      req('Recent experience / landing currency','Currency','Applicable 14 CFR + operator program',3,'Verify category/class/type and passenger-carrying requirements.'),
      req('Medical certificate / qualification','Qualification','Applicable 14 CFR Part 61 / company program',12,'Set the actual due date using Due override if your medical validity differs.')
    ];
    if (operation === 'Part 121') return [
      req('Recurrent ground / flight training','Recurrent','14 CFR 121.427 / approved training program',12,'Operator curriculum controls the exact subjects and eligibility period.'),
      req('Proficiency check','Checking','14 CFR 121.439 / approved training program',position==='PIC'?6:12,'Default interval is a planning baseline; verify the carrier program and applicable checking requirements.'),
      req('Line / operating experience requirements','Line','14 CFR Part 121 Subpart N / operator program',12,'Track line checks, operating experience, consolidation or route/airport qualification as applicable.'),
      req('Recent experience / landing currency','Currency','Applicable 14 CFR + operator program',3,'Verify aircraft/type and carrier requirements.'),
      req('Emergency / recurrent modules','Training','Approved Part 121 training program',12,'Track recurrent emergency, security, hazmat, CRM and company modules separately if your carrier does.'),
      req('Medical certificate / qualification','Qualification','Applicable 14 CFR Part 61 / company program',12,'Set the actual due date using Due override if your medical validity differs.')
    ];
    return [
      req('Flight review','Qualification','14 CFR 61.56',24,'Part 61 baseline; other checks may satisfy the flight-review requirement when applicable.'),
      ...(position==='PIC' ? [req('Passenger-carrying recent experience','Currency','14 CFR 61.57(a)',3,'Day takeoffs and landings; verify category/class/type requirements.'), req('Night passenger recent experience','Currency','14 CFR 61.57(b)',3,'Night takeoffs and full-stop landings when applicable.'), req('Instrument recent experience','Currency','14 CFR 61.57(c)',6,'Approaches, holding, intercepting/tracking; IPC rules apply when currency cannot be regained by recent experience.')] : []),
      req('Aircraft / type qualification','Qualification','14 CFR Part 61 / aircraft-specific rule',12,'Use Due override for type-rating, special training, company checkout, or aircraft-specific requirements.'),
      req('Medical certificate / qualification','Qualification','Applicable 14 CFR Part 61',12,'Set the actual expiration/due date for the medical class and age rules that apply.')
    ];
  }
  if (operation === 'EASA CAT') return [
    req('Operator proficiency check (OPC)','Checking','ORO.FC.230',6,'CAT recurrent operator proficiency check.'),
    req('Line check','Line','ORO.FC.230',12,'CAT line check validity.'),
    req('Emergency & safety equipment training/check','Training','ORO.FC.230',12,'Annual recurrent emergency and safety equipment training/checking.'),
    req('Ground and flight recurrent training','Recurrent','ORO.FC.230',12,'At least every 12 calendar months.'),
    req('CRM recurrent cycle','Training','ORO.FC.230',36,'Major modular CRM topics distributed across the recurrent cycle.'),
    req('Recent experience','Currency','Part-FCL FCL.060',3,'Verify the exact takeoff/approach/landing recency provisions for the operation and role.'),
    req('Licence / type rating proficiency','Qualification','Part-FCL / operator program',12,'Use Due override for the actual licence/type-rating validity.')
  ];
  if (operation === 'EASA NCC') return [
    req('Annual recurrent flight & ground training','Recurrent','ORO.FC.130',12,'Relevant to type/variant and associated equipment.'),
    req('Periodic competence check','Checking','ORO.FC.130',12,'May be combined with applicable proficiency checks.'),
    req('Recent experience','Currency','Part-FCL FCL.060',3,'Verify exact recency for the intended operation.'),
    req('Licence / type rating proficiency','Qualification','Part-FCL',12,'Use Due override for actual rating validity.')
  ];
  return [
    req('Recent experience','Currency','Part-FCL FCL.060',3,'Verify exact recency for the intended operation and role.'),
    req('Licence / type rating proficiency','Qualification','Part-FCL',12,'Use Due override for actual rating validity.'),
    req('Operator / club recurrent training','Training','Operator-specific',12,'Optional operator requirement; edit or remove if not applicable.')
  ];
}
function addCalendarMonthsIso(date:string, months:number): string {
  if (!date || !months) return ''; const d=new Date(`${date}T00:00:00Z`); if(Number.isNaN(d.getTime())) return ''; d.setUTCMonth(d.getUTCMonth()+months); return d.toISOString().slice(0,10);
}
function trainingDue(item:TrainingRequirement): string { return item.dueOverride || addCalendarMonthsIso(item.lastCompleted,item.intervalMonths); }
function trainingStatus(item:TrainingRequirement): 'current'|'due'|'expired'|'open' {
  const due=trainingDue(item); if(!item.required) return 'current'; if(!item.lastCompleted&&!item.dueOverride) return 'open'; if(!due) return 'open'; const todayIso=new Date().toISOString().slice(0,10); const soon=new Date(); soon.setUTCDate(soon.getUTCDate()+45); const soonIso=soon.toISOString().slice(0,10); if(due<todayIso) return 'expired'; if(due<=soonIso) return 'due'; return 'current';
}
const OPERATIONS = ['Part 91', 'Part 121', 'Part 135', 'EASA CAT', 'EASA NCC', 'EASA NCO', 'Training', 'Other'];
const DUTY_SCHEMES = ['FAA Part 117', 'FAA Part 135', 'FAA Part 91 / company', 'EASA ORO.FTL.205', 'Company scheme', 'Other'];
const DEFAULT_PRESETS: RecordPresets = { role: 'SIC', operation: 'Part 91', rules: 'IFR', crossCountry: true, autoDutyTimes: true, reportLeadMinutes: 60, postFlightMinutes: 15, defaultNight: 0, defaultInstrument: 0, defaultSimulatedInstrument: 0, defaultDayLandings: 0, defaultNightLandings: 0, defaultApproaches: '', defaultRemarks: '', defaultSigner: '', dutyRegulation: 'FAA Part 117', dutyRole: 'Flightcrew', restBefore: 10, maxDuty: 13, maxFdp: 13, minRest: 10 };
const LEDGER_KEY = 'aeroslate.records.ledger.v2';
const CLOUD_KEY = 'aeroslate.records.github.v1';
type ReportOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy';
type MetricOperation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'unique';
interface ReportCondition { id: string; field: string; operator: ReportOperator; value: string; }
interface ReportMetric { id: string; field: string; operation: MetricOperation; label: string; }
interface ReportField { key: string; label: string; kind: 'text' | 'number' | 'boolean' | 'date' | 'calculated'; }

const FLIGHT_REPORT_FIELDS: ReportField[] = [
  { key:'date', label:'Date', kind:'date' }, { key:'flightNumber', label:'Flight number', kind:'text' },
  { key:'departure', label:'Departure', kind:'text' }, { key:'arrival', label:'Arrival', kind:'text' },
  { key:'aircraftType', label:'Aircraft type', kind:'text' }, { key:'registration', label:'Registration', kind:'text' },
  { key:'role', label:'Crew role', kind:'text' }, { key:'operation', label:'Operation', kind:'text' }, { key:'rules', label:'Flight rules', kind:'text' },
  { key:'totalTime', label:'Block time', kind:'number' }, { key:'flightTime', label:'Airborne time', kind:'number' },
  { key:'pic', label:'PIC', kind:'number' }, { key:'sic', label:'SIC / co-pilot', kind:'number' }, { key:'dual', label:'Dual', kind:'number' },
  { key:'instructor', label:'Instructor', kind:'number' }, { key:'night', label:'Night', kind:'number' },
  { key:'instrument', label:'Actual instrument', kind:'number' }, { key:'simulatedInstrument', label:'Simulated instrument', kind:'number' },
  { key:'crossCountry', label:'Cross-country', kind:'number' }, { key:'dayLandings', label:'Day landings', kind:'number' },
  { key:'nightLandings', label:'Night landings', kind:'number' }, { key:'approaches', label:'Approaches', kind:'text' }, { key:'holds', label:'Holding events', kind:'number' }, { key:'tracking', label:'Intercept / track performed', kind:'boolean' }
];
const DUTY_REPORT_FIELDS: ReportField[] = [
  { key:'date', label:'Date', kind:'date' }, { key:'regulation', label:'Scheme', kind:'text' }, { key:'role', label:'Role', kind:'text' },
  { key:'flightNumber', label:'Flight number', kind:'text' }, { key:'departure', label:'Departure', kind:'text' }, { key:'arrival', label:'Arrival', kind:'text' },
  { key:'dutyMinutes', label:'Duty duration', kind:'calculated' }, { key:'fdpMinutes', label:'FDP duration', kind:'calculated' },
  { key:'sectors', label:'Sectors', kind:'number' }, { key:'standby', label:'Standby hours', kind:'number' }, { key:'restBefore', label:'Rest before', kind:'number' },
  { key:'maxDuty', label:'Scheme max duty', kind:'number' }, { key:'maxFdp', label:'Scheme max FDP', kind:'number' }, { key:'minRest', label:'Scheme min rest', kind:'number' }, { key:'augmented', label:'Augmented crew', kind:'boolean' }
];

function reportValue(data: RecordData, key: string): string | number | boolean {
  if (key === 'dutyMinutes') return minutesBetweenZulu(String(data.dutyStart || ''), String(data.dutyEnd || '')) || 0;
  if (key === 'fdpMinutes') return minutesBetweenZulu(String(data.flightDutyStart || ''), String(data.flightDutyEnd || '')) || 0;
  return data[key] ?? '';
}
function matchesReportCondition(data: RecordData, condition: ReportCondition): boolean {
  const raw = reportValue(data, condition.field);
  if (condition.operator === 'truthy') return Boolean(raw);
  if (condition.operator === 'falsy') return !Boolean(raw);
  const left = String(raw ?? '').trim().toLowerCase();
  const right = condition.value.trim().toLowerCase();
  if (condition.operator === 'contains') return left.includes(right);
  if (condition.operator === 'notContains') return !left.includes(right);
  if (condition.operator === 'equals') return left === right;
  if (condition.operator === 'notEquals') return left !== right;
  const a = Number(raw); const b = Number(condition.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (condition.operator === 'gt') return a > b;
  if (condition.operator === 'gte') return a >= b;
  if (condition.operator === 'lt') return a < b;
  if (condition.operator === 'lte') return a <= b;
  return true;
}
function calculateMetric(records: any[], metric: ReportMetric): number {
  if (metric.operation === 'count') return records.length;
  const values = records.map(entry => reportValue(entry.data || {}, metric.field));
  if (metric.operation === 'unique') return new Set(values.map(value => String(value ?? '').trim()).filter(Boolean)).size;
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return 0;
  if (metric.operation === 'sum') return numeric.reduce((a,b)=>a+b,0);
  if (metric.operation === 'avg') return numeric.reduce((a,b)=>a+b,0) / numeric.length;
  if (metric.operation === 'min') return Math.min(...numeric);
  if (metric.operation === 'max') return Math.max(...numeric);
  return 0;
}
function metricDisplay(metric: ReportMetric, value: number) {
  if (metric.field === 'dutyMinutes' || metric.field === 'fdpMinutes') return formatMinutes(Math.round(value));
  if (metric.operation === 'count' || metric.operation === 'unique' || /Landings|sectors/i.test(metric.label)) return String(Math.round(value));
  return value.toFixed(1);
}
function approachCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  return text.split(/[,;|\n]+/).map(part => part.trim()).filter(Boolean).length;
}
function dateDaysAgo(days: number): string {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - Math.max(0, days)); return d.toISOString().slice(0,10);
}
function calendarMonthsAgo(months: number): string {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); d.setMonth(d.getMonth() - Math.max(0, months - 1)); return d.toISOString().slice(0,10);
}
function zuluNow(date = new Date()) { return `${date.getUTCHours().toString().padStart(2,'0')}:${date.getUTCMinutes().toString().padStart(2,'0')}z`; }
function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`); if (Number.isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
function nthEventExpiry(records: any[], field: string, required: number, windowDays: number): string {
  if (required <= 0) return '';
  const events: string[] = [];
  for (const entry of records) {
    const date = String(entry.data?.date || ''); const count = Math.max(0, Math.round(Number(entry.data?.[field] || 0)));
    for (let i=0;i<count;i++) events.push(date);
  }
  events.sort((a,b)=>b.localeCompare(a));
  const anchor = events[required-1]; return anchor ? addDaysIso(anchor, windowDays) : '';
}
function today() { return new Date().toISOString().slice(0, 10); }
function recordDate(flight: FlightSummary) {
  const value = String(flight.flightDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10);
}
function flightKey(flight: FlightSummary) { return `${flight.release}.${flight.origin}${flight.destination}`; }
function baseLog(flight: FlightSummary, block: number, airborne: number, presets: RecordPresets, times: { out: string; off: string; on: string; in: string }): RecordData {
  return {
    date: recordDate(flight), scheduledOut: flight.schedOut, scheduledIn: flight.schedIn, departure: flight.origin, arrival: flight.destination,
    aircraftType: flight.aircraft, registration: flight.registration, flightNumber: `${flight.airline}${flight.flightNumber}`,
    out: times.out, off: times.off, on: times.on, in: times.in, totalTime: block, flightTime: airborne,
    pic: presets.role === 'PIC' ? block : 0, sic: presets.role === 'SIC' ? block : 0, dual: presets.role === 'Dual' ? block : 0,
    instructor: presets.role === 'Instructor' ? block : 0, night: presets.defaultNight, instrument: presets.defaultInstrument, simulatedInstrument: presets.defaultSimulatedInstrument,
    crossCountry: presets.crossCountry ? block : 0, dayLandings: presets.defaultDayLandings, nightLandings: presets.defaultNightLandings, approaches: presets.defaultApproaches, operation: presets.operation,
    role: presets.role, rules: presets.rules, holds: 0, tracking: false, remarks: presets.defaultRemarks, attested: false, signerName: presets.defaultSigner
  };
}
function baseDuty(flight: FlightSummary, times: { in: string }, presets: RecordPresets): RecordData {
  const report = presets.autoDutyTimes ? addMinutesZulu(flight.schedOut, -presets.reportLeadMinutes) : '';
  return { date: recordDate(flight), regulation: presets.dutyRegulation, role: presets.dutyRole, scheduledOut: flight.schedOut, scheduledIn: flight.schedIn,
    flightRecordId: '', flightReference: `${recordDate(flight)}|${flight.origin}|${flight.destination}|${flight.airline}${flight.flightNumber}`, departure: flight.origin, arrival: flight.destination, flightNumber: `${flight.airline}${flight.flightNumber}`,
    dutyStart: report, reportTime: report, flightDutyStart: report, flightDutyEnd: times.in,
    dutyEnd: presets.autoDutyTimes && times.in ? addMinutesZulu(times.in, presets.postFlightMinutes) : '',
    sectors: flight.origin !== '----' && flight.destination !== '----' ? 1 : 0, standby: 0, restBefore: presets.restBefore, maxDuty: presets.maxDuty, maxFdp: presets.maxFdp, minRest: presets.minRest,
    augmented: false, notes: '', attested: false, signerName: presets.defaultSigner };
}

export function RecordsPage({ flight, mode = 'logbook' }: { flight: FlightSummary; mode?: 'logbook' | 'duty' }) {
  const tab = mode;
  const [ledger, setLedger] = useState<AeroSlateLedger>(() => normalizeLedger(loadLocal(LEDGER_KEY, emptyLedger())));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const storedCloud = loadLocal<Partial<CloudPrefs>>(CLOUD_KEY, {});
  const [cloud, setCloud] = useState<CloudPrefs>(() => ({ gistId: storedCloud.gistId || '', token: storedCloud.rememberSecrets ? storedCloud.token || '' : '', passphrase: storedCloud.rememberSecrets ? storedCloud.passphrase || '' : '', autoSync: storedCloud.autoSync ?? true, rememberSecrets: storedCloud.rememberSecrets ?? false }));
  const [presets, setPresets] = useState<RecordPresets>(() => ({ ...DEFAULT_PRESETS, ...loadLocal<Partial<RecordPresets>>('aeroslate.records.presets', {}) }));
  const { times, blockMinutes, flightMinutes } = useOOOITimes(oooiStorageKey(flight.release, flight.origin, flight.destination));
  const blockHours = decimalHours(blockMinutes); const airborneHours = decimalHours(flightMinutes);
  const logKey = `aeroslate.records.draft.${flightKey(flight)}`; const dutyKey = `aeroslate.duty.draft.${flightKey(flight)}`;
  const [log, setLog] = useState<RecordData>(() => loadLocal(logKey, baseLog(flight, blockHours, airborneHours, presets, times)));
  const [duty, setDuty] = useState<RecordData>(() => loadLocal(dutyKey, baseDuty(flight, times, presets)));
  const entries = ledger.logbook; const duties = ledger.duty;
  const [recordSearch, setRecordSearch] = useState('');
  const [recordFrom, setRecordFrom] = useState('');
  const [recordTo, setRecordTo] = useState('');
  const [recordGroup, setRecordGroup] = useState<'none' | 'year' | 'aircraft' | 'registration' | 'role' | 'operation'>('none');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportConditions, setReportConditions] = useState<ReportCondition[]>([]);
  const [reportMetrics, setReportMetrics] = useState<ReportMetric[]>([
    { id:'count', field:'', operation:'count', label:'Records' },
    { id:'time', field:'totalTime', operation:'sum', label:'Block' }
  ]);
  const [reportGroupBy, setReportGroupBy] = useState('');
  const [trainingProfiles, setTrainingProfiles] = useState<TrainingProfile[]>(() => loadLocal<TrainingProfile[]>(TRAINING_KEY, []));
  const [activeTrainingId, setActiveTrainingId] = useState<string>(() => loadLocal<string>(TRAINING_ACTIVE_KEY, ''));
  const [trainingDraft, setTrainingDraft] = useState({ airline:'', aircraft:'', operation:'Part 121', position:'SIC' as 'PIC'|'SIC', authority:'FAA' as 'FAA'|'EASA' });
  const [careerPlans, setCareerPlans] = useState<CareerPlan[]>(() => loadLocal<CareerPlan[]>(CAREER_KEY, []));
  const [activeCareerId, setActiveCareerId] = useState<string>(() => loadLocal<string>(CAREER_ACTIVE_KEY, ''));
  const [careerDraft, setCareerDraft] = useState({ name:'', goal:'' });
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => saveLocal(LEDGER_KEY, ledger), [ledger]);
  useEffect(() => saveLocal(CLOUD_KEY, { gistId: cloud.gistId, token: cloud.rememberSecrets ? cloud.token : '', passphrase: cloud.rememberSecrets ? cloud.passphrase : '', autoSync: cloud.autoSync, rememberSecrets: cloud.rememberSecrets }), [cloud]);
  useEffect(() => saveLocal('aeroslate.records.presets', presets), [presets]);
  useEffect(() => saveLocal(TRAINING_KEY, trainingProfiles), [trainingProfiles]);
  useEffect(() => saveLocal(TRAINING_ACTIVE_KEY, activeTrainingId), [activeTrainingId]);
  useEffect(() => saveLocal(CAREER_KEY, careerPlans), [careerPlans]);
  useEffect(() => saveLocal(CAREER_ACTIVE_KEY, activeCareerId), [activeCareerId]);
  useEffect(() => { const timer = window.setInterval(() => setNowTick(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const refresh=()=>{setPresets({ ...DEFAULT_PRESETS, ...loadLocal<Partial<RecordPresets>>('aeroslate.records.presets', {}) });}; window.addEventListener('aeroslate-record-settings-updated',refresh); return()=>window.removeEventListener('aeroslate-record-settings-updated',refresh); }, []);
  useEffect(() => saveLocal(logKey, log), [logKey, log]); useEffect(() => saveLocal(dutyKey, duty), [dutyKey, duty]);
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(''), 6000); return () => window.clearTimeout(timer); }, [status]);
  useEffect(() => {
    const generated = baseLog(flight, blockHours, airborneHours, presets, times);
    setLog(current => ({ ...current, ...generated, remarks: current.remarks || '', approaches: current.approaches || '', holds: current.holds || 0, tracking: current.tracking || false, signerName: current.signerName || '', attested: current.attested || false }));
    const dutyBase = baseDuty(flight, times, presets);
    setDuty(current => ({ ...current, ...dutyBase, flightRecordId: current.flightRecordId || dutyBase.flightRecordId, regulation: current.regulation || dutyBase.regulation, role: current.role || dutyBase.role, notes: current.notes || '', signerName: current.signerName || '', attested: current.attested || false }));
  }, [flight.release, flight.origin, flight.destination, flight.aircraft, flight.registration, flight.flightNumber, flight.airline, flight.schedOut, flight.schedIn, flight.flightDate, times.out, times.off, times.on, times.in, blockHours, airborneHours, presets.role, presets.operation, presets.rules, presets.crossCountry, presets.autoDutyTimes, presets.reportLeadMinutes, presets.postFlightMinutes, presets.defaultNight, presets.defaultInstrument, presets.defaultSimulatedInstrument, presets.defaultDayLandings, presets.defaultNightLandings, presets.defaultApproaches, presets.defaultRemarks, presets.defaultSigner, presets.dutyRegulation, presets.dutyRole, presets.restBefore, presets.maxDuty, presets.maxFdp, presets.minRest]);

  const cloudConfig = (override?: Partial<GitHubCloudConfig>): GitHubCloudConfig => ({ token: cloud.token.trim(), gistId: cloud.gistId.trim(), passphrase: cloud.passphrase, ...override });
  const requireCloud = () => {
    if (!cloud.token.trim()) throw new Error('Enter a GitHub token with Gists read/write permission.');
    if (cloud.passphrase.trim().length < 12) throw new Error('Use a cloud encryption passphrase of at least 12 characters.');
  };
  const syncNow = async () => {
    try {
      requireCloud(); setBusy(true);
      const result = await synchronizeLedger(cloudConfig(), ledger);
      setLedger(result.ledger); setCloud(current => ({ ...current, gistId: result.gistId }));
      setStatus(`Encrypted cloud sync complete · ${result.ledger.logbook.length} flights · ${result.ledger.duty.length} duties.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Cloud sync failed.'); }
    finally { setBusy(false); }
  };
  const pullCloud = async () => {
    try {
      requireCloud(); if (!cloud.gistId.trim()) throw new Error('Enter or create a Gist ID first.'); setBusy(true);
      const remote = await readLedgerGist(cloudConfig()); const merged = mergeLedgers(ledger, remote); setLedger(merged);
      setStatus('Encrypted cloud ledger downloaded and merged with this device.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Cloud download failed.'); }
    finally { setBusy(false); }
  };
  const saveRecord = async (kind: RecordKind, data: RecordData) => {
    if (!data.attested || !String(data.signerName || '').trim()) { setStatus('Attest the record and enter the signer name before saving.'); return; }
    try {
      setBusy(true); let working = ledger;
      if (cloud.autoSync && cloud.token.trim() && cloud.passphrase.trim().length >= 12 && cloud.gistId.trim()) {
        try { working = mergeLedgers(working, await readLedgerGist(cloudConfig())); }
        catch { /* Save remains local when the cloud is temporarily unavailable. */ }
      }
      let recordData = { ...data };
      if (kind === 'duty' && !String(recordData.flightRecordId || '').trim()) {
        const match = working.logbook.slice().reverse().find(entry =>
          String(entry.data.date || '') === String(recordData.date || '') &&
          String(entry.data.departure || '') === String(recordData.departure || '') &&
          String(entry.data.arrival || '') === String(recordData.arrival || ''));
        if (match) recordData.flightRecordId = match.id;
      }
      const appended = await appendLedgerRecord(working, kind, recordData, deviceId); setLedger(appended.ledger);
      if (kind === 'logbook') setDuty(current => ({ ...current, flightRecordId: appended.record.id }));
      if (cloud.autoSync && cloud.token.trim() && cloud.passphrase.trim().length >= 12) {
        try {
          const gistId = await writeLedgerGist(cloudConfig(), appended.ledger); setCloud(current => ({ ...current, gistId }));
          setStatus(`${kind === 'logbook' ? 'Flight' : 'Duty'} saved locally and synchronized to the encrypted Gist.`);
        } catch (error) { setStatus(`${kind === 'logbook' ? 'Flight' : 'Duty'} saved locally. Cloud sync is pending: ${error instanceof Error ? error.message : 'unknown error'}`); }
      } else setStatus(`${kind === 'logbook' ? 'Flight' : 'Duty'} saved locally with an audit hash.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
    finally { setBusy(false); }
  };
  const exportRecords = (kind: RecordKind) => downloadText(`aeroslate-${kind}-${today()}.csv`, recordsToCsv(ledger[kind]), 'text/csv;charset=utf-8');
  const exportBackup = async () => {
    try { if (cloud.passphrase.trim().length < 12) throw new Error('Enter the encryption passphrase before creating a backup.'); const vault = await encryptLedger(ledger, cloud.passphrase); downloadText(`aeroslate-ledger-${today()}.vault.json`, vault, 'application/json'); setStatus('Encrypted ledger backup downloaded.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Backup failed.'); }
  };
  const restoreBackup = async (file?: File) => {
    if (!file) return;
    try { if (cloud.passphrase.trim().length < 12) throw new Error('Enter the backup encryption passphrase first.'); const restored = await decryptLedger(await file.text(), cloud.passphrase); setLedger(mergeLedgers(ledger, restored)); setStatus('Encrypted backup restored and merged.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Restore failed.'); }
    finally { if (restoreInput.current) restoreInput.current.value = ''; }
  };
  const update = (setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, value: string | number | boolean) => setter(current => ({ ...current, [key]: value }));
  const textInput = (data: RecordData, setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, label: string, type = 'text', step?: string) => <label><span>{label}</span><input type={type} step={step} value={String(data[key] ?? '')} onChange={event => update(setter, key, type === 'number' ? Number(event.target.value) : event.target.value)} /></label>;
  const selectInput = (data: RecordData, setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, label: string, options: string[]) => <label><span>{label}</span><select value={String(data[key] ?? '')} onChange={event => update(setter, key, event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  const synced = (value: unknown, label: string, note = 'Synced from active flight') => <label className="synced-field"><span>{label}<small>{note}</small></span><input readOnly value={String(value ?? '')} /></label>;
  const dutyZulu = (key: string, label: string, locked = false) => <label className={locked ? 'synced-field' : ''}><span>{label}{locked && <small>Auto-derived</small>}</span><ZuluTimeInput value={String(duty[key] || '')} readOnly={locked} onChange={value => update(setDuty, key, normalizeZulu(value))} /></label>;
  const dutyMinutes = useMemo(() => { const value = minutesBetweenZulu(String(duty.dutyStart || ''), String(duty.dutyEnd || '')); return value === null ? 0 : value; }, [duty.dutyStart, duty.dutyEnd]);
  const fdpMinutes = useMemo(() => { const value = minutesBetweenZulu(String(duty.flightDutyStart || ''), String(duty.flightDutyEnd || '')); return value === null ? 0 : value; }, [duty.flightDutyStart, duty.flightDutyEnd]);

  const dutyStatus = useMemo(() => {
    const now = zuluNow(nowTick);
    const date = String(duty.date || today());
    const clockMs = (clock: string, afterMs?: number) => {
      const normalized = normalizeZulu(clock); const match = normalized.match(/^(\d{2}):(\d{2})z$/); if (!match) return null;
      let value = Date.parse(`${date}T${match[1]}:${match[2]}:00Z`);
      if (afterMs !== undefined && value < afterMs) value += 86400000;
      return value;
    };
    const dutyStart = String(duty.dutyStart || ''); const dutyEnd = String(duty.dutyEnd || '');
    const fdpStart = String(duty.flightDutyStart || ''); const fdpEnd = String(duty.flightDutyEnd || '');
    const dutyStartMs = clockMs(dutyStart); const dutyEndMs = dutyStartMs === null ? null : clockMs(dutyEnd, dutyStartMs);
    const fdpStartMs = clockMs(fdpStart); const fdpEndMs = fdpStartMs === null ? null : clockMs(fdpEnd, fdpStartMs);
    const nowMs = nowTick.getTime();
    const dutyHasStarted = dutyStartMs !== null && nowMs >= dutyStartMs;
    const fdpHasStarted = fdpStartMs !== null && nowMs >= fdpStartMs;
    const activeDuty = Boolean(dutyHasStarted && !dutyEnd);
    const activeFdp = Boolean(fdpHasStarted && !fdpEnd);
    const elapsedDuty = dutyStartMs === null || !dutyHasStarted ? 0 : Math.max(0, Math.round(((dutyEndMs ?? nowMs) - dutyStartMs) / 60000));
    const elapsedFdp = fdpStartMs === null || !fdpHasStarted ? 0 : Math.max(0, Math.round(((fdpEndMs ?? nowMs) - fdpStartMs) / 60000));
    const maxDutyMin = Math.max(0, Number(duty.maxDuty || 0) * 60);
    const maxFdpMin = Math.max(0, Number(duty.maxFdp || duty.maxDuty || 0) * 60);
    const remainingDuty = maxDutyMin ? Math.max(0, maxDutyMin - elapsedDuty) : null;
    const remainingFdp = maxFdpMin ? Math.max(0, maxFdpMin - elapsedFdp) : null;
    const dutyLimit = dutyStart && maxDutyMin ? addMinutesZulu(dutyStart, maxDutyMin) : '';
    const fdpLimit = fdpStart && maxFdpMin ? addMinutesZulu(fdpStart, maxFdpMin) : '';
    const minRest = Math.max(0, Number(duty.minRest || 0));
    const restComplete = dutyEnd && minRest ? addMinutesZulu(dutyEnd, Math.round(minRest*60)) : '';
    const priorRestOk = Number(duty.restBefore || 0) >= minRest;
    return { now, activeDuty, activeFdp, dutyHasStarted, fdpHasStarted, elapsedDuty, elapsedFdp, remainingDuty, remainingFdp, dutyLimit, fdpLimit, minRest, restComplete, priorRestOk };
  }, [duty.date,duty.dutyStart,duty.dutyEnd,duty.flightDutyStart,duty.flightDutyEnd,duty.maxDuty,duty.maxFdp,duty.minRest,duty.restBefore,nowTick]);

  const filteredRecords = useMemo(() => {
    const source = tab === 'logbook' ? entries : duties;
    const q = recordSearch.trim().toLowerCase();
    return source.filter(entry => {
      const d = entry.data || {};
      const date = String(d.date || '');
      if (recordFrom && date && date < recordFrom) return false;
      if (recordTo && date && date > recordTo) return false;
      if (!q) return true;
      return Object.values(d).some(value => String(value ?? '').toLowerCase().includes(q));
    });
  }, [tab, entries, duties, recordSearch, recordFrom, recordTo]);

  const flightTotals = useMemo(() => {
    const sum = (key: string) => filteredRecords.reduce((total, entry) => total + Number(entry.data?.[key] || 0), 0);
    return { flights: filteredRecords.length, block: sum('totalTime'), airborne: sum('flightTime'), pic: sum('pic'), sic: sum('sic'), night: sum('night'), instrument: sum('instrument'), xc: sum('crossCountry'), landings: sum('dayLandings') + sum('nightLandings') };
  }, [filteredRecords]);

  const dutyTotals = useMemo(() => {
    let dutyMin = 0, fdpMin = 0, sectors = 0, standby = 0;
    for (const entry of filteredRecords) {
      const d = entry.data || {};
      dutyMin += minutesBetweenZulu(String(d.dutyStart || ''), String(d.dutyEnd || '')) || 0;
      fdpMin += minutesBetweenZulu(String(d.flightDutyStart || ''), String(d.flightDutyEnd || '')) || 0;
      sectors += Number(d.sectors || 0); standby += Number(d.standby || 0);
    }
    return { duties: filteredRecords.length, dutyMin, fdpMin, sectors, standby };
  }, [filteredRecords]);

  const groupedRecords = useMemo(() => {
    if (recordGroup === 'none') return [{ label: '', records: filteredRecords }];
    const groups = new Map<string, typeof filteredRecords>();
    for (const entry of filteredRecords) {
      const d = entry.data || {};
      const key = recordGroup === 'year' ? String(d.date || '').slice(0, 4) || 'Unknown' :
        recordGroup === 'aircraft' ? String(d.aircraftType || 'Unknown') :
        recordGroup === 'registration' ? String(d.registration || 'Unknown') :
        recordGroup === 'role' ? String(d.role || 'Unknown') : String(d.operation || d.regulation || 'Unknown');
      groups.set(key, [...(groups.get(key) || []), entry]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, records]) => ({ label, records }));
  }, [filteredRecords, recordGroup]);

  const reportFields = tab === 'logbook' ? FLIGHT_REPORT_FIELDS : DUTY_REPORT_FIELDS;
  useEffect(() => {
    setReportConditions([]);
    setReportGroupBy('');
    setReportMetrics(tab === 'logbook'
      ? [{ id:'count', field:'', operation:'count', label:'Flights' }, { id:'block', field:'totalTime', operation:'sum', label:'Block' }]
      : [{ id:'count', field:'', operation:'count', label:'Duties' }, { id:'duty', field:'dutyMinutes', operation:'sum', label:'Duty' }]);
  }, [tab]);
  const reportRecords = useMemo(() => filteredRecords.filter(entry => reportConditions.every(condition => matchesReportCondition(entry.data || {}, condition))), [filteredRecords, reportConditions]);
  const reportRows = useMemo(() => {
    const buckets = new Map<string, typeof reportRecords>();
    if (!reportGroupBy) buckets.set('All matching records', reportRecords);
    else for (const entry of reportRecords) {
      const raw = reportValue(entry.data || {}, reportGroupBy);
      const key = String(raw || 'Unknown');
      buckets.set(key, [...(buckets.get(key) || []), entry]);
    }
    return [...buckets.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([label, records]) => ({ label, records, values: reportMetrics.map(metric => calculateMetric(records, metric)) }));
  }, [reportRecords, reportGroupBy, reportMetrics]);
  const addReportCondition = () => setReportConditions(current => [...current, { id: crypto.randomUUID(), field: reportFields[0]?.key || 'date', operator:'equals', value:'' }]);
  const addReportMetric = () => setReportMetrics(current => [...current, { id: crypto.randomUUID(), field: tab === 'logbook' ? 'totalTime' : 'dutyMinutes', operation:'sum', label: tab === 'logbook' ? 'Block' : 'Duty' }]);

  const analyticsToolbar = <div className="records-analytics-toolbar">
    <label className="records-search"><Search size={15}/><input value={recordSearch} onChange={e=>setRecordSearch(e.target.value)} placeholder="Search airport, tail, type, flight, role…"/></label>
    <label><span>From</span><input type="date" value={recordFrom} onChange={e=>setRecordFrom(e.target.value)}/></label>
    <label><span>To</span><input type="date" value={recordTo} onChange={e=>setRecordTo(e.target.value)}/></label>
    <label><span>Group</span><select value={recordGroup} onChange={e=>setRecordGroup(e.target.value as any)}><option value="none">None</option><option value="year">Year</option>{tab==='logbook'&&<><option value="aircraft">Aircraft type</option><option value="registration">Registration</option><option value="role">Role</option><option value="operation">Operation</option></>}{tab==='duty'&&<option value="operation">Scheme</option>}</select></label>
    {(recordSearch||recordFrom||recordTo||recordGroup!=='none')&&<button className="compact" onClick={()=>{setRecordSearch('');setRecordFrom('');setRecordTo('');setRecordGroup('none')}}><X size={14}/> Clear</button>}
  </div>;

  const reportBuilder = <div className="records-report-builder">
    <button className="records-report-toggle" onClick={()=>setReportOpen(value=>!value)}><span><Calculator size={16}/><strong>Custom totals</strong><small>{reportRecords.length} matching · calculate any combination</small></span>{reportOpen?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
    {reportOpen && <div className="records-report-body">
      <div className="records-report-section-head"><div><strong>Filters</strong><span>All conditions are combined</span></div><button className="compact" onClick={addReportCondition}><Plus size={13}/> Filter</button></div>
      <div className="records-report-rules">
        {reportConditions.map(condition => {
          const field = reportFields.find(item=>item.key===condition.field);
          const operators: {value:ReportOperator;label:string}[] = field?.kind==='boolean'
            ? [{value:'truthy',label:'Yes / true'},{value:'falsy',label:'No / false'}]
            : field?.kind==='number'||field?.kind==='calculated'
              ? [{value:'equals',label:'='},{value:'notEquals',label:'≠'},{value:'gt',label:'>'},{value:'gte',label:'≥'},{value:'lt',label:'<'},{value:'lte',label:'≤'}]
              : [{value:'equals',label:'Is'},{value:'notEquals',label:'Is not'},{value:'contains',label:'Contains'},{value:'notContains',label:'Does not contain'}];
          return <div className="records-report-rule" key={condition.id}>
            <select value={condition.field} onChange={e=>setReportConditions(rows=>rows.map(row=>row.id===condition.id?{...row,field:e.target.value,value:''}:row))}>{reportFields.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
            <select value={condition.operator} onChange={e=>setReportConditions(rows=>rows.map(row=>row.id===condition.id?{...row,operator:e.target.value as ReportOperator}:row))}>{operators.map(op=><option key={op.value} value={op.value}>{op.label}</option>)}</select>
            {!['truthy','falsy'].includes(condition.operator)&&<input value={condition.value} onChange={e=>setReportConditions(rows=>rows.map(row=>row.id===condition.id?{...row,value:e.target.value}:row))} placeholder="Value"/>}
            <button className="icon-button compact" title="Remove filter" onClick={()=>setReportConditions(rows=>rows.filter(row=>row.id!==condition.id))}><Trash2 size={14}/></button>
          </div>;
        })}
        {!reportConditions.length&&<span className="records-report-empty">No extra filters — using the records shown above.</span>}
      </div>
      <div className="records-report-section-head"><div><strong>Totals</strong><span>Choose exactly what AeroSlate should calculate</span></div><button className="compact" onClick={addReportMetric}><Plus size={13}/> Total</button></div>
      <div className="records-report-metrics-editor">
        {reportMetrics.map(metric=><div className="records-report-metric-edit" key={metric.id}>
          <select value={metric.operation} onChange={e=>setReportMetrics(rows=>rows.map(row=>row.id===metric.id?{...row,operation:e.target.value as MetricOperation}:row))}><option value="sum">Total</option><option value="avg">Average</option><option value="min">Minimum</option><option value="max">Maximum</option><option value="count">Count records</option><option value="unique">Count unique</option></select>
          {metric.operation!=='count'&&<select value={metric.field} onChange={e=>{const field=reportFields.find(item=>item.key===e.target.value);setReportMetrics(rows=>rows.map(row=>row.id===metric.id?{...row,field:e.target.value,label:field?.label||row.label}:row))}}>{reportFields.filter(item=>metric.operation==='unique'||['number','calculated'].includes(item.kind)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>}
          <input value={metric.label} onChange={e=>setReportMetrics(rows=>rows.map(row=>row.id===metric.id?{...row,label:e.target.value}:row))} placeholder="Label"/>
          <button className="icon-button compact" title="Remove total" onClick={()=>setReportMetrics(rows=>rows.filter(row=>row.id!==metric.id))}><Trash2 size={14}/></button>
        </div>)}
      </div>
      <label className="records-report-group"><span>Break down by</span><select value={reportGroupBy} onChange={e=>setReportGroupBy(e.target.value)}><option value="">No grouping</option>{reportFields.filter(item=>!['number','calculated'].includes(item.kind)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <div className="records-report-results">
        <div className="records-report-results-head"><strong>{reportGroupBy?'Breakdown':'Calculated totals'}</strong><span>{reportRecords.length} records</span></div>
        <div className="records-report-table-wrap"><table className="records-report-table"><thead><tr><th>{reportGroupBy?(reportFields.find(item=>item.key===reportGroupBy)?.label||'Group'):'Selection'}</th>{reportMetrics.map(metric=><th key={metric.id}>{metric.label||metric.operation}</th>)}</tr></thead><tbody>{reportRows.map(row=><tr key={row.label}><td>{row.label}</td>{row.values.map((value,index)=><td key={reportMetrics[index]?.id}>{metricDisplay(reportMetrics[index],value)}</td>)}</tr>)}</tbody></table></div>
      </div>
    </div>}
  </div>;

  const activeTraining = trainingProfiles.find(profile=>profile.id===activeTrainingId) || trainingProfiles[0] || null;
  const trainingSummary = useMemo(() => {
    if (!activeTraining) return { current:0, due:0, expired:0, open:0 };
    return activeTraining.requirements.reduce((acc,item)=>{ acc[trainingStatus(item)] += 1; return acc; }, { current:0, due:0, expired:0, open:0 });
  }, [activeTraining]);
  const aircraftCurrency = useMemo(() => {
    if (!activeTraining) return null;
    const cfg={...DEFAULT_AIRCRAFT_CURRENCY,...(activeTraining.currency||{})};
    const cutoff=new Date(); cutoff.setUTCDate(cutoff.getUTCDate()-Math.max(1,cfg.lookbackDays)); const cutoffIso=cutoff.toISOString().slice(0,10);
    const aircraftKey=activeTraining.aircraft.trim().toLowerCase(); const regKey=cfg.registrationFilter.trim().toLowerCase();
    const matched=entries.filter(entry=>{ const d=entry.data; const type=String(d.aircraftType||'').trim().toLowerCase(); const reg=String(d.registration||'').trim().toLowerCase(); const date=String(d.date||''); const roleTime=activeTraining.position==='PIC'?Number(d.pic||0):Number(d.sic||0); return type===aircraftKey && (!regKey||reg===regKey) && date>=cutoffIso && roleTime>0; });
    const sum=(key:string)=>matched.reduce((total,entry)=>total+Number(entry.data[key]||0),0);
    const hours=activeTraining.position==='PIC'?sum('pic'):sum('sic'); const dayLandings=sum('dayLandings'); const nightLandings=sum('nightLandings'); const approaches=matched.reduce((t,e)=>t+approachCount(e.data.approaches),0); const holds=sum('holds'); const tracking=matched.some(e=>Boolean(e.data.tracking));
    const lastFlight=matched.map(e=>String(e.data.date||'')).sort().at(-1)||'';
    const checks=[
      {label:'Flights',value:matched.length,target:cfg.requiredFlights}, {label:`${activeTraining.position} hours`,value:hours,target:cfg.requiredHours,decimal:true},
      {label:'Day landings',value:dayLandings,target:cfg.requiredDayLandings}, {label:'Night landings',value:nightLandings,target:cfg.requiredNightLandings},
      {label:'Approaches',value:approaches,target:cfg.requiredApproaches}, {label:'Holds',value:holds,target:cfg.requiredHolds},
    ];
    const required=checks.filter(c=>c.target>0); const current=required.every(c=>c.value>=c.target) && (!cfg.requireTracking||tracking);
    return { cfg, matched, hours, dayLandings, nightLandings, approaches, holds, tracking, lastFlight, checks, current };
  }, [activeTraining,entries]);
  const updateAircraftCurrency=(patch:Partial<AircraftCurrencyConfig>)=>{ if(!activeTraining)return; setTrainingProfiles(current=>current.map(profile=>profile.id===activeTraining.id?{...profile,currency:{...DEFAULT_AIRCRAFT_CURRENCY,...(profile.currency||{}),...patch}}:profile)); };
  const createTrainingProfile = () => {
    if (!trainingDraft.airline.trim() || !trainingDraft.aircraft.trim()) { setStatus('Enter an airline/operator and aircraft/type first.'); return; }
    const id=`training-${Date.now()}`; const profile:TrainingProfile={ id, airline:trainingDraft.airline.trim(), aircraft:trainingDraft.aircraft.trim(), operation:trainingDraft.operation, position:trainingDraft.position, authority:trainingDraft.authority, createdAt:new Date().toISOString(), requirements:baselineTraining(trainingDraft.authority,trainingDraft.operation,trainingDraft.position), currency:{...DEFAULT_AIRCRAFT_CURRENCY} };
    setTrainingProfiles(current=>[...current,profile]); setActiveTrainingId(id); setStatus('Training & qualification matrix created. Review operator-specific items and enter completion dates.');
  };
  const updateTrainingRequirement = (profileId:string, requirementId:string, patch:Partial<TrainingRequirement>) => setTrainingProfiles(current=>current.map(profile=>profile.id!==profileId?profile:{...profile,requirements:profile.requirements.map(item=>item.id===requirementId?{...item,...patch}:item)}));
  const addTrainingRequirement = () => { if(!activeTraining)return; const item=req('Custom requirement','Operator','Operator / authority program',12,''); setTrainingProfiles(current=>current.map(profile=>profile.id===activeTraining.id?{...profile,requirements:[...profile.requirements,item]}:profile)); };
  const removeTrainingRequirement = (requirementId:string) => { if(!activeTraining)return; setTrainingProfiles(current=>current.map(profile=>profile.id===activeTraining.id?{...profile,requirements:profile.requirements.filter(item=>item.id!==requirementId)}:profile)); };
  const deleteTrainingProfile = () => { if(!activeTraining)return; const remaining=trainingProfiles.filter(profile=>profile.id!==activeTraining.id); setTrainingProfiles(remaining); setActiveTrainingId(remaining[0]?.id||''); };

  const activeCareer = careerPlans.find(plan=>plan.id===activeCareerId) || careerPlans[0] || null;
  const careerRequirementValue = (item:CareerRequirement) => {
    if (item.kind==='manual') return item.completed ? 1 : 0;
    const aircraft=item.aircraftFilter.trim().toLowerCase(); const operation=item.operationFilter.trim().toLowerCase(); const role=item.roleFilter.trim().toUpperCase();
    const matched=entries.filter(entry=>{ const d=entry.data||{}; const type=String(d.aircraftType||'').toLowerCase(); const op=String(d.operation||'').toLowerCase(); const rowRole=String(d.role||'').toUpperCase(); return (!aircraft||type.includes(aircraft))&&(!operation||op.includes(operation))&&(!role||role==='ANY'||rowRole===role); });
    if(item.metric==='flights') return matched.length;
    if(item.metric==='uniqueTails') return new Set(matched.map(entry=>String(entry.data?.registration||'').trim()).filter(Boolean)).size;
    if(item.metric==='uniqueTypes') return new Set(matched.map(entry=>String(entry.data?.aircraftType||'').trim()).filter(Boolean)).size;
    if(item.metric==='approaches') return matched.reduce((total,entry)=>total+approachCount(entry.data?.approaches),0);
    return matched.reduce((total,entry)=>total+Number(entry.data?.[item.metric]||0),0);
  };
  const careerStats = useMemo(()=>{
    if(!activeCareer) return null;
    const stages=activeCareer.stages.map(stage=>{ const reqs=stage.requirements.map(item=>{ const value=careerRequirementValue(item); const target=item.kind==='manual'?1:Math.max(0,item.target); const complete=item.kind==='manual'?item.completed:(target<=0?true:value>=target); return {item,value,target,complete}; }); const complete=reqs.length>0&&reqs.every(row=>row.complete); const progress=reqs.length?reqs.reduce((sum,row)=>sum+(row.complete?1:Math.min(1,row.target>0?row.value/row.target:1)),0)/reqs.length:0; return {stage,reqs,complete,progress}; });
    const totalReq=stages.reduce((n,row)=>n+row.reqs.length,0); const completedReq=stages.reduce((n,row)=>n+row.reqs.filter(req=>req.complete).length,0); const currentIndex=Math.max(0,stages.findIndex(row=>!row.complete)); const current=stages.length?(stages.find(row=>!row.complete)||stages[stages.length-1]):null; return {stages,totalReq,completedReq,percent:totalReq?Math.round(completedReq/totalReq*100):0,current,currentIndex};
  },[activeCareer,entries]);
  const createCareerPlan=()=>{ const name=careerDraft.name.trim(); if(!name){setStatus('Name the career progression first.');return;} const id=`career-${Date.now()}`; const plan:CareerPlan={id,name,goal:careerDraft.goal.trim(),createdAt:new Date().toISOString(),stages:[{id:`stage-${Date.now()}`,title:'Next step',targetDate:'',notes:'',requirements:[]}]}; setCareerPlans(rows=>[...rows,plan]);setActiveCareerId(id);setCareerDraft({name:'',goal:''});setStatus('Career progression created. Add stages and logbook-linked or manual gates.'); };
  const updateCareerPlan=(patch:Partial<CareerPlan>)=>{if(!activeCareer)return;setCareerPlans(rows=>rows.map(plan=>plan.id===activeCareer.id?{...plan,...patch}:plan));};
  const addCareerStage=()=>{if(!activeCareer)return;const stage:CareerStage={id:`stage-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,title:'New stage',targetDate:'',notes:'',requirements:[]};updateCareerPlan({stages:[...activeCareer.stages,stage]});};
  const updateCareerStage=(stageId:string,patch:Partial<CareerStage>)=>{if(!activeCareer)return;updateCareerPlan({stages:activeCareer.stages.map(stage=>stage.id===stageId?{...stage,...patch}:stage)});};
  const removeCareerStage=(stageId:string)=>{if(!activeCareer)return;updateCareerPlan({stages:activeCareer.stages.filter(stage=>stage.id!==stageId)});};
  const addCareerRequirement=(stageId:string,kind:'auto'|'manual')=>{if(!activeCareer)return;const item:CareerRequirement={id:`career-req-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,label:kind==='manual'?'Manual milestone':'Total time',kind,metric:'totalTime',target:kind==='manual'?1:1000,aircraftFilter:'',operationFilter:'',roleFilter:'Any',completed:false,notes:''};updateCareerPlan({stages:activeCareer.stages.map(stage=>stage.id===stageId?{...stage,requirements:[...stage.requirements,item]}:stage)});};
  const updateCareerRequirement=(stageId:string,reqId:string,patch:Partial<CareerRequirement>)=>{if(!activeCareer)return;updateCareerPlan({stages:activeCareer.stages.map(stage=>stage.id===stageId?{...stage,requirements:stage.requirements.map(item=>item.id===reqId?{...item,...patch}:item)}:stage)});};
  const removeCareerRequirement=(stageId:string,reqId:string)=>{if(!activeCareer)return;updateCareerPlan({stages:activeCareer.stages.map(stage=>stage.id===stageId?{...stage,requirements:stage.requirements.filter(item=>item.id!==reqId)}:stage)});};
  const deleteCareerPlan=()=>{if(!activeCareer)return;const remaining=careerPlans.filter(plan=>plan.id!==activeCareer.id);setCareerPlans(remaining);setActiveCareerId(remaining[0]?.id||'');};

  const recordDetail = selectedRecord && <div className="record-detail-panel">
    <div className="record-detail-head"><div><strong>{tab==='logbook'?'Flight record':'Duty record'}</strong><span>{String(selectedRecord.data?.date||'')} · {String(selectedRecord.data?.flightNumber||'')}</span></div><button className="icon-button" onClick={()=>setSelectedRecord(null)}><X size={17}/></button></div>
    <div className="record-detail-grid">{Object.entries(selectedRecord.data || {}).filter(([,value])=>value!==''&&value!==null&&value!==undefined).map(([key,value])=><div key={key}><span>{key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</span><strong>{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</strong></div>)}</div>
    <div className="record-audit-line">Audit {selectedRecord.auditHash} · Device sequence {selectedRecord.sequence}</div>
  </div>;

  return <div className="records-page">
    <section className="card records-connect cloud-records"><header><div><ShieldCheck size={18} /><h3>Free encrypted cloud records</h3></div><span className="pill good">NO RENDER DISK</span></header><div className="card-body">
      <div className="cloud-explainer"><HardDrive size={20} /><div><strong>Local-first, cloud-backed</strong><p>Every entry is written to this device first. Optional sync encrypts the complete ledger in your browser and stores only ciphertext in a private GitHub Gist. Your token and passphrase are never sent to Render.</p></div></div>
      <div className="form-grid three cloud-fields"><label><span>GitHub token</span><input type="password" value={cloud.token} onChange={event => setCloud({ ...cloud, token: event.target.value })} placeholder="Fine-grained token · Gists write" /></label><label><span>Encryption passphrase</span><input type="password" value={cloud.passphrase} onChange={event => setCloud({ ...cloud, passphrase: event.target.value })} placeholder="At least 12 characters" /></label><label><span>Private Gist ID</span><input value={cloud.gistId} onChange={event => setCloud({ ...cloud, gistId: event.target.value.trim() })} placeholder="Created automatically on first sync" /></label></div>
      <div className="cloud-controls"><label className="check-inline"><input type="checkbox" checked={cloud.autoSync} onChange={event => setCloud({ ...cloud, autoSync: event.target.checked })} /> Sync after each saved entry</label><label className="check-inline"><input type="checkbox" checked={cloud.rememberSecrets} onChange={event => setCloud({ ...cloud, rememberSecrets: event.target.checked })} /> Remember token and passphrase on this device</label><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer"><KeyRound size={15} /> Create GitHub token</a></div>
      <div className="button-row cloud-buttons"><button className="primary" onClick={() => void syncNow()} disabled={busy}><CloudUpload size={16} /> {busy ? 'Working…' : cloud.gistId ? 'Sync now' : 'Create cloud vault'}</button><button onClick={() => void pullCloud()} disabled={busy || !cloud.gistId}><CloudDownload size={16} /> Pull cloud</button><button onClick={() => void exportBackup()}><Download size={16} /> Encrypted backup</button><button onClick={() => restoreInput.current?.click()}><Upload size={16} /> Restore backup</button><input ref={restoreInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void restoreBackup(event.target.files?.[0])} /></div>
      <div className="cloud-stats"><div><strong>{entries.length}</strong><span>Flights on device</span></div><div><strong>{duties.length}</strong><span>Duties on device</span></div><div><strong>{ledger.trips.length}</strong><span>Scheduled trips</span></div><div><strong>{ledger.audit.length}</strong><span>Audit events</span></div><div><strong>{cloud.gistId ? 'CONNECTED' : 'LOCAL'}</strong><span>Storage state</span></div></div>
      {status && <div className="notice records-status">{status}</div>}
    </div></section>


    {tab === 'logbook' && <section className="card training-compliance-card"><header><div><BookOpenCheck size={18}/><h3>Training & qualification records</h3></div><span className="pill neutral">REGULATORY BASELINE</span></header><div className="card-body">
      <div className="training-profile-builder">
        <label><span>Airline / operator</span><input value={trainingDraft.airline} onChange={e=>setTrainingDraft({...trainingDraft,airline:e.target.value})} placeholder="e.g. Example Air"/></label>
        <label><span>Aircraft / type</span><input value={trainingDraft.aircraft} onChange={e=>setTrainingDraft({...trainingDraft,aircraft:e.target.value})} placeholder="e.g. B737 / CE-560XL"/></label>
        <label><span>Authority</span><select value={trainingDraft.authority} onChange={e=>{const authority=e.target.value as 'FAA'|'EASA'; setTrainingDraft({...trainingDraft,authority,operation:authority==='FAA'?'Part 121':'EASA CAT'});}}><option>FAA</option><option>EASA</option></select></label>
        <label><span>Operation</span><select value={trainingDraft.operation} onChange={e=>setTrainingDraft({...trainingDraft,operation:e.target.value})}>{(trainingDraft.authority==='FAA'?['Part 91','Part 121','Part 135']:['EASA CAT','EASA NCC','EASA NCO']).map(value=><option key={value}>{value}</option>)}</select></label>
        <label><span>Position</span><select value={trainingDraft.position} onChange={e=>setTrainingDraft({...trainingDraft,position:e.target.value as 'PIC'|'SIC'})}><option>PIC</option><option>SIC</option></select></label>
        <button className="primary" onClick={createTrainingProfile}><Plus size={15}/> Generate record</button>
      </div>
      {trainingProfiles.length>0 && <div className="training-profile-selector"><label><span>Active record</span><select value={activeTraining?.id||''} onChange={e=>setActiveTrainingId(e.target.value)}>{trainingProfiles.map(profile=><option value={profile.id} key={profile.id}>{profile.airline} · {profile.aircraft} · {profile.operation} · {profile.position}</option>)}</select></label><button className="danger-button compact" onClick={deleteTrainingProfile}><Trash2 size={14}/> Delete record</button></div>}
      {activeTraining ? <>
        <div className="training-summary"><div><span>Current</span><strong>{trainingSummary.current}</strong></div><div className="warn"><span>Due ≤45d</span><strong>{trainingSummary.due}</strong></div><div className="bad"><span>Expired</span><strong>{trainingSummary.expired}</strong></div><div><span>Needs entry</span><strong>{trainingSummary.open}</strong></div></div>
        <div className="training-identity"><strong>{activeTraining.airline}</strong><span>{activeTraining.aircraft} · {activeTraining.authority} {activeTraining.operation} · {activeTraining.position}</span></div>
        <div className="training-section-divider"><div><Plane size={16}/><strong>Aircraft currency & recent experience</strong></div><span>LOGBOOK-DERIVED</span></div>
        {aircraftCurrency && <div className="aircraft-currency-panel">
          <div className="aircraft-currency-head"><div><strong>Aircraft currency</strong><span>{activeTraining.aircraft}{aircraftCurrency.cfg.registrationFilter?` · ${aircraftCurrency.cfg.registrationFilter}`:''} · rolling {aircraftCurrency.cfg.lookbackDays} days · {activeTraining.position}</span></div><span className={`pill ${aircraftCurrency.current?'good':'warn'}`}>{aircraftCurrency.current?'CURRENT':'ACTION NEEDED'}</span></div>
          <div className="aircraft-currency-grid">
            <div><span>Last flight</span><strong>{aircraftCurrency.lastFlight||'—'}</strong><small>{aircraftCurrency.matched.length} qualifying flight{aircraftCurrency.matched.length===1?'':'s'}</small></div>
            {aircraftCurrency.checks.map(check=><div className={check.target>0&&check.value<check.target?'attention':'good'} key={check.label}><span>{check.label}</span><strong>{check.decimal?check.value.toFixed(1):check.value}{check.target>0?` / ${check.target}`:''}</strong><small>{check.target>0?(check.value>=check.target?'target met':`${Math.max(0,check.target-check.value).toFixed(check.decimal?1:0)} remaining`):'tracking only'}</small></div>)}
            <div className={aircraftCurrency.cfg.requireTracking&&!aircraftCurrency.tracking?'attention':'good'}><span>Intercept / track</span><strong>{aircraftCurrency.tracking?'YES':'NO'}</strong><small>{aircraftCurrency.cfg.requireTracking?'required in window':'tracking only'}</small></div>
          </div>
          <details className="aircraft-currency-settings"><summary>Aircraft currency rules</summary><div className="aircraft-currency-settings-grid">
            <label><span>Rolling window (days)</span><input type="number" min="1" value={aircraftCurrency.cfg.lookbackDays} onChange={e=>updateAircraftCurrency({lookbackDays:Number(e.target.value)||90})}/></label>
            <label><span>Registration (optional)</span><input value={aircraftCurrency.cfg.registrationFilter} placeholder="All tails of this type" onChange={e=>updateAircraftCurrency({registrationFilter:e.target.value})}/></label>
            <label><span>Required flights</span><input type="number" min="0" value={aircraftCurrency.cfg.requiredFlights} onChange={e=>updateAircraftCurrency({requiredFlights:Number(e.target.value)||0})}/></label>
            <label><span>Required {activeTraining.position} hours</span><input type="number" min="0" step="0.1" value={aircraftCurrency.cfg.requiredHours} onChange={e=>updateAircraftCurrency({requiredHours:Number(e.target.value)||0})}/></label>
            <label><span>Day landings</span><input type="number" min="0" value={aircraftCurrency.cfg.requiredDayLandings} onChange={e=>updateAircraftCurrency({requiredDayLandings:Number(e.target.value)||0})}/></label>
            <label><span>Night landings</span><input type="number" min="0" value={aircraftCurrency.cfg.requiredNightLandings} onChange={e=>updateAircraftCurrency({requiredNightLandings:Number(e.target.value)||0})}/></label>
            <label><span>Approaches</span><input type="number" min="0" value={aircraftCurrency.cfg.requiredApproaches} onChange={e=>updateAircraftCurrency({requiredApproaches:Number(e.target.value)||0})}/></label>
            <label><span>Holds</span><input type="number" min="0" value={aircraftCurrency.cfg.requiredHolds} onChange={e=>updateAircraftCurrency({requiredHolds:Number(e.target.value)||0})}/></label>
            <label className="check-inline"><input type="checkbox" checked={aircraftCurrency.cfg.requireTracking} onChange={e=>updateAircraftCurrency({requireTracking:e.target.checked})}/> Require intercept/track</label>
          </div></details>
          <p className="currency-disclaimer">Aircraft currency is calculated from saved flight-log entries matching this aircraft/type, crew position and optional registration. Set the rolling window and targets to the operator or authority rule that actually applies.</p>
        </div>}
        <div className="training-matrix">
          <div className="training-matrix-head"><span>Requirement</span><span>Basis</span><span>Last completed</span><span>Interval</span><span>Due</span><span>Evidence / notes</span><span></span></div>
          {activeTraining.requirements.map(item=>{const state=trainingStatus(item),due=trainingDue(item);return <div className={`training-row ${state}`} key={item.id}>
            <div><input className="training-title-input" value={item.title} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{title:e.target.value})}/><small>{item.category}</small></div>
            <div><input value={item.basis} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{basis:e.target.value})}/></div>
            <div><input type="date" value={item.lastCompleted} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{lastCompleted:e.target.value})}/><button className="tiny-button" onClick={()=>updateTrainingRequirement(activeTraining.id,item.id,{lastCompleted:today(),dueOverride:''})}>Today</button></div>
            <div><input type="number" min="0" value={item.intervalMonths||''} placeholder="months" onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{intervalMonths:Number(e.target.value)})}/></div>
            <div><input type="date" value={item.dueOverride} placeholder={due||''} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{dueOverride:e.target.value})}/><strong className={`training-status ${state}`}>{state==='current'?'CURRENT':state==='due'?'DUE SOON':state==='expired'?'EXPIRED':'ENTER DATE'}</strong><small>{due&&!item.dueOverride?`Auto ${due}`:item.dueOverride?'Manual due':''}</small></div>
            <div><input value={item.evidence} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{evidence:e.target.value})} placeholder="check airman / cert / record #"/><textarea value={item.notes} onChange={e=>updateTrainingRequirement(activeTraining.id,item.id,{notes:e.target.value})} placeholder="operator-specific notes"/></div>
            <button className="icon-button danger-button" title="Remove requirement" onClick={()=>removeTrainingRequirement(item.id)}><Trash2 size={14}/></button>
          </div>})}
        </div>
        <button className="compact" onClick={addTrainingRequirement}><Plus size={14}/> Add custom requirement</button>
      </> : <div className="training-empty"><BookOpenCheck size={22}/><div><strong>Create your first training record</strong><p>AeroSlate will generate a regulatory baseline from the authority, operation and crew position, then you can adapt it to the operator's approved training program.</p></div></div>}
      <p className="currency-disclaimer">AeroSlate generates a regulatory baseline and maintenance record, not an FAA/EASA approval. Operator manuals, approved training programs, OpSpecs/approvals, aircraft differences, checking-month rules and competent-authority interpretations can add or alter requirements. Verify the matrix against the program that actually governs you.</p>
    </div></section>}

    {tab === 'logbook' && <section className="card career-progression-card"><header><div><Calculator size={18}/><h3>Career progression</h3></div><span className="pill blue">CUSTOM · LOGBOOK-LINKED</span></header><div className="card-body">
      <div className="career-builder"><label><span>Progression name</span><input value={careerDraft.name} onChange={e=>setCareerDraft({...careerDraft,name:e.target.value})} placeholder="e.g. Regional FO → Major airline"/></label><label><span>Destination / goal</span><input value={careerDraft.goal} onChange={e=>setCareerDraft({...careerDraft,goal:e.target.value})} placeholder="e.g. Major airline captain"/></label><button className="primary" onClick={createCareerPlan}><Plus size={15}/> Create progression</button></div>
      {careerPlans.length>0&&<div className="career-selector"><label><span>Active progression</span><select value={activeCareer?.id||''} onChange={e=>setActiveCareerId(e.target.value)}>{careerPlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}{plan.goal?` · ${plan.goal}`:''}</option>)}</select></label><button className="danger-button compact" onClick={deleteCareerPlan}><Trash2 size={14}/> Delete</button></div>}
      {activeCareer&&careerStats?<>
        <div className="career-overview"><div><span>Overall</span><strong>{careerStats.percent}%</strong><small>{careerStats.completedReq} / {careerStats.totalReq} gates complete</small></div><div><span>Current stage</span><strong>{careerStats.current?.stage.title||'Build your plan'}</strong><small>{activeCareer.goal||'Custom career path'}</small></div><div><span>Stages</span><strong>{activeCareer.stages.length}</strong><small>{careerStats.stages.filter(row=>row.complete).length} complete</small></div></div>
        <div className="career-plan-title"><label><span>Plan name</span><input value={activeCareer.name} onChange={e=>updateCareerPlan({name:e.target.value})}/></label><label><span>Career goal</span><input value={activeCareer.goal} onChange={e=>updateCareerPlan({goal:e.target.value})} placeholder="Optional destination"/></label></div>
        <div className="career-stage-list">{careerStats.stages.map((stageRow,index)=><div className={`career-stage ${stageRow.complete?'complete':careerStats.currentIndex===index?'active':''}`} key={stageRow.stage.id}>
          <div className="career-stage-head"><div className="career-stage-number">{index+1}</div><div className="career-stage-title"><input value={stageRow.stage.title} onChange={e=>updateCareerStage(stageRow.stage.id,{title:e.target.value})}/><small>{stageRow.complete?'COMPLETE':careerStats.currentIndex===index?'CURRENT STAGE':'UPCOMING'} · {Math.round(stageRow.progress*100)}%</small></div><label><span>Target date</span><input type="date" value={stageRow.stage.targetDate} onChange={e=>updateCareerStage(stageRow.stage.id,{targetDate:e.target.value})}/></label><button className="icon-button danger-button" title="Delete stage" onClick={()=>removeCareerStage(stageRow.stage.id)}><Trash2 size={14}/></button></div>
          <div className="career-progress-track"><span style={{width:`${Math.round(stageRow.progress*100)}%`}}/></div>
          <div className="career-requirements">{stageRow.reqs.map(row=><div className={`career-requirement ${row.complete?'complete':''}`} key={row.item.id}>
            <div className="career-requirement-main"><input value={row.item.label} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{label:e.target.value})}/><select value={row.item.kind} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{kind:e.target.value as 'auto'|'manual'})}><option value="auto">Logbook total</option><option value="manual">Manual gate</option></select></div>
            {row.item.kind==='auto'?<><div className="career-auto-grid"><label><span>Metric</span><select value={row.item.metric} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{metric:e.target.value})}>{CAREER_METRICS.map(metric=><option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><label><span>Target</span><input type="number" min="0" step="0.1" value={row.item.target} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{target:Number(e.target.value)||0})}/></label><label><span>Aircraft contains</span><input value={row.item.aircraftFilter} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{aircraftFilter:e.target.value})} placeholder="Any"/></label><label><span>Operation contains</span><input value={row.item.operationFilter} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{operationFilter:e.target.value})} placeholder="Any"/></label><label><span>Role</span><select value={row.item.roleFilter||'Any'} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{roleFilter:e.target.value})}><option>Any</option><option>PIC</option><option>SIC</option><option>Dual</option><option>Instructor</option></select></label></div><div className="career-gate-result"><strong>{row.value.toFixed(row.item.metric==='flights'||row.item.metric.startsWith('unique')||row.item.metric.includes('Landings')||row.item.metric==='approaches'||row.item.metric==='holds'?0:1)} / {row.target}</strong><span>{row.complete?'MET':'IN PROGRESS'}</span></div></>:<div className="career-manual-row"><label className="check-inline"><input type="checkbox" checked={row.item.completed} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{completed:e.target.checked})}/> Completed</label><input value={row.item.notes} onChange={e=>updateCareerRequirement(stageRow.stage.id,row.item.id,{notes:e.target.value})} placeholder="Certificate, application, interview, type rating, degree, etc."/><span className={`pill ${row.complete?'good':'neutral'}`}>{row.complete?'DONE':'OPEN'}</span></div>}
            <button className="career-remove-gate icon-button" title="Remove gate" onClick={()=>removeCareerRequirement(stageRow.stage.id,row.item.id)}><Trash2 size={13}/></button>
          </div>)}{!stageRow.reqs.length&&<div className="career-empty-stage">No gates yet. Add a logbook total or a manual milestone.</div>}</div>
          <div className="career-stage-actions"><button className="compact" onClick={()=>addCareerRequirement(stageRow.stage.id,'auto')}><Plus size={13}/> Logbook gate</button><button className="compact" onClick={()=>addCareerRequirement(stageRow.stage.id,'manual')}><Plus size={13}/> Manual gate</button><input value={stageRow.stage.notes} onChange={e=>updateCareerStage(stageRow.stage.id,{notes:e.target.value})} placeholder="Stage notes / hiring minimums / personal target"/></div>
        </div>)}</div><button className="compact career-add-stage" onClick={addCareerStage}><Plus size={14}/> Add career stage</button>
        <p className="currency-disclaimer">Career progression is a personal planning tool. Logbook gates calculate automatically from saved flight records; manual gates let you track certificates, training, applications, interviews, education or operator-specific milestones. Hiring and regulatory requirements remain whatever the authority or employer actually requires.</p>
      </>:<div className="training-empty"><Calculator size={22}/><div><strong>Build your career ladder</strong><p>Create any sequence of stages, then add automatic logbook thresholds and manual milestones to each stage.</p></div></div>}
    </div></section>}

    {tab === 'logbook' && <div className="records-layout"><section className="card record-editor"><header><div><BookOpenCheck size={18} /><h3>Flight log entry</h3></div><button onClick={() => exportRecords('logbook')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Flight identity and authoritative times</legend><div className="form-grid four">{synced(log.date, 'Date')}{synced(log.flightNumber, 'Flight')}{synced(log.departure, 'Departure')}{synced(log.arrival, 'Arrival')}{synced(log.aircraftType, 'Aircraft')}{synced(log.registration, 'Registration')}{synced(log.scheduledOut, 'STD')}{synced(log.scheduledIn, 'STA')}{synced(log.out, 'OUT', 'OOOI')}{synced(log.off, 'OFF', 'OOOI')}{synced(log.on, 'ON', 'OOOI')}{synced(log.in, 'IN', 'OOOI')}{synced(log.totalTime, 'Block', 'OUT–IN')}{synced(log.flightTime, 'Airborne', 'OFF–ON')}</div></fieldset>
      <fieldset><legend>Creditable time</legend><div className="form-grid four">{textInput(log, setLog, 'pic', 'PIC', 'number', '0.1')}{textInput(log, setLog, 'sic', 'SIC / co-pilot', 'number', '0.1')}{textInput(log, setLog, 'dual', 'Dual received', 'number', '0.1')}{textInput(log, setLog, 'instructor', 'Instructor', 'number', '0.1')}{textInput(log, setLog, 'night', 'Night', 'number', '0.1')}{textInput(log, setLog, 'instrument', 'Actual instrument', 'number', '0.1')}{textInput(log, setLog, 'simulatedInstrument', 'Simulated instrument', 'number', '0.1')}{textInput(log, setLog, 'crossCountry', 'Cross-country', 'number', '0.1')}{textInput(log, setLog, 'dayLandings', 'Day landings', 'number')}{textInput(log, setLog, 'nightLandings', 'Night landings', 'number')}{textInput(log, setLog, 'approaches', 'Approaches')}{textInput(log, setLog, 'holds', 'Holding events', 'number')}<label><span>Intercept / track</span><select value={Boolean(log.tracking)?'Yes':'No'} onChange={event=>update(setLog,'tracking',event.target.value==='Yes')}><option>No</option><option>Yes</option></select></label></div></fieldset>
      <fieldset><legend>Operation</legend><div className="form-grid three">{selectInput(log, setLog, 'role', 'Crew role', ['PIC', 'SIC', 'Dual', 'Instructor'])}{selectInput(log, setLog, 'operation', 'Operation', OPERATIONS)}{selectInput(log, setLog, 'rules', 'Flight rules', ['IFR', 'VFR'])}</div><label className="stacked-input"><span>Remarks / endorsements reference</span><textarea value={String(log.remarks)} onChange={event => update(setLog, 'remarks', event.target.value)} /></label></fieldset>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(log.attested)} onChange={event => update(setLog, 'attested', event.target.checked)} /> I attest this entry is complete and accurate.</label>{textInput(log, setLog, 'signerName', 'Typed signature / name')}<button className="primary" disabled={busy} onClick={() => void saveRecord('logbook', log)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history records-browser"><header><div><BookOpenCheck size={18} /><h3>Flight logs</h3></div><span className="pill blue">{filteredRecords.length} shown</span></header><div className="card-body">{analyticsToolbar}<div className="records-total-grid"><div><span>Flights</span><strong>{flightTotals.flights}</strong></div><div><span>Block</span><strong>{flightTotals.block.toFixed(1)}</strong></div><div><span>Airborne</span><strong>{flightTotals.airborne.toFixed(1)}</strong></div><div><span>PIC</span><strong>{flightTotals.pic.toFixed(1)}</strong></div><div><span>SIC</span><strong>{flightTotals.sic.toFixed(1)}</strong></div><div><span>Night</span><strong>{flightTotals.night.toFixed(1)}</strong></div><div><span>Instrument</span><strong>{flightTotals.instrument.toFixed(1)}</strong></div><div><span>XC</span><strong>{flightTotals.xc.toFixed(1)}</strong></div><div><span>Landings</span><strong>{flightTotals.landings}</strong></div></div>{reportBuilder}<div className="record-list rich-record-list">{groupedRecords.map(group=><div className="record-group" key={group.label||'all'}>{group.label&&<div className="record-group-title"><strong>{group.label}</strong><span>{group.records.length} flights</span></div>}{group.records.slice().reverse().map(entry => <button className="record-row" key={entry.id} onClick={()=>setSelectedRecord(entry)}><div><strong>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)}</strong><span>{String(entry.data.flightNumber||'')} · {String(entry.data.aircraftType)} {String(entry.data.registration)} · {Number(entry.data.totalTime||0).toFixed(1)} hr</span></div><div className="record-row-metrics"><span>PIC {Number(entry.data.pic||0).toFixed(1)}</span><span>SIC {Number(entry.data.sic||0).toFixed(1)}</span><span>Night {Number(entry.data.night||0).toFixed(1)}</span></div></button>)}</div>)}{!filteredRecords.length && <p className="muted">No flight records match these filters.</p>}</div>{recordDetail}</div></section></div>}

    {tab === 'duty' && <section className="card duty-status-card"><header><div><Timer size={18}/><h3>Duty status</h3></div><span className={`pill ${dutyStatus.activeDuty?'warn':'neutral'}`}>{dutyStatus.activeDuty?'ON DUTY':duty.dutyEnd?'COMPLETE':dutyStatus.dutyHasStarted?'OPEN':'NOT STARTED'}</span></header><div className="card-body">
      <div className="duty-status-grid">
        <div><span>Duty elapsed</span><strong>{duty.dutyStart?formatMinutes(dutyStatus.elapsedDuty):'--:--'}</strong><small>{dutyStatus.activeDuty?'running now':duty.dutyEnd?'completed':'enter duty on'}</small></div>
        <div className={dutyStatus.remainingDuty!==null&&dutyStatus.remainingDuty<=60?'attention':''}><span>Duty remaining</span><strong>{dutyStatus.remainingDuty===null?'—':formatMinutes(dutyStatus.remainingDuty)}</strong><small>{dutyStatus.dutyLimit?`entered limit ${dutyStatus.dutyLimit}`:'set scheme max duty'}</small></div>
        <div><span>FDP elapsed</span><strong>{duty.flightDutyStart?formatMinutes(dutyStatus.elapsedFdp):'--:--'}</strong><small>{dutyStatus.activeFdp?'running now':duty.flightDutyEnd?'completed':'awaiting FDP start'}</small></div>
        <div className={dutyStatus.remainingFdp!==null&&dutyStatus.remainingFdp<=60?'attention':''}><span>FDP remaining</span><strong>{dutyStatus.remainingFdp===null?'—':formatMinutes(dutyStatus.remainingFdp)}</strong><small>{dutyStatus.fdpLimit?`entered limit ${dutyStatus.fdpLimit}`:'set scheme max FDP'}</small></div>
        <div className={dutyStatus.priorRestOk?'good':'attention'}><span>Rest before</span><strong>{Number(duty.restBefore||0).toFixed(1)} hr</strong><small>{dutyStatus.minRest?`${dutyStatus.priorRestOk?'meets':'below'} entered ${dutyStatus.minRest.toFixed(1)} hr minimum`:'no minimum entered'}</small></div>
        <div><span>Required rest after</span><strong>{dutyStatus.minRest?`${dutyStatus.minRest.toFixed(1)} hr`:'—'}</strong><small>{dutyStatus.restComplete?`complete at ${dutyStatus.restComplete}`:dutyStatus.activeDuty?'starts at duty off':'enter duty off to calculate'}</small></div>
      </div>
      <div className="duty-status-strip"><span>Current Z {dutyStatus.now}</span><span>Scheme {String(duty.regulation||'Not set')}</span><span>{String(duty.sectors||0)} sector{Number(duty.sectors||0)===1?'':'s'}</span>{Boolean(duty.augmented)&&<span>Augmented</span>}</div>
      <p className="currency-disclaimer">Remaining duty/FDP and rest are calculated from the limits entered in this duty record; AeroSlate does not infer operator-specific legality or extensions automatically.</p>
    </div></section>}

    {tab === 'duty' && <div className="records-layout"><section className="card record-editor"><header><div><Timer size={18} /><h3>Duty log entry</h3></div><button onClick={() => exportRecords('duty')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Attached flight and scheme</legend><div className="form-grid four">{synced(duty.date, 'Date')}<label><span>Attached flight log</span><select value={String(duty.flightRecordId || '')} onChange={event => update(setDuty, 'flightRecordId', event.target.value)}><option value="">Current flight · attach on save</option>{entries.slice().reverse().map(entry => <option key={entry.id} value={entry.id}>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)} · {String(entry.data.registration)}</option>)}</select></label>{selectInput(duty, setDuty, 'regulation', 'Regulation / scheme', DUTY_SCHEMES)}{selectInput(duty, setDuty, 'role', 'Role', ['Flightcrew', 'PIC', 'SIC', 'Cabin crew', 'Other'])}{synced(duty.scheduledOut, 'STD')}{synced(duty.scheduledIn, 'STA')}</div></fieldset>
      <fieldset><legend>Duty times</legend><div className="form-grid four">{dutyZulu('dutyStart', 'Duty on', presets.autoDutyTimes)}{dutyZulu('reportTime', 'Report', presets.autoDutyTimes)}{dutyZulu('flightDutyStart', 'FDP start', presets.autoDutyTimes)}{synced(duty.flightDutyEnd, 'FDP end / IN', 'OOOI')}{dutyZulu('dutyEnd', 'Duty off', presets.autoDutyTimes)}{textInput(duty, setDuty, 'sectors', 'Sectors', 'number')}{textInput(duty, setDuty, 'standby', 'Standby hours', 'number', '0.1')}{textInput(duty, setDuty, 'restBefore', 'Rest before', 'number', '0.1')}{textInput(duty, setDuty, 'maxDuty', 'Scheme max duty', 'number', '0.1')}{textInput(duty, setDuty, 'maxFdp', 'Scheme max FDP', 'number', '0.1')}{textInput(duty, setDuty, 'minRest', 'Scheme min rest', 'number', '0.1')}</div><label className="check-inline"><input type="checkbox" checked={Boolean(duty.augmented)} onChange={event => update(setDuty, 'augmented', event.target.checked)} /> Augmented crew / relief available</label></fieldset>
      <div className="duty-summary"><div><span>Duty</span><strong>{dutyMinutes ? formatMinutes(dutyMinutes) : '--:--'}</strong></div><div><span>FDP</span><strong>{fdpMinutes ? formatMinutes(fdpMinutes) : '--:--'}</strong></div><div><span>Rest</span><strong>{String(duty.restBefore)} hr</strong></div><div><span>Sectors</span><strong>{String(duty.sectors)}</strong></div></div>
      <label className="stacked-input"><span>Notes / extensions / discretion / acclimatization</span><textarea value={String(duty.notes)} onChange={event => update(setDuty, 'notes', event.target.value)} /></label>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(duty.attested)} onChange={event => update(setDuty, 'attested', event.target.checked)} /> I attest this duty record is complete and accurate.</label>{textInput(duty, setDuty, 'signerName', 'Typed signature / name')}<button className="primary" disabled={busy} onClick={() => void saveRecord('duty', duty)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history records-browser"><header><div><Timer size={18} /><h3>Duty logs</h3></div><span className="pill blue">{filteredRecords.length} shown</span></header><div className="card-body">{analyticsToolbar}<div className="records-total-grid duty-totals"><div><span>Duties</span><strong>{dutyTotals.duties}</strong></div><div><span>Duty</span><strong>{formatMinutes(dutyTotals.dutyMin)}</strong></div><div><span>FDP</span><strong>{formatMinutes(dutyTotals.fdpMin)}</strong></div><div><span>Sectors</span><strong>{dutyTotals.sectors}</strong></div><div><span>Standby</span><strong>{dutyTotals.standby.toFixed(1)}</strong></div></div>{reportBuilder}<div className="record-list rich-record-list">{groupedRecords.map(group=><div className="record-group" key={group.label||'all'}>{group.label&&<div className="record-group-title"><strong>{group.label}</strong><span>{group.records.length} duties</span></div>}{group.records.slice().reverse().map(entry => <button className="record-row" key={entry.id} onClick={()=>setSelectedRecord(entry)}><div><strong>{String(entry.data.date)} · {String(entry.data.regulation)}</strong><span>{String(entry.data.dutyStart)}–{String(entry.data.dutyEnd)} · {String(entry.data.flightNumber||'No flight')} · {String(entry.data.sectors||0)} sectors</span></div><div className="record-row-metrics"><span>Rest {String(entry.data.restBefore||0)}h</span><span>{entry.data.augmented?'Augmented':'Standard'}</span></div></button>)}</div>)}{!filteredRecords.length && <p className="muted">No duty records match these filters.</p>}</div>{recordDetail}</div></section></div>}
    <div className="notice warn compliance-note"><strong>Recordkeeping aid</strong><p>AeroSlate preserves entered data, attestations, exports and per-device audit chains. It does not determine whether time is legally loggable or certify compliance with an operator-specific FAA/EASA scheme.</p></div>
  </div>;
}
