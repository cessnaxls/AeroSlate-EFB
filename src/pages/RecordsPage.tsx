import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Download, RefreshCw, Save, ShieldCheck, Timer } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { addMinutesZulu, decimalHours, formatMinutes, minutesBetweenZulu, normalizeZulu, oooiStorageKey, useOOOITimes } from '../lib/flightTimes';
import { ZuluTimeInput } from '../components/ZuluTimeInput';
import type { FlightSummary } from '../lib/ofp';

interface LedgerEntry { id: string; createdAt: string; data: RecordData; auditHash: string; }
type RecordData = Record<string, string | number | boolean>;
interface RecordPresets { role: 'PIC' | 'SIC' | 'Dual' | 'Instructor'; operation: string; rules: 'IFR' | 'VFR'; crossCountry: boolean; autoDutyTimes: boolean; reportLeadMinutes: number; postFlightMinutes: number; }

const OPERATIONS = ['Part 91', 'Part 121', 'Part 135', 'EASA CAT', 'EASA NCC', 'EASA NCO', 'Training', 'Other'];
const DUTY_SCHEMES = ['FAA Part 117', 'FAA Part 135', 'FAA Part 91 / company', 'EASA ORO.FTL.205', 'Company scheme', 'Other'];
const DEFAULT_PRESETS: RecordPresets = { role: 'SIC', operation: 'Part 91', rules: 'IFR', crossCountry: true, autoDutyTimes: true, reportLeadMinutes: 60, postFlightMinutes: 15 };
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
    instructor: presets.role === 'Instructor' ? block : 0, night: 0, instrument: 0, simulatedInstrument: 0,
    crossCountry: presets.crossCountry ? block : 0, dayLandings: 0, nightLandings: 0, approaches: '', operation: presets.operation,
    role: presets.role, rules: presets.rules, remarks: '', attested: false, signerName: ''
  };
}
function baseDuty(flight: FlightSummary, times: { in: string }, presets: RecordPresets): RecordData {
  const report = presets.autoDutyTimes ? addMinutesZulu(flight.schedOut, -presets.reportLeadMinutes) : '';
  return { date: recordDate(flight), regulation: 'FAA Part 117', role: 'Flightcrew', scheduledOut: flight.schedOut, scheduledIn: flight.schedIn,
    dutyStart: report, reportTime: report, flightDutyStart: report, flightDutyEnd: times.in,
    dutyEnd: presets.autoDutyTimes && times.in ? addMinutesZulu(times.in, presets.postFlightMinutes) : '',
    sectors: flight.origin !== '----' && flight.destination !== '----' ? 1 : 0, standby: 0, restBefore: 10, maxDuty: 13, minRest: 10,
    augmented: false, notes: '', attested: false, signerName: '' };
}

