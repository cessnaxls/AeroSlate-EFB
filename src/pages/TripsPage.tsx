import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight, CloudUpload, Plane, RefreshCw, Save, Send, Shuffle, Trash2, X } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import { buildSimbriefDispatch, type Airport, type FlightCandidate } from '../lib/dispatchlink';
import { loadLocal, saveLocal } from '../lib/storage';
import { appendLedgerRecord, emptyLedger, getOrCreateDeviceId, normalizeLedger, synchronizeLedger, type AeroSlateLedger, type GitHubCloudConfig } from '../lib/cloudLedger';
import { addTripsLocal, flightFromTrip, loadTrips, mergeLedgerTrips, plannedTripFromFlight, removeTripLocal, saveTrips, formatTripDate, TRIPS_UPDATED_EVENT, tripToRecordData, type PlannedTrip } from '../lib/trips';

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
function addDays(date: string, count: number) { const d = parseDate(date); d.setDate(d.getDate() + count); return isoDate(d); }

function buildRandomRigCandidates(flights: FlightCandidate[], count: number, date: string): FlightCandidate[] {
  if (!flights.length) return [];
  let current = { ...flights[Math.floor(Math.random() * flights.length)], date };
  const result: FlightCandidate[] = [current];
  let workingDate = date;
  for (let i = 1; i < count; i += 1) {
    const previousArrival = zuluMinutes(current.sta || current.std);
    const real = flights.filter(f => f.departure === current.arrival && !result.some(x => x.id === f.id));
    if (real.length) {
      const choices = real.filter(f => zuluMinutes(f.std) >= previousArrival + 25);
      const next = { ...(choices.length ? choices : real)[Math.floor(Math.random() * (choices.length ? choices : real).length)] };
      if (zuluMinutes(next.std) < previousArrival) workingDate = addDays(workingDate, 1);
      current = { ...next, date: workingDate };
      result.push(current);
      continue;
    }
    const options = AIRPORTS.filter(a => a.icao !== current.arrival && a.icao !== current.departure);
    const destination = options[Math.floor(Math.random() * options.length)]?.icao || current.departure;
    const turn = 35 + Math.floor(Math.random() * 56);
    const leg = 55 + Math.floor(Math.random() * 166);
    const stdAbsolute = previousArrival + turn;
    if (stdAbsolute >= 1440) workingDate = addDays(workingDate, 1);
    const staAbsolute = stdAbsolute + leg;
    current = {
      ...current,
      id: `rig-${uuid()}`,
      flightNumber: `${current.flightNumber.replace(/\d+$/, '')}${Math.floor(100 + Math.random() * 8900)}`,
      departure: current.arrival,
      arrival: destination,
      std: clock(stdAbsolute),
      sta: clock(staAbsolute),
      ete: durationText(leg),
      rawStd: clock(stdAbsolute),
      rawSta: clock(staAbsolute),
      date: workingDate
    };
    result.push(current);
    if (staAbsolute >= 1440) workingDate = addDays(workingDate, 1);
  }
  return result;
}

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
  const [rigPreview, setRigPreview] = useState<PlannedTrip[]>([]);
  const [showDayView, setShowDayView] = useState(false);
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
      const result = addTripsLocal(list.map(f => ({ ...f, date: f.date || selectedDate })), selectedDate, rigId);
      setTrips(result.trips);
      if (!result.added.length) { notify('Those legs are already on the itinerary.'); return; }
      notify(`${result.added.length} leg${result.added.length === 1 ? '' : 's'} added to trip`);
      void writeAuditCopies(result.added);
    } catch (error) {
      notify(error instanceof Error ? `Trip could not be saved: ${error.message}` : 'Trip could not be saved.');
    }
  };

  const addTrip = () => candidate ? saveCandidates([{ ...candidate, date: selectedDate }]) : notify('Select a parsed flight in Flight Finder first.');
  const regenerateRig = () => {
    const flights = loadLocal<FlightCandidate[]>('aeroslate.finder.flights', []);
    if (!flights.length) { notify('Paste flights in Flight Finder first.'); return; }
    const candidates = buildRandomRigCandidates(flights, Math.min(5, Math.max(1, legs)), selectedDate);
    const rigId = uuid();
    setRigPreview(candidates.map(f => plannedTripFromFlight(f, f.date || selectedDate, rigId)));
    notify('Random trip rig generated. Review it, then accept or regenerate.');
  };
  const acceptRig = () => {
    if (!rigPreview.length) { notify('Generate a trip rig first.'); return; }
    const current = loadTrips();
    const additions = rigPreview.filter(preview => !current.some(item => item.candidateId === preview.candidateId && item.date === preview.date));
    if (!additions.length) { notify('Every preview leg is already on the itinerary.'); return; }
    const merged = [...current, ...additions];
    saveTrips(merged);
    setTrips(merged);
    setRigPreview([]);
    setMonth(parseDate(additions[0].date));
    setSelectedDate(additions[0].date);
    notify(`${additions.length}-leg rig added to itinerary`);
    void writeAuditCopies(additions);
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

  const unscheduledTrips = trips.filter(t => t.status === 'Unscheduled');
  const scheduledTrips = trips.filter(t => t.status !== 'Unscheduled');
  const scheduleStoredTrip = (id: string, date = selectedDate) => { const next = loadTrips().map(t => t.id === id ? { ...t, date, status: 'Scheduled' as const } : t); saveTrips(next); setTrips(next); notify('Leg scheduled.'); };
  const randomSchedule = (days: number) => {
    const pending = loadTrips().filter(t => t.status === 'Unscheduled');
    if (!pending.length) return notify('No unscheduled trips to place.');
    const base = new Date(); const occupied = new Set(loadTrips().filter(t=>t.status!=='Unscheduled').map(t=>`${t.date}|${t.std}|${t.sta}`));
    const groups = new Map<string, PlannedTrip[]>(); pending.forEach(t => { const key=t.rigId||t.id; (groups.get(key)||groups.set(key,[]).get(key)!).push(t); });
    const updates = new Map<string,string>();
    for (const group of groups.values()) { let placed=false; for(let attempts=0;attempts<120&&!placed;attempts++){ const offset=Math.floor(Math.random()*days); const d=new Date(base); d.setDate(d.getDate()+offset); let date=isoDate(d); let conflict=false; for(const leg of group.sort((a,b)=>a.std.localeCompare(b.std))){ const k=`${date}|${leg.std}|${leg.sta}`; if(occupied.has(k)){conflict=true;break;} if(zuluMinutes(leg.sta)<zuluMinutes(leg.std)){ const nd=parseDate(date); nd.setDate(nd.getDate()+1); date=isoDate(nd); } } if(!conflict){ date=isoDate(d); for(const leg of group.sort((a,b)=>a.std.localeCompare(b.std))){ updates.set(leg.id,date); occupied.add(`${date}|${leg.std}|${leg.sta}`); if(zuluMinutes(leg.sta)<zuluMinutes(leg.std)) date=addDays(date,1); } placed=true; } } }
    const next=loadTrips().map(t=>updates.has(t.id)?{...t,date:updates.get(t.id)!,status:'Scheduled' as const}:t); saveTrips(next);setTrips(next);notify(`Randomly scheduled ${updates.size} leg${updates.size===1?'':'s'} over the next ${days} days.`);
  };
  const sortedTrips = scheduledTrips.slice().sort((a, b) => `${a.date} ${a.std}`.localeCompare(`${b.date} ${b.std}`));
  const selectedDayTrips = sortedTrips.filter(t => t.date === selectedDate);
  const year = month.getFullYear(), m = month.getMonth();
  const first = new Date(year, m, 1), days = new Date(year, m + 1, 0).getDate(), start = first.getDay();
  const cells = Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, i) => { const day = i - start + 1; return day > 0 && day <= days ? new Date(year, m, day) : null; });
  const dispatch = (trip: PlannedTrip) => { saveLocal('aeroslate.lastDispatchLoad', { flightNumber: trip.flightNumber, pax: trip.pax, bags: trip.bags, bagWeight: trip.bagWeight, freight: trip.freight, payload: trip.pax * 190 + trip.bagWeight }); const f = flightFromTrip(trip), p = buildSimbriefDispatch(f, { pax: trip.pax, bags: trip.bags, bagWeight: trip.bagWeight, payload: trip.pax * 190 + trip.bagWeight, freight: trip.freight, remarks: `AeroSlate scheduled load: ${trip.pax} pax; ${trip.bags} bags; payload ${(trip.pax * 190 + trip.bagWeight).toLocaleString()} lb; freight ${trip.freight.toLocaleString()} lb.` }); onDispatch(p.url, f, p.staticId); };

  return <div className="trips-page">
    <section className="card trip-scheduler"><header><div><CalendarDays size={18} /><h3>Trip builder</h3></div><button onClick={() => void sync()} disabled={busy}><CloudUpload size={16} />{busy ? 'Syncing…' : 'Sync Gist'}</button></header><div className="card-body trip-builder-grid"><div><strong>{candidate ? `${candidate.flightNumber} · ${candidate.departure}–${candidate.arrival}` : 'No selected flight'}</strong><span>{candidate ? `${formatTripDate(selectedDate)} · ${candidate.std}–${candidate.sta}` : 'Select a flight in Flight Finder, or generate a random rig.'}</span><label className="trip-date-picker"><span>Schedule date</span><input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); const d = parseDate(e.target.value); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} /></label><button className="primary" onClick={addTrip} disabled={!candidate}><Save size={16} /> Add selected leg</button></div><div className="rig-builder"><label><span>Random rig length</span><select value={legs} onChange={e => setLegs(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} leg{n === 1 ? '' : 's'}</option>)}</select></label><button onClick={regenerateRig}><Shuffle size={16} /> Generate random rig</button></div></div>
      {rigPreview.length > 0 && <div className="rig-preview"><div className="rig-preview-heading"><div><strong>Proposed trip rig</strong><span>Independent random selection · review before adding</span></div><div><button onClick={regenerateRig}><RefreshCw size={15}/> Regenerate</button><button className="primary" onClick={acceptRig}><Check size={15}/> Accept rig</button></div></div><div className="rig-preview-legs">{rigPreview.map((trip, index) => <article key={trip.id}><b>{index + 1}</b><div><strong>{trip.flightNumber} · {trip.departure} → {trip.arrival}</strong><span>{formatTripDate(trip.date)} · {trip.std}–{trip.sta} · {trip.aircraft}</span></div><div><strong>{trip.pax} pax</strong><span>{trip.bags} bags · {trip.freight.toLocaleString()} lb freight</span></div></article>)}</div></div>}
    </section>
    <section className="card unscheduled-trips-card"><header><div><Plane size={18}/><h3>Unscheduled trips</h3></div><span className="pill neutral">{unscheduledTrips.length}</span></header><div className="unscheduled-toolbar"><span>Place pairings without overlaps:</span><button onClick={()=>randomSchedule(7)}>Next week</button><button onClick={()=>randomSchedule(14)}>2 weeks</button><button onClick={()=>randomSchedule(30)}>30 days</button></div><div className="unscheduled-list">{unscheduledTrips.map(t=><article key={t.id}><div><strong>{t.flightNumber} · {t.departure} → {t.arrival}</strong><span>{t.std}–{t.sta} · {t.aircraft} {t.registration}</span></div><label><span>Schedule</span><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/></label><button className="primary compact" onClick={()=>scheduleStoredTrip(t.id)}>Assign day</button><button className="compact danger-button" onClick={()=>removeTrip(t.id)}>Remove</button></article>)}{!unscheduledTrips.length&&<div className="empty-cell">Trips added from Flight Finder will wait here until you schedule them.</div>}</div></section>
    <section className="card planner-card"><header><div><CalendarDays size={18} /><h3>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3></div><div><button className="icon-button" onClick={() => setMonth(new Date(year, m - 1, 1))}><ChevronDown style={{ transform: 'rotate(90deg)' }} /></button><button className="icon-button" onClick={() => setMonth(new Date(year, m + 1, 1))}><ChevronRight /></button></div></header><div className="card-body planner-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <b key={d}>{d}</b>)}{cells.map((d, i) => { const date = d ? isoDate(d) : ''; return <div role={d ? 'button' : undefined} tabIndex={d ? 0 : -1} className={`planner-day ${!d ? 'blank' : ''} ${date === selectedDate ? 'selected' : ''}`} key={i} onClick={() => { if (d) { setSelectedDate(date); setShowDayView(true); } }} onKeyDown={e => { if (d && (e.key === 'Enter' || e.key === ' ')) { setSelectedDate(date); setShowDayView(true); } }}>{d && <><span>{d.getDate()}</span>{sortedTrips.filter(t => t.date === date).map(t => <article key={t.id} onClick={e => e.stopPropagation()}><strong>{t.flightNumber}</strong><small>{t.departure}–{t.arrival}</small><button title="Dispatch" onClick={() => dispatch(t)}><Send size={11} /></button></article>)}</>}</div>; })}</div></section>
    {showDayView && <section className="card day-planner-card"><header><div><CalendarDays size={18}/><h3>{parseDate(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3></div><button className="icon-button" onClick={() => setShowDayView(false)}><X size={18}/></button></header><div className="day-timeline-scroll"><div className="day-timeline">{Array.from({ length: 48 }, (_, index) => <div className="day-tick" key={index}><span>{clock(index * 30).replace('z','')}</span></div>)}<div className="day-events">{selectedDayTrips.map(trip => { const startMinute = zuluMinutes(trip.std), endRaw = zuluMinutes(trip.sta), duration = Math.max(30, endRaw >= startMinute ? endRaw - startMinute : 1440 - startMinute + endRaw); return <button key={trip.id} className="day-event" style={{ top: `${startMinute / 1440 * 100}%`, height: `${Math.max(2.1, duration / 1440 * 100)}%` }} onClick={() => dispatch(trip)}><strong>{trip.flightNumber}</strong><span>{trip.departure} → {trip.arrival}</span><small>{trip.std}–{trip.sta}</small></button>; })}</div></div></div></section>}
    <section className="card"><header><div><Plane size={18} /><h3>Itinerary</h3></div><span className="pill neutral">{sortedTrips.length}</span></header><div className="card-body trip-list">{sortedTrips.map(t => <article key={t.id}><div className="trip-date"><strong>{formatTripDate(t.date)}</strong><span>{t.std}–{t.sta}</span></div><div className="trip-route"><strong>{t.flightNumber} · {t.departure} → {t.arrival}</strong><span>{t.aircraft} · {t.registration}</span></div><div className="trip-load"><strong>{t.pax} pax</strong><span>{t.bags} bags · {t.freight.toLocaleString()} lb freight</span></div><div className="trip-actions"><button className="primary compact" onClick={() => dispatch(t)}><Send size={14} /> Dispatch</button><button className="compact danger-button" onClick={() => removeTrip(t.id)}><Trash2 size={14} /> Remove</button></div></article>)}{!sortedTrips.length && <div className="empty-cell">No trips scheduled. Add a flight or generate a random rig above.</div>}</div></section>
  </div>;
}
