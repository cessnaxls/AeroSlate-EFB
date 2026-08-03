import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CloudUpload, Plane, Save, Send } from 'lucide-react';
import { buildSimbriefDispatch, generateDispatchPayload, type FlightCandidate } from '../lib/dispatchlink';
import { loadLocal, saveLocal } from '../lib/storage';
import {
  appendLedgerRecord, emptyLedger, getOrCreateDeviceId, normalizeLedger, synchronizeLedger,
  type AeroSlateLedger, type GitHubCloudConfig, type RecordData
} from '../lib/cloudLedger';

interface Props {
  candidate: FlightCandidate | null;
  onDispatch: (url: string, flight: FlightCandidate, staticId: string) => void;
  notify: (message: string) => void;
}
interface CloudPrefs { gistId: string; token: string; passphrase: string; autoSync: boolean; rememberSecrets: boolean; }
const LEDGER_KEY = 'aeroslate.records.ledger.v2';
const CLOUD_KEY = 'aeroslate.records.github.v1';

function payloadFor(flight: FlightCandidate) { return generateDispatchPayload(flight); }
function tripFlight(data: RecordData): FlightCandidate {
  return {
    id: String(data.candidateId), date: String(data.date), aircraft: String(data.aircraft), registration: String(data.registration),
    flightNumber: String(data.flightNumber), departure: String(data.departure), arrival: String(data.arrival), std: String(data.std),
    sta: String(data.sta), ete: String(data.ete), rawStd: String(data.rawStd || ''), rawSta: String(data.rawSta || '')
  };
}

export function TripsPage({ candidate, onDispatch, notify }: Props) {
  const [ledger, setLedger] = useState<AeroSlateLedger>(() => normalizeLedger(loadLocal(LEDGER_KEY, emptyLedger())));
  const [busy, setBusy] = useState(false);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const storedCloud = loadLocal<Partial<CloudPrefs>>(CLOUD_KEY, {});
  const cloud: CloudPrefs = { gistId: storedCloud.gistId || '', token: storedCloud.rememberSecrets ? storedCloud.token || '' : '', passphrase: storedCloud.rememberSecrets ? storedCloud.passphrase || '' : '', autoSync: storedCloud.autoSync ?? true, rememberSecrets: storedCloud.rememberSecrets ?? false };
  useEffect(() => saveLocal(LEDGER_KEY, ledger), [ledger]);

  const addTrip = async () => {
    if (!candidate) return notify('Select a parsed flight in Flight Finder first.');
    const load = payloadFor(candidate);
    const data: RecordData = { candidateId: candidate.id, date: candidate.date, flightNumber: candidate.flightNumber, departure: candidate.departure,
      arrival: candidate.arrival, aircraft: candidate.aircraft, registration: candidate.registration, std: candidate.std, sta: candidate.sta, ete: candidate.ete,
      rawStd: candidate.rawStd || '', rawSta: candidate.rawSta || '', status: 'Scheduled', ...load };
    const result = await appendLedgerRecord(ledger, 'trip', data, deviceId); setLedger(result.ledger);
    notify(`Scheduled ${candidate.flightNumber} · ${load.pax} pax, ${load.bags} bags${load.freight ? `, ${load.freight.toLocaleString()} lb freight` : ''}.`);
    if (cloud.autoSync && cloud.token && cloud.passphrase.length >= 12) {
      try { setBusy(true); const sync = await synchronizeLedger({ token: cloud.token, gistId: cloud.gistId, passphrase: cloud.passphrase }, result.ledger); setLedger(sync.ledger); saveLocal(CLOUD_KEY, { ...storedCloud, gistId: sync.gistId }); }
      catch { notify('Trip saved locally. Open Flight Logs to reconnect the free GitHub Gist sync.'); }
      finally { setBusy(false); }
    }
  };
  const sync = async () => {
    if (!cloud.token || cloud.passphrase.length < 12) return notify('Configure GitHub Gist sync in Flight Logs first.');
    try { setBusy(true); const result = await synchronizeLedger({ token: cloud.token, gistId: cloud.gistId, passphrase: cloud.passphrase } as GitHubCloudConfig, ledger); setLedger(result.ledger); saveLocal(CLOUD_KEY, { ...storedCloud, gistId: result.gistId }); notify(`Trips synchronized · ${result.ledger.trips.length} scheduled.`); }
    catch (e) { notify(e instanceof Error ? e.message : 'Trip sync failed.'); } finally { setBusy(false); }
  };
  const trips = ledger.trips.slice().sort((a,b) => `${a.data.date} ${a.data.std}`.localeCompare(`${b.data.date} ${b.data.std}`));
  return <div className="trips-page">
    <section className="card trip-scheduler"><header><div><CalendarDays size={18}/><h3>Trip calendar</h3></div><button onClick={() => void sync()} disabled={busy}><CloudUpload size={16}/>{busy ? 'Syncing…' : 'Sync Gist'}</button></header>
      <div className="card-body trip-add-row"><div><strong>{candidate ? `${candidate.flightNumber} · ${candidate.departure}–${candidate.arrival}` : 'No selected flight'}</strong><span>{candidate ? `${candidate.date} · ${candidate.std}–${candidate.sta} · ${candidate.aircraft} ${candidate.registration}` : 'Select a flight in Flight Finder, then schedule it here.'}</span></div><button className="primary" onClick={() => void addTrip()} disabled={!candidate}><Save size={16}/> Add to trips</button></div></section>
    <section className="card"><header><div><Plane size={18}/><h3>Scheduled trips</h3></div><span className="pill neutral">{trips.length}</span></header><div className="card-body trip-list">
      {trips.map(entry => { const f=tripFlight(entry.data); return <article key={entry.id}><div className="trip-date"><strong>{String(entry.data.date)}</strong><span>{String(entry.data.std)}–{String(entry.data.sta)}</span></div><div className="trip-route"><strong>{String(entry.data.flightNumber)} · {String(entry.data.departure)} → {String(entry.data.arrival)}</strong><span>{String(entry.data.aircraft)} · {String(entry.data.registration)}</span></div><div className="trip-load"><strong>{String(entry.data.pax)} pax</strong><span>{String(entry.data.bags)} bags · {Number(entry.data.freight || 0).toLocaleString()} lb freight</span></div><button className="primary compact" onClick={() => { const plan=buildSimbriefDispatch(f,{ pax:Number(entry.data.pax), cargo:Number(entry.data.freight), remarks:`AeroSlate scheduled load: ${entry.data.bags} bags (${Number(entry.data.bagWeight).toLocaleString()} lb).` }); onDispatch(plan.url,f,plan.staticId); }}><Send size={14}/> Dispatch</button></article>; })}
      {!trips.length && <div className="empty-cell">No scheduled trips yet. Add a parsed flight to create your calendar.</div>}
    </div></section>
  </div>;
}