export function RecordsPage({ flight }: { flight: FlightSummary }) {
  const [tab, setTab] = useState<'logbook' | 'duty'>('logbook');
  const [workspaceKey, setWorkspaceKey] = useState(() => loadLocal('aeroslate.records.key', ''));
  const [entries, setEntries] = useState<LedgerEntry[]>([]); const [duties, setDuties] = useState<LedgerEntry[]>([]); const [status, setStatus] = useState('');
  const [presets, setPresets] = useState<RecordPresets>(() => ({ ...DEFAULT_PRESETS, ...loadLocal<Partial<RecordPresets>>('aeroslate.records.presets', {}) }));
  const { times, blockMinutes, flightMinutes } = useOOOITimes(oooiStorageKey(flight.release, flight.origin, flight.destination));
  const blockHours = decimalHours(blockMinutes); const airborneHours = decimalHours(flightMinutes);
  const logKey = `aeroslate.records.draft.${flightKey(flight)}`; const dutyKey = `aeroslate.duty.draft.${flightKey(flight)}`;
  const [log, setLog] = useState<RecordData>(() => loadLocal(logKey, baseLog(flight, blockHours, airborneHours, presets, times)));
  const [duty, setDuty] = useState<RecordData>(() => loadLocal(dutyKey, baseDuty(flight, times, presets)));

  useEffect(() => saveLocal('aeroslate.records.key', workspaceKey), [workspaceKey]);
  useEffect(() => saveLocal('aeroslate.records.presets', presets), [presets]);
  useEffect(() => saveLocal(logKey, log), [logKey, log]); useEffect(() => saveLocal(dutyKey, duty), [dutyKey, duty]);
  useEffect(() => {
    const generated = baseLog(flight, blockHours, airborneHours, presets, times);
    setLog(current => ({ ...current, ...generated, remarks: current.remarks || '', approaches: current.approaches || '', signerName: current.signerName || '', attested: current.attested || false }));
    const dutyBase = baseDuty(flight, times, presets);
    setDuty(current => ({ ...current, ...dutyBase, regulation: current.regulation || dutyBase.regulation, role: current.role || dutyBase.role, notes: current.notes || '', signerName: current.signerName || '', attested: current.attested || false }));
  }, [flight.release, flight.origin, flight.destination, flight.aircraft, flight.registration, flight.flightNumber, flight.airline, flight.schedOut, flight.schedIn, flight.flightDate, times.out, times.off, times.on, times.in, blockHours, airborneHours, presets.role, presets.operation, presets.rules, presets.crossCountry, presets.autoDutyTimes, presets.reportLeadMinutes, presets.postFlightMinutes]);

  const request = async (path: string, options: RequestInit = {}) => {
    if (!workspaceKey.trim()) throw new Error('Enter a private cloud workspace key.');
    const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', 'x-workspace-key': workspaceKey.trim(), ...(options.headers || {}) } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Cloud record request failed.'); return data;
  };
  const refresh = async () => { try { const data = await request('/api/records'); setEntries(data.logbook || []); setDuties(data.duty || []); setStatus('Cloud records synchronized.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Sync failed.'); } };
  const saveRecord = async (kind: 'logbook' | 'duty', data: RecordData) => {
    if (!data.attested || !String(data.signerName || '').trim()) { setStatus('Attest the record and enter the signer name before saving.'); return; }
    try { await request(`/api/records/${kind}`, { method: 'POST', body: JSON.stringify({ data }) }); setStatus(`${kind === 'logbook' ? 'Flight' : 'Duty'} record saved with an audit hash.`); await refresh(); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
  };
  const exportRecords = async (kind: 'logbook' | 'duty') => {
    try { const response = await fetch(`/api/records/export?type=${kind}&format=csv`, { headers: { 'x-workspace-key': workspaceKey.trim() } }); if (!response.ok) throw new Error('Export failed.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `aeroslate-${kind}-${today()}.csv`; anchor.click(); URL.revokeObjectURL(url); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Export failed.'); }
  };
  const update = (setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, value: string | number | boolean) => setter(current => ({ ...current, [key]: value }));
  const textInput = (data: RecordData, setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, label: string, type = 'text', step?: string) => <label><span>{label}</span><input type={type} step={step} value={String(data[key] ?? '')} onChange={event => update(setter, key, type === 'number' ? Number(event.target.value) : event.target.value)} /></label>;
  const selectInput = (data: RecordData, setter: React.Dispatch<React.SetStateAction<RecordData>>, key: string, label: string, options: string[]) => <label><span>{label}</span><select value={String(data[key] ?? '')} onChange={event => update(setter, key, event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  const synced = (value: unknown, label: string, note = 'Synced from active flight') => <label className="synced-field"><span>{label}<small>{note}</small></span><input readOnly value={String(value ?? '')} /></label>;
  const dutyZulu = (key: string, label: string, locked = false) => <label className={locked ? 'synced-field' : ''}><span>{label}{locked && <small>Auto-derived</small>}</span><ZuluTimeInput value={String(duty[key] || '')} readOnly={locked} onChange={value => update(setDuty, key, normalizeZulu(value))} /></label>;
  const dutyMinutes = useMemo(() => { const value = minutesBetweenZulu(String(duty.dutyStart || ''), String(duty.dutyEnd || '')); return value === null ? 0 : value; }, [duty.dutyStart, duty.dutyEnd]);
  const fdpMinutes = useMemo(() => { const value = minutesBetweenZulu(String(duty.flightDutyStart || ''), String(duty.flightDutyEnd || '')); return value === null ? 0 : value; }, [duty.flightDutyStart, duty.flightDutyEnd]);

  return <div className="records-page">
    <section className="card records-connect"><header><div><ShieldCheck size={18} /><h3>Cloud records</h3></div><button onClick={() => void refresh()}><RefreshCw size={15} /> Sync</button></header><div className="card-body records-connect-grid"><label><span>Private workspace key</span><input type="password" value={workspaceKey} onChange={event => setWorkspaceKey(event.target.value)} placeholder="Long private passphrase" /></label><div><strong>{entries.length}</strong><span>Flights</span></div><div><strong>{duties.length}</strong><span>Duty records</span></div>{status && <div className="notice records-status">{status}</div>}</div></section>

    <section className="card record-defaults"><header><div><BookOpenCheck size={18} /><h3>Entry defaults</h3></div><span className="pill blue">DEVICE</span></header><div className="card-body form-grid six"><label><span>Crew role</span><select value={presets.role} onChange={event => setPresets({ ...presets, role: event.target.value as RecordPresets['role'] })}>{['PIC', 'SIC', 'Dual', 'Instructor'].map(value => <option key={value}>{value}</option>)}</select></label><label><span>Operation</span><select value={presets.operation} onChange={event => setPresets({ ...presets, operation: event.target.value })}>{OPERATIONS.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Rules</span><select value={presets.rules} onChange={event => setPresets({ ...presets, rules: event.target.value as 'IFR' | 'VFR' })}><option>IFR</option><option>VFR</option></select></label><label className="check-inline"><input type="checkbox" checked={presets.crossCountry} onChange={event => setPresets({ ...presets, crossCountry: event.target.checked })} /> Block → XC</label><label><span>Report lead (min)</span><input type="number" min="0" value={presets.reportLeadMinutes} onChange={event => setPresets({ ...presets, reportLeadMinutes: Number(event.target.value) })} /></label><label><span>Postflight (min)</span><input type="number" min="0" value={presets.postFlightMinutes} onChange={event => setPresets({ ...presets, postFlightMinutes: Number(event.target.value) })} /></label></div></section>

    <div className="record-tabs"><button className={tab === 'logbook' ? 'active' : ''} onClick={() => setTab('logbook')}><BookOpenCheck size={17} /> Logbook</button><button className={tab === 'duty' ? 'active' : ''} onClick={() => setTab('duty')}><Timer size={17} /> Duty / FTL</button></div>

    {tab === 'logbook' && <div className="records-layout"><section className="card record-editor"><header><div><BookOpenCheck size={18} /><h3>Flight entry</h3></div><button onClick={() => void exportRecords('logbook')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Flight identity and authoritative times</legend><div className="form-grid four">{synced(log.date, 'Date')}{synced(log.flightNumber, 'Flight')}{synced(log.departure, 'Departure')}{synced(log.arrival, 'Arrival')}{synced(log.aircraftType, 'Aircraft')}{synced(log.registration, 'Registration')}{synced(log.scheduledOut, 'STD')}{synced(log.scheduledIn, 'STA')}{synced(log.out, 'OUT', 'OOOI')}{synced(log.off, 'OFF', 'OOOI')}{synced(log.on, 'ON', 'OOOI')}{synced(log.in, 'IN', 'OOOI')}{synced(log.totalTime, 'Block', 'OUT–IN')}{synced(log.flightTime, 'Airborne', 'OFF–ON')}</div></fieldset>
      <fieldset><legend>Creditable time</legend><div className="form-grid four">{textInput(log, setLog, 'pic', 'PIC', 'number', '0.1')}{textInput(log, setLog, 'sic', 'SIC / co-pilot', 'number', '0.1')}{textInput(log, setLog, 'dual', 'Dual received', 'number', '0.1')}{textInput(log, setLog, 'instructor', 'Instructor', 'number', '0.1')}{textInput(log, setLog, 'night', 'Night', 'number', '0.1')}{textInput(log, setLog, 'instrument', 'Actual instrument', 'number', '0.1')}{textInput(log, setLog, 'simulatedInstrument', 'Simulated instrument', 'number', '0.1')}{textInput(log, setLog, 'crossCountry', 'Cross-country', 'number', '0.1')}{textInput(log, setLog, 'dayLandings', 'Day landings', 'number')}{textInput(log, setLog, 'nightLandings', 'Night landings', 'number')}{textInput(log, setLog, 'approaches', 'Approaches')}</div></fieldset>
      <fieldset><legend>Operation</legend><div className="form-grid three">{selectInput(log, setLog, 'role', 'Crew role', ['PIC', 'SIC', 'Dual', 'Instructor'])}{selectInput(log, setLog, 'operation', 'Operation', OPERATIONS)}{selectInput(log, setLog, 'rules', 'Flight rules', ['IFR', 'VFR'])}</div><label className="stacked-input"><span>Remarks / endorsements reference</span><textarea value={String(log.remarks)} onChange={event => update(setLog, 'remarks', event.target.value)} /></label></fieldset>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(log.attested)} onChange={event => update(setLog, 'attested', event.target.checked)} /> I attest this entry is complete and accurate.</label>{textInput(log, setLog, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('logbook', log)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history"><header><div><BookOpenCheck size={18} /><h3>Recent flights</h3></div></header><div className="card-body record-list">{entries.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)}</strong><span>{String(entry.data.aircraftType)} {String(entry.data.registration)} · {String(entry.data.totalTime)} hr</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!entries.length && <p className="muted">No cloud records loaded.</p>}</div></section></div>}

    {tab === 'duty' && <div className="records-layout"><section className="card record-editor"><header><div><Timer size={18} /><h3>Duty entry</h3></div><button onClick={() => void exportRecords('duty')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Scheme and schedule</legend><div className="form-grid four">{synced(duty.date, 'Date')}{selectInput(duty, setDuty, 'regulation', 'Regulation / scheme', DUTY_SCHEMES)}{selectInput(duty, setDuty, 'role', 'Role', ['Flightcrew', 'PIC', 'SIC', 'Cabin crew', 'Other'])}{synced(duty.scheduledOut, 'STD')}{synced(duty.scheduledIn, 'STA')}</div></fieldset>
      <fieldset><legend>Duty times</legend><div className="form-grid four">{dutyZulu('dutyStart', 'Duty on', presets.autoDutyTimes)}{dutyZulu('reportTime', 'Report', presets.autoDutyTimes)}{dutyZulu('flightDutyStart', 'FDP start', presets.autoDutyTimes)}{synced(duty.flightDutyEnd, 'FDP end / IN', 'OOOI')}{dutyZulu('dutyEnd', 'Duty off', presets.autoDutyTimes)}{textInput(duty, setDuty, 'sectors', 'Sectors', 'number')}{textInput(duty, setDuty, 'standby', 'Standby hours', 'number', '0.1')}{textInput(duty, setDuty, 'restBefore', 'Rest before', 'number', '0.1')}{textInput(duty, setDuty, 'maxDuty', 'Scheme max duty', 'number', '0.1')}{textInput(duty, setDuty, 'minRest', 'Scheme min rest', 'number', '0.1')}</div><label className="check-inline"><input type="checkbox" checked={Boolean(duty.augmented)} onChange={event => update(setDuty, 'augmented', event.target.checked)} /> Augmented crew / relief available</label></fieldset>
      <div className="duty-summary"><div><span>Duty</span><strong>{dutyMinutes ? formatMinutes(dutyMinutes) : '--:--'}</strong></div><div><span>FDP</span><strong>{fdpMinutes ? formatMinutes(fdpMinutes) : '--:--'}</strong></div><div><span>Rest</span><strong>{String(duty.restBefore)} hr</strong></div><div><span>Sectors</span><strong>{String(duty.sectors)}</strong></div></div>
      <label className="stacked-input"><span>Notes / extensions / discretion / acclimatization</span><textarea value={String(duty.notes)} onChange={event => update(setDuty, 'notes', event.target.value)} /></label>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(duty.attested)} onChange={event => update(setDuty, 'attested', event.target.checked)} /> I attest this duty record is complete and accurate.</label>{textInput(duty, setDuty, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('duty', duty)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history"><header><div><Timer size={18} /><h3>Recent duty</h3></div></header><div className="card-body record-list">{duties.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.regulation)}</strong><span>{String(entry.data.dutyStart)}–{String(entry.data.dutyEnd)} · {String(entry.data.sectors)} sectors</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!duties.length && <p className="muted">No cloud duty records loaded.</p>}</div></section></div>}
    <div className="notice warn compliance-note"><strong>Recordkeeping aid</strong><p>AeroSlate preserves entered data, attestations, exports and audit hashes. It does not determine whether time is legally loggable or certify compliance with an operator-specific FAA/EASA scheme.</p></div>
  </div>;
}
