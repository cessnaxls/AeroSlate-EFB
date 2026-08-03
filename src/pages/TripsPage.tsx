import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, CloudUpload, Plane, Save, Send, Shuffle, Trash2 } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import { buildSimbriefDispatch, type Airport, type FlightCandidate } from '../lib/dispatchlink';
import { loadLocal, saveLocal } from '../lib/storage';
import { appendLedgerRecord, emptyLedger, getOrCreateDeviceId, normalizeLedger, synchronizeLedger, type AeroSlateLedger, type GitHubCloudConfig } from '../lib/cloudLedger';
import { addTripsLocal, flightFromTrip, loadTrips, mergeLedgerTrips, removeTripLocal, TRIPS_UPDATED_EVENT, tripToRecordData, type PlannedTrip } from '../lib/trips';

interface Props { candidate: FlightCandidate | null; onDispatch: (url: string, flight: FlightCandidate, staticId: string) => void; notify: (message: string) => void }
interface CloudPrefs { gistId: string; token: string; passphrase: string; autoSync: boolean; rememberSecrets: boolean }
const LEDGER_KEY = 'aeroslate.records.ledger.v2', CLOUD_KEY = 'aeroslate.records.github.v1';
const AIRPORTS = (airportCatalog as Airport[]).filter(a => a.icao && a.size !== 'small');

function isoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(value: string) { const d = new Date(`${String(value).slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? new Date() : d; }
function zuluMinutes(value: string) { const m = String(value).match(/(\d{1,2}):(\d{2})/); return m ? (Number(m[1]) * 60 + Number(m[2])) % 1440 : 0; }
function clock(minutes: number) { const m = ((Math.round(minutes) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}z`; }
function durationText(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
function uuid() { return globalThis.crypto?.randomUUID?.() || `rig-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function TripsPage({ candidate, onDispatch, notify }: Props) {
  const readLedger = useCallback(() => normalizeLedger(loadLocal(LEDGER_KEY, emptyLedger())), []);
  const [trips, setTrips] = useState<PlannedTrip[]>(() => {
    const local = loadTrips();
    return local.length ? local : mergeLedgerTrips(readLedger().trips);
  });
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => candidate ? parseDate(candidate.date) : new Date());
  const [selectedDate, setSelectedDate] = useState(() => candidate ? String(candidate.date).slice(0, 10) : isoDate(new Date()));
  const [legs, setLegs] = useState(3);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const stored = loadLocal<Partial<CloudPrefs>>(CLOUD_KEY, {});
  const cloud: CloudPrefs = { gistId: stored.gistId || '', token: stored.rememberSecrets ? stored.token || '' : '', passphrase: stored.rememberSecrets ? stored.passphrase || '' : '', autoSync: stored.autoSync ?? true, rememberSecrets: stored.rememberSecrets ?? false };

  useEffect(() => {
    const refresh = () => setTrips(loadTrips());
    window.addEventListener(TRIPS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(TRIPS_UPDATED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => {
    if (candidate?.date) {
      const d = parseDate(candidate.date);
      setSelectedDate(isoDate(d));
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [candidate?.id]);

  const writeAuditCopies = async (added: PlannedTrip[]) => {
    if (!added.length) return;
    try {
      let ledger = readLedger();
      for (const trip of added) {
        if (ledger.trips.some(entry => String(entry.data.candidateId) === trip.candidateId && String(entry.data.date).slice(0, 10) === trip.date)) continue;
        ledger = (await appendLedgerRecord(ledger, 'trip', tripToRecordData(trip), deviceId)).ledger;
      }
      saveLocal(LEDGER_KEY, ledger);
      window.dispatchEvent(new CustomEvent('aeroslate-ledger-updated'));
    } catch (error) {
      console.warn('Trip audit copy failed. The local itinerary is still saved.', error);
    }
  };

  const saveCandidates = (list: FlightCandidate[], rigId = '') => {
    try {
      const result = addTripsLocal(list.map(f => ({ ...f, date: selectedDate })), selectedDate, rigId);
      setTrips(result.trips);
      if (!result.added.length) { notify('Those legs are already on the itinerary.'); return; }
      notify(`${result.added.length}-leg trip added to ${selectedDate}.`);
      void writeAuditCopies(result.added);
    } catch (error) {
      notify(error instanceof Error ? `Trip could not be saved: ${error.message}` : 'Trip could not be saved.');
    }
  };

  const addTrip = () => candidate ? saveCandidates([candidate]) : notify('Select a parsed flight in Flight Finder first.');
  const generateRig = () => {
    const flights = loadLocal<FlightCandidate[]>('aeroslate.finder.flights', []);
    if (!candidate && !flights.length) { notify('Paste flights in Flight Finder first.'); return; }
    let current = { ...(candidate || flights[Math.floor(Math.random() * flights.length)]), date: selectedDate };
    const result = [current];
    const count = Math.min(5, Math.max(1, legs));
    for (let i = 1; i < count; i += 1) {
      const real = flights.filter(f => f.departure === current.arrival && !result.some(x => x.id === f.id));
      if (real.length) { current = { ...real[Math.floor(Math.random() * real.length)], date: selectedDate }; result.push(current); continue; }
      const options = AIRPORTS.filter(a => a.icao !== current.arrival && a.icao !== current.departure);
      const destination = options[Math.floor(Math.random() * options.length)]?.icao || current.departure;
      const turn = 45 + Math.floor(Math.random() * 46), leg = 55 + Math.floor(Math.random() * 166), std = zuluMinutes(current.sta || current.std) + turn, sta = std + leg;
      current = { ...current, id: `rig-${uuid()}`, departure: current.arrival, arrival: destination, std: clock(std), sta: clock(sta), ete: durationText(leg), rawStd: clock(std), rawSta: clock(sta), date: selectedDate };
      result.push(current);
    }
    saveCandidates(result, uuid());
  };

  const removeTrip = (id: string) => { setTrips(removeTripLocal(id)); notify('Trip removed from this device. Sync Gist to update the cloud copy.'); };
  const sync = async () => {
    if (!cloud.token || cloud.passphrase.length < 12) { notify('Configure GitHub Gist sync in Flight Logs first.'); return; }
    try {
      setBusy(true);
      let ledger = readLedger();
      for (const trip of loadTrips()) {
        if (!ledger.trips.some(entry => String(entry.data.candidateId) === trip.candidateId && String(entry.data.date).slice(0, 10) === trip.date)) ledger = (await appendLedgerRecord(ledger, 'trip', tripToRecordData(trip), deviceId)).ledger;
      }
      const r = await synchronizeLedger({ token: cloud.token, gistId: cloud.gistId, passphrase: cloud.passphrase } as GitHubCloudConfig, ledger);
      saveLocal(LEDGER_KEY, r.ledger);
      setTrips(mergeLedgerTrips(r.ledger.trips));
      saveLocal(CLOUD_KEY, { ...stored, gistId: r.gistId });
      notify('Trip calendar synchronized.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Sync failed.'); }
    finally { setBusy(false); }
  };

  const sortedTrips = trips.slice().sort((a, b) => `${a.date} ${a.std}`.localeCompare(`${b.date} ${b.std}`));
  const year = month.getFullYear(), m = month.getMonth();
  const first = new Date(year, m, 1), days = new Date(year, m + 1, 0).getDate(), start = first.getDay();
  const cells = Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, i) => { const day = i - start + 1; return day > 0 && day <= days ? new Date(year, m, day) : null; });
  const dispatch = (trip: PlannedTrip) => { const f = flightFromTrip(trip), p = buildSimbriefDispatch(f, { pax: trip.pax, cargo: trip.freight, remarks: `AeroSlate scheduled load: ${trip.bags} bags.` }); onDispatch(p.url, f, p.staticId); };

  return <div className="trips-page">
    <section className="card trip-scheduler"><header><div><CalendarDays size={18} /><h3>Trip builder</h3></div><button onClick={() => void sync()} disabled={busy}><CloudUpload size={16} />{busy ? 'Syncing…' : 'Sync Gist'}</button></header><div className="card-body trip-builder-grid"><div><strong>{candidate ? `${candidate.flightNumber} · ${candidate.departure}–${candidate.arrival}` : 'No selected flight'}</strong><span>{candidate ? `${selectedDate} · ${candidate.std}–${candidate.sta}` : 'Select a flight in Flight Finder.'}</span><label className="trip-date-picker"><span>Schedule date</span><input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); const d = parseDate(e.target.value); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} /></label><button className="primary" onClick={addTrip} disabled={!candidate}><Save size={16} /> Add single leg</button></div><div className="rig-builder"><label><span>Rig length</span><select value={legs} onChange={e => setLegs(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} leg{n === 1 ? '' : 's'}</option>)}</select></label><button onClick={generateRig}><Shuffle size={16} /> Generate connected rig</button></div></div></section>
    <section className="card planner-card"><header><div><CalendarDays size={18} /><h3>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3></div><div><button className="icon-button" onClick={() => setMonth(new Date(year, m - 1, 1))}><ChevronDown style={{ transform: 'rotate(90deg)' }} /></button><button className="icon-button" onClick={() => setMonth(new Date(year, m + 1, 1))}><ChevronRight /></button></div></header><div className="card-body planner-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <b key={d}>{d}</b>)}{cells.map((d, i) => { const date = d ? isoDate(d) : ''; return <div role={d ? 'button' : undefined} tabIndex={d ? 0 : -1} className={`planner-day ${!d ? 'blank' : ''} ${date === selectedDate ? 'selected' : ''}`} key={i} onClick={() => d && setSelectedDate(date)} onKeyDown={e => { if (d && (e.key === 'Enter' || e.key === ' ')) setSelectedDate(date); }}>{d && <><span>{d.getDate()}</span>{sortedTrips.filter(t => t.date === date).map(t => <article key={t.id} onClick={e => e.stopPropagation()}><strong>{t.flightNumber}</strong><small>{t.departure}–{t.arrival}</small><button title="Dispatch" onClick={() => dispatch(t)}><Send size={11} /></button></article>)}</>}</div>; })}</div></section>
    <section className="card"><header><div><Plane size={18} /><h3>Itinerary</h3></div><span className="pill neutral">{sortedTrips.length}</span></header><div className="card-body trip-list">{sortedTrips.map(t => <article key={t.id}><div className="trip-date"><strong>{t.date}</strong><span>{t.std}–{t.sta}</span></div><div className="trip-route"><strong>{t.flightNumber} · {t.departure} → {t.arrival}</strong><span>{t.aircraft} · {t.registration}</span></div><div className="trip-load"><strong>{t.pax} pax</strong><span>{t.bags} bags · {t.freight.toLocaleString()} lb freight</span></div><div className="trip-actions"><button className="primary compact" onClick={() => dispatch(t)}><Send size={14} /> Dispatch</button><button className="compact danger-button" onClick={() => removeTrip(t.id)}><Trash2 size={14} /> Remove</button></div></article>)}{!sortedTrips.length && <div className="empty-cell">No trips scheduled. Select a flight, choose a date, and add it above.</div>}</div></section>
  </div>;
}
