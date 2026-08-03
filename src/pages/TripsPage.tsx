import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CloudUpload, Plane, Save, Send } from 'lucide-react';
import { buildSimbriefDispatch, normalizeSimbriefType, type FlightCandidate } from '../lib/dispatchlink';
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

const CAPACITY: Record<string, number> = {
  A319: 150, A320: 180, A20N: 186, A321: 220, A21N: 235, A220: 135, A223: 145, BCS1: 125, BCS3: 145,
  B737: 143, B738: 175, B38M: 178, B739: 179, B39M: 179, B752: 199, B753: 234, B763: 218, B764: 238,
  B772: 300, B77W: 350, B788: 242, B789: 290, B78X: 330, A332: 260, A333: 290, A339: 300, A359: 315,
  CRJ7: 70, CRJ9: 76, E170: 70, E175: 76, E75L: 76, E75S: 76, E190: 100, E195: 118, AT72: 70
};
function rand(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }
function clockHour(value: string) { const m = value.match(/(\d{2}):(\d{2})/); return m ? Number(m[1]) : 12; }
function payloadFor(flight: FlightCandidate) {
  const equip = normalizeSimbriefType(flight.aircraft || 'A320');
  const seats = CAPACITY[equip] || CAPACITY[flight.aircraft] || 180;
  const departureClock = flight.timeMode === 'local-converted' && flight.rawStd ? flight.rawStd : flight.std;
  const hour = clockHour(departureClock);
  const [lo, hi] = hour < 5 ? [42, 70] : hour < 9 ? [68, 95] : hour < 16 ? [72, 98] : hour < 22 ? [78, 100] : [50, 78];
  const pax = Math.max(1, Math.round(seats * rand(lo, hi) / 100));
  const bags = rand(Math.ceil(pax * .8), pax);
  const paxWeight = pax * 190; const bagWeight = bags * 40;
  const maxFreight = Math.floor((paxWeight + bagWeight) * .25 / 10) * 10;
  const freight = Math.random() < .175 && maxFreight >= 10 ? rand(1, Math.max(1, Math.floor(maxFreight / 10))) * 10 : 0;
  return { seats, pax, bags, paxWeight, bagWeight, freight, payloadWeight: paxWeight + bagWeight + freight };
}
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
      try { setBusy(true); const sync = await synchronizeLedger({ token: cloud.token, gistId: cloud.gistId, passphrase: cloud.passphrase }, result.ledger); setLedger(sync.ledger); }
      catch { notify('Trip saved locally. Open Flight Logs to reconnect the free GitHub Gist sync.'); }
      finally { setBusy(false); }
    }
  };
  const sync = async () => {
    if (!cloud.token || cloud.passphrase.length < 12) return notify('Configure GitHub Gist sync in Flight Logs first.');
    try { setBusy(true); const result = await synchronizeLedger({ token: cloud.token, gistId: cloud.gistId, passphrase: cloud.passphrase } as GitHubCloudConfig, ledger); setLedger(result.ledger); notify(`Trips synchronized · ${result.ledger.trips.length} scheduled.`); }
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
