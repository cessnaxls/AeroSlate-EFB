import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Download, FileCheck2, RefreshCw, Save, ShieldCheck, Timer } from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';
import { oooiStorageKey, type OOOITimes } from './OOOIPage';

interface LogEntry { id: string; createdAt: string; data: Record<string, string | number | boolean>; auditHash: string; }
interface DutyEntry { id: string; createdAt: string; data: Record<string, string | number | boolean>; auditHash: string; }

function today() { return new Date().toISOString().slice(0, 10); }
function minutesBetween(a: string, b: string) { const p = (v: string) => { const m = v.match(/(\d{2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }; const x = p(a), y = p(b); return x === null || y === null ? 0 : (y - x + 1440) % 1440; }
function decimalHours(minutes: number) { return Math.round(minutes / 6) / 10; }

export function RecordsPage({ flight }: { flight: { release: string; origin: string; destination: string; aircraft: string; registration: string; flightNumber: string; airline: string } }) {
  const [tab, setTab] = useState<'logbook' | 'duty'>('logbook');
  const [workspaceKey, setWorkspaceKey] = useState(() => loadLocal('dispatchlink.records.key', ''));
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [status, setStatus] = useState('');
  const times = loadLocal<OOOITimes>(oooiStorageKey(flight.release, flight.origin, flight.destination), { out: '', off: '', on: '', in: '' });
  const blockMinutes = minutesBetween(times.out, times.in); const flightMinutes = minutesBetween(times.off, times.on);
  const [log, setLog] = useState<Record<string, string | number | boolean>>({
    date: today(), departure: flight.origin, arrival: flight.destination, aircraftType: flight.aircraft, registration: flight.registration,
    flightNumber: `${flight.airline}${flight.flightNumber}`, out: times.out, off: times.off, on: times.on, in: times.in,
    totalTime: decimalHours(blockMinutes), flightTime: decimalHours(flightMinutes), pic: 0, sic: decimalHours(blockMinutes), dual: 0,
    instructor: 0, night: 0, instrument: 0, simulatedInstrument: 0, crossCountry: decimalHours(blockMinutes), dayLandings: 0,
    nightLandings: 0, approaches: '', operation: 'Part 91 / NCO', role: 'SIC', remarks: '', attested: false, signerName: ''
  });
  const [duty, setDuty] = useState<Record<string, string | number | boolean>>({
    date: today(), regulation: 'FAA Part 117 / company scheme', dutyStart: '', reportTime: '', flightDutyStart: times.out,
    flightDutyEnd: times.in, dutyEnd: '', sectors: flight.origin && flight.destination ? 1 : 0, standby: 0, restBefore: 10, maxDuty: 13, minRest: 10,
    augmented: false, role: 'Flightcrew', notes: '', attested: false, signerName: ''
  });

  useEffect(() => saveLocal('dispatchlink.records.key', workspaceKey), [workspaceKey]);
  useEffect(() => {
    setLog(current => ({ ...current, departure: flight.origin, arrival: flight.destination, aircraftType: flight.aircraft, registration: flight.registration, flightNumber: `${flight.airline}${flight.flightNumber}`, out: times.out, off: times.off, on: times.on, in: times.in, totalTime: decimalHours(blockMinutes), flightTime: decimalHours(flightMinutes), sic: decimalHours(blockMinutes), crossCountry: decimalHours(blockMinutes) }));
  }, [flight.release, times.out, times.off, times.on, times.in]);

  const api = async (path: string, options: RequestInit = {}) => {
    if (!workspaceKey.trim()) throw new Error('Enter a private cloud workspace key.');
    const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', 'x-workspace-key': workspaceKey.trim(), ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Cloud record request failed.');
    return data;
  };
  const refresh = async () => { try { const data = await api('/api/records'); setEntries(data.logbook || []); setDuties(data.duty || []); setStatus('Cloud records synchronized.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Sync failed.'); } };
  const saveRecord = async (kind: 'logbook' | 'duty', data: Record<string, string | number | boolean>) => {
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

  const dutyMinutes = useMemo(() => minutesBetween(String(duty.dutyStart || duty.reportTime || ''), String(duty.dutyEnd || '')), [duty]);
  const input = (state: Record<string, string | number | boolean>, setter: (value: Record<string, string | number | boolean>) => void, key: string, label: string, type = 'text', step?: string) => <label><span>{label}</span><input type={type} step={step} value={String(state[key] ?? '')} onChange={event => setter({ ...state, [key]: type === 'number' ? Number(event.target.value) : event.target.value })} /></label>;

  return <div>
    <section className="card records-connect"><header><div><ShieldCheck size={18} /><h3>Cloud record workspace</h3></div><button onClick={() => void refresh()}><RefreshCw size={15} /> Sync</button></header><div className="card-body"><div className="workspace-row"><label><span>Private workspace key</span><input type="password" value={workspaceKey} onChange={event => setWorkspaceKey(event.target.value)} placeholder="Use a long unique passphrase" /></label><div><strong>{entries.length}</strong><span>flight records</span></div><div><strong>{duties.length}</strong><span>duty records</span></div></div>{status && <div className="notice">{status}</div>}<p className="disclaimer">The key identifies your encrypted-at-rest Render workspace file; losing the key prevents normal lookup. Use a Render persistent disk for durable storage and keep regular CSV/JSON exports.</p></div></section>
    <div className="record-tabs"><button className={tab === 'logbook' ? 'active' : ''} onClick={() => setTab('logbook')}><BookOpenCheck size={17} /> Pilot logbook</button><button className={tab === 'duty' ? 'active' : ''} onClick={() => setTab('duty')}><Timer size={17} /> Duty / FTL log</button></div>

    {tab === 'logbook' && <div className="content-grid two">
      <section className="card"><header><div><FileCheck2 size={18} /><h3>Flight record</h3></div><button onClick={() => void exportRecords('logbook')}><Download size={15} /> Export CSV</button></header><div className="card-body"><div className="form-grid three">{input(log, setLog, 'date', 'Date', 'date')}{input(log, setLog, 'departure', 'Departure')}{input(log, setLog, 'arrival', 'Arrival')}{input(log, setLog, 'aircraftType', 'Aircraft type')}{input(log, setLog, 'registration', 'Registration')}{input(log, setLog, 'flightNumber', 'Flight number')}{input(log, setLog, 'out', 'OUT HH:MMz')}{input(log, setLog, 'off', 'OFF HH:MMz')}{input(log, setLog, 'on', 'ON HH:MMz')}{input(log, setLog, 'in', 'IN HH:MMz')}{input(log, setLog, 'totalTime', 'Total/block', 'number', '0.1')}{input(log, setLog, 'flightTime', 'Airborne', 'number', '0.1')}{input(log, setLog, 'pic', 'PIC', 'number', '0.1')}{input(log, setLog, 'sic', 'SIC / co-pilot', 'number', '0.1')}{input(log, setLog, 'dual', 'Dual received', 'number', '0.1')}{input(log, setLog, 'instructor', 'Instructor', 'number', '0.1')}{input(log, setLog, 'night', 'Night', 'number', '0.1')}{input(log, setLog, 'instrument', 'Actual instrument', 'number', '0.1')}{input(log, setLog, 'simulatedInstrument', 'Simulated instrument', 'number', '0.1')}{input(log, setLog, 'crossCountry', 'Cross-country', 'number', '0.1')}{input(log, setLog, 'dayLandings', 'Day landings', 'number')}{input(log, setLog, 'nightLandings', 'Night landings', 'number')}{input(log, setLog, 'approaches', 'Approaches')}{input(log, setLog, 'operation', 'Operation / rules')}{input(log, setLog, 'role', 'Crew role')}</div><label className="stacked-input"><span>Remarks / endorsements reference</span><textarea value={String(log.remarks)} onChange={event => setLog({ ...log, remarks: event.target.value })} /></label><div className="attestation"><label><input type="checkbox" checked={Boolean(log.attested)} onChange={event => setLog({ ...log, attested: event.target.checked })} /> I attest that this entry is complete and accurate.</label>{input(log, setLog, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('logbook', log)}><Save size={16} /> Save immutable record</button></div></div></section>
      <section className="card"><header><div><BookOpenCheck size={18} /><h3>Recent entries</h3></div></header><div className="card-body record-list">{entries.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)}</strong><span>{String(entry.data.aircraftType)} {String(entry.data.registration)} · {String(entry.data.totalTime)} hr</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!entries.length && <p>No cloud records loaded.</p>}</div></section>
    </div>}

    {tab === 'duty' && <div className="content-grid two">
      <section className="card"><header><div><Timer size={18} /><h3>Duty / flight-duty record</h3></div><button onClick={() => void exportRecords('duty')}><Download size={15} /> Export CSV</button></header><div className="card-body"><div className="form-grid three">{input(duty, setDuty, 'date', 'Date', 'date')}{input(duty, setDuty, 'regulation', 'Scheme / regulation')}{input(duty, setDuty, 'role', 'Role')}{input(duty, setDuty, 'dutyStart', 'Duty on HH:MMz')}{input(duty, setDuty, 'reportTime', 'Report HH:MMz')}{input(duty, setDuty, 'flightDutyStart', 'FDP start HH:MMz')}{input(duty, setDuty, 'flightDutyEnd', 'FDP end HH:MMz')}{input(duty, setDuty, 'dutyEnd', 'Duty off HH:MMz')}{input(duty, setDuty, 'sectors', 'Sectors', 'number')}{input(duty, setDuty, 'standby', 'Standby hours', 'number', '0.1')}{input(duty, setDuty, 'restBefore', 'Rest before duty', 'number', '0.1')}{input(duty, setDuty, 'maxDuty', 'Scheme max duty', 'number', '0.1')}{input(duty, setDuty, 'minRest', 'Scheme minimum rest', 'number', '0.1')}</div><label className="check-inline"><input type="checkbox" checked={Boolean(duty.augmented)} onChange={event => setDuty({ ...duty, augmented: event.target.checked })} /> Augmented crew / relief available</label><label className="stacked-input"><span>Notes / extensions / discretion / acclimatization</span><textarea value={String(duty.notes)} onChange={event => setDuty({ ...duty, notes: event.target.value })} /></label><div className="metric-strip mini"><div className={`metric ${dutyMinutes / 60 <= Number(duty.maxDuty || 0) ? 'good' : 'bad'}`}><span>Recorded duty</span><strong>{dutyMinutes ? `${Math.floor(dutyMinutes / 60)}:${String(dutyMinutes % 60).padStart(2, '0')}` : '--:--'}</strong><small>Entered limit {String(duty.maxDuty)} hr</small></div><div className={`metric ${Number(duty.restBefore || 0) >= Number(duty.minRest || 0) ? 'good' : 'bad'}`}><span>Rest before duty</span><strong>{String(duty.restBefore)} hr</strong><small>Entered minimum {String(duty.minRest)} hr</small></div><div className="metric"><span>Sectors</span><strong>{String(duty.sectors)}</strong></div></div><div className="attestation"><label><input type="checkbox" checked={Boolean(duty.attested)} onChange={event => setDuty({ ...duty, attested: event.target.checked })} /> I attest that this duty record is complete and accurate.</label>{input(duty, setDuty, 'signerName', 'Typed signature / name')}<button className="primary" onClick={() => void saveRecord('duty', duty)}><Save size={16} /> Save immutable record</button></div></div></section>
      <section className="card"><header><div><Timer size={18} /><h3>Recent duty records</h3></div></header><div className="card-body record-list">{duties.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.regulation)}</strong><span>{String(entry.data.dutyStart)}–{String(entry.data.dutyEnd)} · {String(entry.data.sectors)} sectors</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!duties.length && <p>No cloud duty records loaded.</p>}</div></section>
    </div>}
    <div className="notice warn compliance-note"><strong>Compliance status</strong><p>DispatchLink records the fields, attestations, revision history, exports, and audit hashes needed for a reliable electronic record. It is not itself “FAA/EASA certified,” and it cannot decide whether time is legally loggable or whether a duty period complies with a particular operator’s approved scheme. The pilot/operator remains responsible for classification, signatures, retention, backups, and authority acceptance.</p></div>
  </div>;
}
