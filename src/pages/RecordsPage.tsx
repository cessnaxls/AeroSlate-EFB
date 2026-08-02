import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Download, FileCheck2, RefreshCw, Save, ShieldCheck, Timer } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { addMinutesZulu, decimalHours, formatMinutes, normalizeZulu, oooiStorageKey, useOOOITimes } from '../lib/flightTimes';
import { ZuluTimeInput } from '../components/ZuluTimeInput';
import type { FlightSummary } from '../lib/ofp';

interface LogEntry { id: string; createdAt: string; data: RecordData; auditHash: string; }
interface DutyEntry { id: string; createdAt: string; data: RecordData; auditHash: string; }
type RecordData = Record<string, string | number | boolean>;
interface RecordPresets { role: 'PIC' | 'SIC' | 'Dual' | 'Instructor'; operation: string; crossCountry: boolean; autoDutyTimes: boolean; reportLeadMinutes: number; postFlightMinutes: number; }

const DEFAULT_PRESETS: RecordPresets = { role: 'SIC', operation: 'Part 91 / NCO', crossCountry: true, autoDutyTimes: true, reportLeadMinutes: 60, postFlightMinutes: 15 };
function today() { return new Date().toISOString().slice(0, 10); }
function recordDate(flight: FlightSummary) {
  const value = String(flight.flightDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const compact = value.match(/^(\d{2})([A-Z]{3})(\d{2,4})$/i);
  const textual = value.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i);
  const match = compact || textual;
  if (match) {
    const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${months[match[2].toUpperCase()] || '01'}-${match[1].padStart(2, '0')}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10);
}

function baseLog(flight: FlightSummary, blockHours: number, flightHours: number, presets: RecordPresets, times: { out: string; off: string; on: string; in: string }): RecordData {
  const roleValues = { pic: 0, sic: 0, dual: 0, instructor: 0 };
  if (presets.role === 'PIC') roleValues.pic = blockHours;
  if (presets.role === 'SIC') roleValues.sic = blockHours;
  if (presets.role === 'Dual') roleValues.dual = blockHours;
  if (presets.role === 'Instructor') roleValues.instructor = blockHours;
  return {
    date: recordDate(flight), scheduledOut: flight.schedOut, scheduledIn: flight.schedIn,
    departure: flight.origin, arrival: flight.destination, aircraftType: flight.aircraft, registration: flight.registration,
    flightNumber: `${flight.airline}${flight.flightNumber}`, out: times.out, off: times.off, on: times.on, in: times.in,
    totalTime: blockHours, flightTime: flightHours, ...roleValues,
    night: 0, instrument: 0, simulatedInstrument: 0, crossCountry: presets.crossCountry ? blockHours : 0,
    dayLandings: 0, nightLandings: 0, approaches: '', operation: presets.operation, role: presets.role, remarks: '', attested: false, signerName: ''
  };
}

function baseDuty(flight: FlightSummary, times: { out: string; in: string }, presets: RecordPresets): RecordData {
  const report = presets.autoDutyTimes ? addMinutesZulu(flight.schedOut, -presets.reportLeadMinutes) : '';
  const dutyEnd = presets.autoDutyTimes && times.in ? addMinutesZulu(times.in, presets.postFlightMinutes) : '';
  return {
    date: recordDate(flight), regulation: 'FAA / EASA / company scheme — select applicable rule set', role: 'Flightcrew',
    scheduledOut: flight.schedOut, scheduledIn: flight.schedIn, dutyStart: report, reportTime: report,
    flightDutyStart: report, flightDutyEnd: times.in, dutyEnd, sectors: flight.origin !== '----' && flight.destination !== '----' ? 1 : 0,
    standby: 0, restBefore: 10, maxDuty: 13, minRest: 10, augmented: false, notes: '', attested: false, signerName: ''
  };
}

