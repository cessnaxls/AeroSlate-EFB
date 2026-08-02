import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CloudDownload, CloudUpload, Download, HardDrive, KeyRound, RefreshCw, Save, ShieldCheck, Timer, Upload } from 'lucide-react';
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

interface RecordPresets { role: 'PIC' | 'SIC' | 'Dual' | 'Instructor'; operation: string; rules: 'IFR' | 'VFR'; crossCountry: boolean; autoDutyTimes: boolean; reportLeadMinutes: number; postFlightMinutes: number; }
interface CloudPrefs { gistId: string; token: string; passphrase: string; autoSync: boolean; rememberSecrets: boolean; }

const OPERATIONS = ['Part 91', 'Part 121', 'Part 135', 'EASA CAT', 'EASA NCC', 'EASA NCO', 'Training', 'Other'];
const DUTY_SCHEMES = ['FAA Part 117', 'FAA Part 135', 'FAA Part 91 / company', 'EASA ORO.FTL.205', 'Company scheme', 'Other'];
const DEFAULT_PRESETS: RecordPresets = { role: 'SIC', operation: 'Part 91', rules: 'IFR', crossCountry: true, autoDutyTimes: true, reportLeadMinutes: 60, postFlightMinutes: 15 };
const LEDGER_KEY = 'aeroslate.records.ledger.v2';
const CLOUD_KEY = 'aeroslate.records.github.v1';
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

  useEffect(() => saveLocal(LEDGER_KEY, ledger), [ledger]);
  useEffect(() => saveLocal(CLOUD_KEY, { gistId: cloud.gistId, token: cloud.rememberSecrets ? cloud.token : '', passphrase: cloud.rememberSecrets ? cloud.passphrase : '', autoSync: cloud.autoSync, rememberSecrets: cloud.rememberSecrets }), [cloud]);
  useEffect(() => saveLocal('aeroslate.records.presets', presets), [presets]);
  useEffect(() => saveLocal(logKey, log), [logKey, log]); useEffect(() => saveLocal(dutyKey, duty), [dutyKey, duty]);
  useEffect(() => { if (!status) return; const timer = window.setTimeout(() => setStatus(''), 6000); return () => window.clearTimeout(timer); }, [status]);
  useEffect(() => {
    const generated = baseLog(flight, blockHours, airborneHours, presets, times);
    setLog(current => ({ ...current, ...generated, remarks: current.remarks || '', approaches: current.approaches || '', signerName: current.signerName || '', attested: current.attested || false }));
    const dutyBase = baseDuty(flight, times, presets);
    setDuty(current => ({ ...current, ...dutyBase, regulation: current.regulation || dutyBase.regulation, role: current.role || dutyBase.role, notes: current.notes || '', signerName: current.signerName || '', attested: current.attested || false }));
  }, [flight.release, flight.origin, flight.destination, flight.aircraft, flight.registration, flight.flightNumber, flight.airline, flight.schedOut, flight.schedIn, flight.flightDate, times.out, times.off, times.on, times.in, blockHours, airborneHours, presets.role, presets.operation, presets.rules, presets.crossCountry, presets.autoDutyTimes, presets.reportLeadMinutes, presets.postFlightMinutes]);

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
      const appended = await appendLedgerRecord(working, kind, data, deviceId); setLedger(appended.ledger);
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

  return <div className="records-page">
    <section className="card records-connect cloud-records"><header><div><ShieldCheck size={18} /><h3>Free encrypted cloud records</h3></div><span className="pill good">NO RENDER DISK</span></header><div className="card-body">
      <div className="cloud-explainer"><HardDrive size={20} /><div><strong>Local-first, cloud-backed</strong><p>Every entry is written to this device first. Optional sync encrypts the complete ledger in your browser and stores only ciphertext in a private GitHub Gist. Your token and passphrase are never sent to Render.</p></div></div>
      <div className="form-grid three cloud-fields"><label><span>GitHub token</span><input type="password" value={cloud.token} onChange={event => setCloud({ ...cloud, token: event.target.value })} placeholder="Fine-grained token · Gists write" /></label><label><span>Encryption passphrase</span><input type="password" value={cloud.passphrase} onChange={event => setCloud({ ...cloud, passphrase: event.target.value })} placeholder="At least 12 characters" /></label><label><span>Private Gist ID</span><input value={cloud.gistId} onChange={event => setCloud({ ...cloud, gistId: event.target.value.trim() })} placeholder="Created automatically on first sync" /></label></div>
      <div className="cloud-controls"><label className="check-inline"><input type="checkbox" checked={cloud.autoSync} onChange={event => setCloud({ ...cloud, autoSync: event.target.checked })} /> Sync after each saved entry</label><label className="check-inline"><input type="checkbox" checked={cloud.rememberSecrets} onChange={event => setCloud({ ...cloud, rememberSecrets: event.target.checked })} /> Remember token and passphrase on this device</label><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer"><KeyRound size={15} /> Create GitHub token</a></div>
      <div className="button-row cloud-buttons"><button className="primary" onClick={() => void syncNow()} disabled={busy}><CloudUpload size={16} /> {busy ? 'Working…' : cloud.gistId ? 'Sync now' : 'Create cloud vault'}</button><button onClick={() => void pullCloud()} disabled={busy || !cloud.gistId}><CloudDownload size={16} /> Pull cloud</button><button onClick={() => void exportBackup()}><Download size={16} /> Encrypted backup</button><button onClick={() => restoreInput.current?.click()}><Upload size={16} /> Restore backup</button><input ref={restoreInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void restoreBackup(event.target.files?.[0])} /></div>
      <div className="cloud-stats"><div><strong>{entries.length}</strong><span>Flights on device</span></div><div><strong>{duties.length}</strong><span>Duties on device</span></div><div><strong>{ledger.audit.length}</strong><span>Audit events</span></div><div><strong>{cloud.gistId ? 'CONNECTED' : 'LOCAL'}</strong><span>Storage state</span></div></div>
      {status && <div className="notice records-status">{status}</div>}
    </div></section>

    <section className="card record-defaults"><header><div><BookOpenCheck size={18} /><h3>Entry defaults</h3></div><span className="pill blue">DEVICE</span></header><div className="card-body form-grid six"><label><span>Crew role</span><select value={presets.role} onChange={event => setPresets({ ...presets, role: event.target.value as RecordPresets['role'] })}>{['PIC', 'SIC', 'Dual', 'Instructor'].map(value => <option key={value}>{value}</option>)}</select></label><label><span>Operation</span><select value={presets.operation} onChange={event => setPresets({ ...presets, operation: event.target.value })}>{OPERATIONS.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Rules</span><select value={presets.rules} onChange={event => setPresets({ ...presets, rules: event.target.value as 'IFR' | 'VFR' })}><option>IFR</option><option>VFR</option></select></label><label className="check-inline"><input type="checkbox" checked={presets.crossCountry} onChange={event => setPresets({ ...presets, crossCountry: event.target.checked })} /> Block → XC</label><label><span>Report lead (min)</span><input type="number" min="0" value={presets.reportLeadMinutes} onChange={event => setPresets({ ...presets, reportLeadMinutes: Number(event.target.value) })} /></label><label><span>Postflight (min)</span><input type="number" min="0" value={presets.postFlightMinutes} onChange={event => setPresets({ ...presets, postFlightMinutes: Number(event.target.value) })} /></label></div></section>

    <div className="record-tabs"><button className={tab === 'logbook' ? 'active' : ''} onClick={() => setTab('logbook')}><BookOpenCheck size={17} /> Logbook</button><button className={tab === 'duty' ? 'active' : ''} onClick={() => setTab('duty')}><Timer size={17} /> Duty / FTL</button></div>

    {tab === 'logbook' && <div className="records-layout"><section className="card record-editor"><header><div><BookOpenCheck size={18} /><h3>Flight entry</h3></div><button onClick={() => exportRecords('logbook')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Flight identity and authoritative times</legend><div className="form-grid four">{synced(log.date, 'Date')}{synced(log.flightNumber, 'Flight')}{synced(log.departure, 'Departure')}{synced(log.arrival, 'Arrival')}{synced(log.aircraftType, 'Aircraft')}{synced(log.registration, 'Registration')}{synced(log.scheduledOut, 'STD')}{synced(log.scheduledIn, 'STA')}{synced(log.out, 'OUT', 'OOOI')}{synced(log.off, 'OFF', 'OOOI')}{synced(log.on, 'ON', 'OOOI')}{synced(log.in, 'IN', 'OOOI')}{synced(log.totalTime, 'Block', 'OUT–IN')}{synced(log.flightTime, 'Airborne', 'OFF–ON')}</div></fieldset>
      <fieldset><legend>Creditable time</legend><div className="form-grid four">{textInput(log, setLog, 'pic', 'PIC', 'number', '0.1')}{textInput(log, setLog, 'sic', 'SIC / co-pilot', 'number', '0.1')}{textInput(log, setLog, 'dual', 'Dual received', 'number', '0.1')}{textInput(log, setLog, 'instructor', 'Instructor', 'number', '0.1')}{textInput(log, setLog, 'night', 'Night', 'number', '0.1')}{textInput(log, setLog, 'instrument', 'Actual instrument', 'number', '0.1')}{textInput(log, setLog, 'simulatedInstrument', 'Simulated instrument', 'number', '0.1')}{textInput(log, setLog, 'crossCountry', 'Cross-country', 'number', '0.1')}{textInput(log, setLog, 'dayLandings', 'Day landings', 'number')}{textInput(log, setLog, 'nightLandings', 'Night landings', 'number')}{textInput(log, setLog, 'approaches', 'Approaches')}</div></fieldset>
      <fieldset><legend>Operation</legend><div className="form-grid three">{selectInput(log, setLog, 'role', 'Crew role', ['PIC', 'SIC', 'Dual', 'Instructor'])}{selectInput(log, setLog, 'operation', 'Operation', OPERATIONS)}{selectInput(log, setLog, 'rules', 'Flight rules', ['IFR', 'VFR'])}</div><label className="stacked-input"><span>Remarks / endorsements reference</span><textarea value={String(log.remarks)} onChange={event => update(setLog, 'remarks', event.target.value)} /></label></fieldset>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(log.attested)} onChange={event => update(setLog, 'attested', event.target.checked)} /> I attest this entry is complete and accurate.</label>{textInput(log, setLog, 'signerName', 'Typed signature / name')}<button className="primary" disabled={busy} onClick={() => void saveRecord('logbook', log)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history"><header><div><BookOpenCheck size={18} /><h3>Recent flights</h3></div></header><div className="card-body record-list">{entries.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.departure)}–{String(entry.data.arrival)}</strong><span>{String(entry.data.aircraftType)} {String(entry.data.registration)} · {String(entry.data.totalTime)} hr</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!entries.length && <p className="muted">No flight records saved on this device.</p>}</div></section></div>}

    {tab === 'duty' && <div className="records-layout"><section className="card record-editor"><header><div><Timer size={18} /><h3>Duty entry</h3></div><button onClick={() => exportRecords('duty')}><Download size={15} /> CSV</button></header><div className="card-body">
      <fieldset><legend>Scheme and schedule</legend><div className="form-grid four">{synced(duty.date, 'Date')}{selectInput(duty, setDuty, 'regulation', 'Regulation / scheme', DUTY_SCHEMES)}{selectInput(duty, setDuty, 'role', 'Role', ['Flightcrew', 'PIC', 'SIC', 'Cabin crew', 'Other'])}{synced(duty.scheduledOut, 'STD')}{synced(duty.scheduledIn, 'STA')}</div></fieldset>
      <fieldset><legend>Duty times</legend><div className="form-grid four">{dutyZulu('dutyStart', 'Duty on', presets.autoDutyTimes)}{dutyZulu('reportTime', 'Report', presets.autoDutyTimes)}{dutyZulu('flightDutyStart', 'FDP start', presets.autoDutyTimes)}{synced(duty.flightDutyEnd, 'FDP end / IN', 'OOOI')}{dutyZulu('dutyEnd', 'Duty off', presets.autoDutyTimes)}{textInput(duty, setDuty, 'sectors', 'Sectors', 'number')}{textInput(duty, setDuty, 'standby', 'Standby hours', 'number', '0.1')}{textInput(duty, setDuty, 'restBefore', 'Rest before', 'number', '0.1')}{textInput(duty, setDuty, 'maxDuty', 'Scheme max duty', 'number', '0.1')}{textInput(duty, setDuty, 'minRest', 'Scheme min rest', 'number', '0.1')}</div><label className="check-inline"><input type="checkbox" checked={Boolean(duty.augmented)} onChange={event => update(setDuty, 'augmented', event.target.checked)} /> Augmented crew / relief available</label></fieldset>
      <div className="duty-summary"><div><span>Duty</span><strong>{dutyMinutes ? formatMinutes(dutyMinutes) : '--:--'}</strong></div><div><span>FDP</span><strong>{fdpMinutes ? formatMinutes(fdpMinutes) : '--:--'}</strong></div><div><span>Rest</span><strong>{String(duty.restBefore)} hr</strong></div><div><span>Sectors</span><strong>{String(duty.sectors)}</strong></div></div>
      <label className="stacked-input"><span>Notes / extensions / discretion / acclimatization</span><textarea value={String(duty.notes)} onChange={event => update(setDuty, 'notes', event.target.value)} /></label>
      <div className="attestation"><label><input type="checkbox" checked={Boolean(duty.attested)} onChange={event => update(setDuty, 'attested', event.target.checked)} /> I attest this duty record is complete and accurate.</label>{textInput(duty, setDuty, 'signerName', 'Typed signature / name')}<button className="primary" disabled={busy} onClick={() => void saveRecord('duty', duty)}><Save size={16} /> Save record</button></div>
    </div></section><section className="card record-history"><header><div><Timer size={18} /><h3>Recent duty</h3></div></header><div className="card-body record-list">{duties.slice().reverse().slice(0, 30).map(entry => <article key={entry.id}><div><strong>{String(entry.data.date)} · {String(entry.data.regulation)}</strong><span>{String(entry.data.dutyStart)}–{String(entry.data.dutyEnd)} · {String(entry.data.sectors)} sectors</span></div><small>{entry.auditHash.slice(0, 12)}…</small></article>)}{!duties.length && <p className="muted">No duty records saved on this device.</p>}</div></section></div>}
    <div className="notice warn compliance-note"><strong>Recordkeeping aid</strong><p>AeroSlate preserves entered data, attestations, exports and per-device audit chains. It does not determine whether time is legally loggable or certify compliance with an operator-specific FAA/EASA scheme.</p></div>
  </div>;
}