export function RecordsPage({ flight }: { flight: FlightSummary }) {
  const [tab, setTab] = useState<'logbook' | 'duty'>('logbook');
  const [workspaceKey, setWorkspaceKey] = useState(() => loadLocal('dispatchlink.records.key', ''));
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [status, setStatus] = useState('');
  const [presets, setPresets] = useState<RecordPresets>(() => ({ ...DEFAULT_PRESETS, ...loadLocal<Partial<RecordPresets>>('dispatchlink.records.presets', {}) }));
  const timeKey = oooiStorageKey(flight.release, flight.origin, flight.destination);
  const { times, blockMinutes, flightMinutes } = useOOOITimes(timeKey);
  const blockHours = decimalHours(blockMinutes);
  const airborneHours = decimalHours(flightMinutes);
  const draftKey = `dispatchlink.records.draft.${flight.release}.${flight.origin}${flight.destination}`;
  const dutyDraftKey = `dispatchlink.duty.draft.${flight.release}.${flight.origin}${flight.destination}`;
  const [log, setLog] = useState<RecordData>(() => loadLocal(draftKey, baseLog(flight, blockHours, airborneHours, presets, times)));
  const [duty, setDuty] = useState<RecordData>(() => loadLocal(dutyDraftKey, baseDuty(flight, times, presets)));

  useEffect(() => saveLocal('dispatchlink.records.key', workspaceKey), [workspaceKey]);
  useEffect(() => saveLocal('dispatchlink.records.presets', presets), [presets]);
  useEffect(() => saveLocal(draftKey, log), [draftKey, log]);
  useEffect(() => saveLocal(dutyDraftKey, duty), [dutyDraftKey, duty]);

  const applyFlightData = () => {
    setLog(current => ({ ...current, ...baseLog(flight, blockHours, airborneHours, presets, times), remarks: current.remarks || '', signerName: current.signerName || '', attested: current.attested || false }));
    setDuty(current => ({ ...current, ...baseDuty(flight, times, presets), dutyStart: presets.autoDutyTimes ? baseDuty(flight, times, presets).dutyStart : current.dutyStart || '', reportTime: presets.autoDutyTimes ? baseDuty(flight, times, presets).reportTime : current.reportTime || '', dutyEnd: presets.autoDutyTimes ? baseDuty(flight, times, presets).dutyEnd : current.dutyEnd || '', notes: current.notes || '', signerName: current.signerName || '', attested: current.attested || false }));
    setStatus('Flight identity, schedule and OOOI times copied into both record drafts.');
  };

  useEffect(() => {
    setLog(current => ({ ...current,
      date: recordDate(flight), scheduledOut: flight.schedOut, scheduledIn: flight.schedIn,
      departure: flight.origin, arrival: flight.destination, aircraftType: flight.aircraft, registration: flight.registration,
      flightNumber: `${flight.airline}${flight.flightNumber}`, out: times.out, off: times.off, on: times.on, in: times.in,
      totalTime: blockHours, flightTime: airborneHours,
      pic: presets.role === 'PIC' ? blockHours : 0,
      sic: presets.role === 'SIC' ? blockHours : 0,
      dual: presets.role === 'Dual' ? blockHours : 0,
      instructor: presets.role === 'Instructor' ? blockHours : 0,
      crossCountry: presets.crossCountry ? blockHours : Number(current.crossCountry || 0),
      operation: presets.operation,
      role: presets.role
    }));
    const automaticDuty = baseDuty(flight, times, presets);
    setDuty(current => ({ ...current,
      date: recordDate(flight), scheduledOut: flight.schedOut, scheduledIn: flight.schedIn,
      flightDutyStart: presets.autoDutyTimes ? automaticDuty.flightDutyStart : current.flightDutyStart, flightDutyEnd: times.in,
      dutyStart: presets.autoDutyTimes ? automaticDuty.dutyStart : current.dutyStart,
      reportTime: presets.autoDutyTimes ? automaticDuty.reportTime : current.reportTime,
      dutyEnd: presets.autoDutyTimes ? automaticDuty.dutyEnd : current.dutyEnd,
      sectors: flight.origin !== '----' && flight.destination !== '----' ? 1 : 0
    }));
  }, [flight.release, flight.origin, flight.destination, flight.aircraft, flight.registration, flight.flightNumber, flight.airline, flight.schedOut, flight.schedIn, flight.flightDate, times.out, times.off, times.on, times.in, blockHours, airborneHours, presets.role, presets.operation, presets.crossCountry, presets.autoDutyTimes, presets.reportLeadMinutes, presets.postFlightMinutes]);

  const api = async (path: string, options: RequestInit = {}) => {
    if (!workspaceKey.trim()) throw new Error('Enter a private cloud workspace key.');
    const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', 'x-workspace-key': workspaceKey.trim(), ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Cloud record request failed.');
    return data;
  };
  const refresh = async () => { try { const data = await api('/api/records'); setEntries(data.logbook || []); setDuties(data.duty || []); setStatus('Cloud records synchronized.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Sync failed.'); } };
  const saveRecord = async (kind: 'logbook' | 'duty', data: RecordData) => {
    if (!data.attested || !String(data.signerName || '').trim()) { setStatus('Attest the record and enter the signer name before saving.'); return; }
    try { await api(`/api/records/${kind}`, { method: 'POST', body: JSON.stringify({ data }) }); setStatus(`${kind === 'logbook' ? 'Logbook' : 'Duty'} record saved with an append-only audit hash.`); await refresh(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Save failed.'); }
  };
  const exportRecords = async (kind: 'logbook' | 'duty') => {
    try {
      const response = await fetch(`/api/records/export?type=${kind}&format=csv`, { headers: { 'x-workspace-key': workspaceKey.trim() } });
      if (!response.ok) throw new Error('Export failed.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `dispatchlink-${kind}-${today()}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Export failed.'); }
  };

  const timeSpan = (startValue: unknown, endValue: unknown) => {
    const parse = (value: string) => { const match = value.match(/(\d{2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
    const start = parse(String(startValue || '')); const end = parse(String(endValue || ''));
    return start === null || end === null ? 0 : (end - start + 1440) % 1440;
  };
  const dutyMinutes = useMemo(() => timeSpan(duty.dutyStart || duty.reportTime, duty.dutyEnd), [duty]);
  const fdpMinutes = useMemo(() => timeSpan(duty.flightDutyStart || duty.reportTime, duty.flightDutyEnd), [duty]);
  const input = (state: RecordData, setter: (value: RecordData) => void, key: string, label: string, type = 'text', step?: string) => <label><span>{label}</span><input type={type} step={step} value={String(state[key] ?? '')} onChange={event => setter({ ...state, [key]: type === 'number' ? Number(event.target.value) : event.target.value })} /></label>;
  const synced = (value: unknown, label: string, title = 'Synced from active flight') => <label className="synced-field"><span>{label}<small>{title}</small></span><input value={String(value ?? '')} readOnly /></label>;
  const dutyZulu = (key: string, label: string, locked = false) => <label className={locked ? 'synced-field' : ''}><span>{label}{locked && <small>Auto-derived</small>}</span><ZuluTimeInput value={String(duty[key] || '')} readOnly={locked} onChange={value => setDuty({ ...duty, [key]: normalizeZulu(value) })} /></label>;

  return <div>
    <section className="card records-connect"><header><div><ShieldCheck size={18} /><h3>Cloud record workspace</h3></div><div className="button-row"><button onClick={applyFlightData}><RefreshCw size={15} /> Recopy active flight</button><button onClick={() => void refresh()}><RefreshCw size={15} /> Sync cloud</button></div></header><div className="card-body"><div className="workspace-row"><label><span>Private workspace key</span><input type="password" value={workspaceKey} onChange={event => setWorkspaceKey(event.target.value)} placeholder="Use a long unique passphrase" /></label><div><strong>{entries.length}</strong><span>flight records</span></div><div><strong>{duties.length}</strong><span>duty records</span></div></div>{status && <div className="notice">{status}</div>}<div className="record-source-strip"><span>Schedule: <strong>{flight.schedOut} / {flight.schedIn}</strong></span><span>OOOI: <strong>{times.out || '—'} · {times.off || '—'} · {times.on || '—'} · {times.in || '—'}</strong></span><span>Block: <strong>{formatMinutes(blockMinutes)}</strong></span></div></div></section>

    <section className="card record-presets"><header><div><FileCheck2 size={18} /><h3>Entry defaults</h3></div><span className="pill blue">Stored on this device</span></header><div className="card-body"><div className="form-grid three"><label><span>Default crew role</span><select value={presets.role} onChange={event => setPresets({ ...presets, role: event.target.value as RecordPresets['role'] })}><option>PIC</option><option>SIC</option><option>Dual</option><option>Instructor</option></select></label><label><span>Default operation</span><input value={presets.operation} onChange={event => setPresets({ ...presets, operation: event.target.value })} /></label><label className="check-inline"><input type="checkbox" checked={presets.crossCountry} onChange={event => setPresets({ ...presets, crossCountry: event.target.checked })} /> Copy block time to cross-country</label><label className="check-inline"><input type="checkbox" checked={presets.autoDutyTimes} onChange={event => setPresets({ ...presets, autoDutyTimes: event.target.checked })} /> Auto-derive report and duty times</label><label><span>Report before scheduled OUT (min)</span><input type="number" min="0" max="360" value={presets.reportLeadMinutes} onChange={event => setPresets({ ...presets, reportLeadMinutes: Number(event.target.value) })} /></label><label><span>Duty off after IN (min)</span><input type="number" min="0" max="180" value={presets.postFlightMinutes} onChange={event => setPresets({ ...presets, postFlightMinutes: Number(event.target.value) })} /></label></div></div></section>

    <div className="record-tabs"><button className={tab === 'logbook' ? 'active' : ''} onClick={() => setTab('logbook')}><BookOpenCheck size={17} /> Pilot logbook</button><button className={tab === 'duty' ? 'active' : ''} onClick={() => setTab('duty')}><Timer size={17} /> Duty / FTL log</button></div>

    {tab === 'logbook' && <div className="content-grid two">
      <section className="card"><header><div><FileCheck2 size={18} /><h3>Flight record</h3></div><button onClick={() => void exportRecords('logbook')}><Download size={15} /> Export CSV</button></header><div className="card-body"><div className="form-grid three">{synced(log.date, 'Date')}{synced(log.scheduledOut, 'Scheduled OUT')}{synced(log.scheduledIn, 'Scheduled IN')}{synced(log.departure, 'Departure')}{synced(log.arrival, 'Arrival')}{synced(log.aircraftType, 'Aircraft type')}{synced(log.registration, 'Registration')}{synced(log.flightNumber, 'Flight number')}{synced(log.out, 'OUT HH:MMz', 'Synced from OOOI')}{synced(log.off, 'OFF HH:MMz', 'Synced from OOOI')}{synced(log.on, 'ON HH:MMz', 'Synced from OOOI')}{synced(log.in, 'IN HH:MMz', 'Synced from OOOI')}{synced(log.totalTime, 'Total/block', 'Calculated from OUT–IN')}{synced(log.flightTime, 'Airborne', 'Calculated from OFF–ON')}{input(log, setLog, 'pic', 'PIC', 'number', '0.1')}{input(log, setLog, 'sic', 'SIC / co-pilot', 'number', '0.1')}{input(log, setLog, 'dual', 'Dual received', 'number', '0.1')}{input(log, setLog, 'instructor', 'Instructor', 'number', '0.1')}{input(log, setLog, 'night', 'Night', 'number', '0.1')}{input(log, setLog, 'instrument', 'Actual instrument', 'number', '0.1')}{input(log, setLog, 'simulatedInstrument', 'Simulated instrument', 'number', '0.1')}{input(log, setLog, 'crossCountry', 'Cross-country', 'number', '0.1')}{input(log, setLog, 'dayLandings', 'Day landings', 'number')}{input(log, setLog, 'nightLandings', 'Night landings', 'number')}{input(log, setLog, 'approaches', 'Approaches')}{input(log, setLog, 'operation', 'Operation / rules')}{input(log, setLog, 'role', 'Crew role')}</div><label className="stacked-input"><span>Remarks / endorsements reference</span><textarea value={String(log.remarks)} onChange={event => setLog({ ...log, remarks: event.target.value })} /></label><div className="attestation"><label><input type="checkbox" checked={Boolean(log.attested)} onChange={event => setLog({ ...log, attested: event.target.checked })} /> I attest that this entry is complete and accurate.</label>{input(log, setLog, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('logbook', log)}><Save size={16} /> Save immutable record</button></div></div></section>
      <section className="card"><header><div><BookOpenCheck size={18} /><h3>Recent entries</h3></div></header><div className="card-body record-list">{entries.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)}</strong><span>{String(entry.data.aircraftType)} {String(entry.data.registration)} · {String(entry.data.totalTime)} hr</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!entries.length && <p>No cloud records loaded.</p>}</div></section>
    </div>}

    {tab === 'duty' && <div className="content-grid two">
      <section className="card"><header><div><Timer size={18} /><h3>Duty / flight-duty record</h3></div><button onClick={() => void exportRecords('duty')}><Download size={15} /> Export CSV</button></header><div className="card-body"><div className="form-grid three">{synced(duty.date, 'Date')}{input(duty, setDuty, 'regulation', 'Scheme / regulation')}{input(duty, setDuty, 'role', 'Role')}{synced(duty.scheduledOut, 'Scheduled OUT')}{synced(duty.scheduledIn, 'Scheduled IN')}{dutyZulu('dutyStart', 'Duty on HH:MMz', presets.autoDutyTimes)}{dutyZulu('reportTime', 'Report HH:MMz', presets.autoDutyTimes)}{presets.autoDutyTimes ? synced(duty.flightDutyStart, 'FDP start / report', 'Auto-derived from schedule') : dutyZulu('flightDutyStart', 'FDP start / report')}{synced(duty.flightDutyEnd, 'FDP end / IN', 'Synced from OOOI')}{dutyZulu('dutyEnd', 'Duty off HH:MMz', presets.autoDutyTimes)}{input(duty, setDuty, 'sectors', 'Sectors', 'number')}{input(duty, setDuty, 'standby', 'Standby hours', 'number', '0.1')}{input(duty, setDuty, 'restBefore', 'Rest before duty', 'number', '0.1')}{input(duty, setDuty, 'maxDuty', 'Scheme max duty', 'number', '0.1')}{input(duty, setDuty, 'minRest', 'Scheme minimum rest', 'number', '0.1')}</div><label className="check-inline"><input type="checkbox" checked={Boolean(duty.augmented)} onChange={event => setDuty({ ...duty, augmented: event.target.checked })} /> Augmented crew / relief available</label><label className="stacked-input"><span>Notes / extensions / discretion / acclimatization</span><textarea value={String(duty.notes)} onChange={event => setDuty({ ...duty, notes: event.target.value })} /></label><div className="metric-strip mini"><div className={`metric ${dutyMinutes / 60 <= Number(duty.maxDuty || 0) ? 'good' : 'bad'}`}><span>Recorded duty</span><strong>{dutyMinutes ? formatMinutes(dutyMinutes) : '--:--'}</strong><small>Entered limit {String(duty.maxDuty)} hr</small></div><div className="metric"><span>Flight duty period</span><strong>{fdpMinutes ? formatMinutes(fdpMinutes) : '--:--'}</strong><small>Report/FDP start to IN</small></div><div className={`metric ${Number(duty.restBefore || 0) >= Number(duty.minRest || 0) ? 'good' : 'bad'}`}><span>Rest before duty</span><strong>{String(duty.restBefore)} hr</strong><small>Entered minimum {String(duty.minRest)} hr</small></div><div className="metric"><span>Sectors</span><strong>{String(duty.sectors)}</strong></div></div><div className="attestation"><label><input type="checkbox" checked={Boolean(duty.attested)} onChange={event => setDuty({ ...duty, attested: event.target.checked })} /> I attest that this duty record is complete and accurate.</label>{input(duty, setDuty, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('duty', duty)}><Save size={16} /> Save immutable record</button></div></div></section>
      <section className="card"><header><div><Timer size={18} /><h3>Recent duty records</h3></div></header><div className="card-body record-list">{duties.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.regulation)}</strong><span>{String(entry.data.dutyStart)}–{String(entry.data.dutyEnd)} · {String(entry.data.sectors)} sectors</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!duties.length && <p>No cloud duty records loaded.</p>}</div></section>
    </div>}
    <div className="notice warn compliance-note"><strong>Compliance status</strong><p>DispatchLink preserves entered data, attestations, exports and audit hashes. It does not decide whether a flight is legally loggable or certify compliance with an operator-specific FAA/EASA duty scheme.</p></div>
  </div>;
}
