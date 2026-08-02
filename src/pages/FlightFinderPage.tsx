import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPinned, Plane, RefreshCw, Search, Shuffle, Upload } from 'lucide-react';
import { airportMap, buildSimbriefDispatch, parseAirportsDat, parseFr24Paste, type Airport, type FlightCandidate } from '../lib/dispatchlink';
import { loadLocal, saveLocal } from '../lib/storage';

interface Props {
  onDispatch: (url: string, flight: FlightCandidate, staticId: string) => void;
  notify: (message: string) => void;
}

function airportLabel(airport: Airport) {
  return `${airport.icao}${airport.iata ? ` / ${airport.iata}` : ''} — ${airport.name}, ${airport.city}`;
}

export function FlightFinderPage({ onDispatch, notify }: Props) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loadingAirports, setLoadingAirports] = useState(true);
  const [country, setCountry] = useState(() => loadLocal('dispatchlink.finder.country', 'United States'));
  const [size, setSize] = useState<'large' | 'medium' | 'small'>(() => loadLocal('dispatchlink.finder.size', 'large'));
  const [airportQuery, setAirportQuery] = useState('');
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(() => loadLocal<Airport | null>('dispatchlink.finder.airport', null));
  const [paste, setPaste] = useState(() => loadLocal('dispatchlink.finder.paste', ''));
  const [flights, setFlights] = useState<FlightCandidate[]>(() => loadLocal('dispatchlink.finder.flights', []));
  const [selectedFlight, setSelectedFlight] = useState<FlightCandidate | null>(() => loadLocal<FlightCandidate | null>('dispatchlink.finder.flight', null));

  useEffect(() => {
    fetch('/data/airports.dat').then(response => response.text()).then(text => setAirports(parseAirportsDat(text))).catch(() => notify('Unable to load airports.dat.')).finally(() => setLoadingAirports(false));
  }, [notify]);

  useEffect(() => { saveLocal('dispatchlink.finder.country', country); saveLocal('dispatchlink.finder.size', size); }, [country, size]);
  useEffect(() => saveLocal('dispatchlink.finder.airport', selectedAirport), [selectedAirport]);
  useEffect(() => { saveLocal('dispatchlink.finder.paste', paste); saveLocal('dispatchlink.finder.flights', flights); }, [paste, flights]);
  useEffect(() => saveLocal('dispatchlink.finder.flight', selectedFlight), [selectedFlight]);

  const countries = useMemo(() => [...new Set(airports.map(airport => airport.country))].sort(), [airports]);
  const filteredAirports = useMemo(() => airports.filter(airport => airport.country === country && airport.size === size && airport.type.toLowerCase().includes('airport')), [airports, country, size]);
  const searchResults = useMemo(() => {
    const q = airportQuery.trim().toLowerCase();
    if (!q) return filteredAirports.slice(0, 30);
    return airports.filter(airport => [airport.icao, airport.iata, airport.name, airport.city, airport.country].some(value => value.toLowerCase().includes(q))).slice(0, 60);
  }, [airportQuery, airports, filteredAirports]);

  const randomAirport = () => {
    if (!filteredAirports.length) { notify('No airports match that country and size.'); return; }
    const airport = filteredAirports[Math.floor(Math.random() * filteredAirports.length)];
    setSelectedAirport(airport); setAirportQuery(airport.icao);
  };

  const parse = () => {
    const rows = parseFr24Paste(paste, airportMap(airports));
    setFlights(rows); setSelectedFlight(rows[0] || null);
    notify(rows.length ? `Parsed ${rows.length} real-world flight${rows.length === 1 ? '' : 's'}.` : 'No FR24 rows were recognized. Copy the full airport or aircraft-history table with FR24 set to UTC.');
  };

  const dispatch = (flight: FlightCandidate) => { const plan = buildSimbriefDispatch(flight); onDispatch(plan.url, flight, plan.staticId); };

  return <div className="finder-layout">
    <section className="card">
      <header><div><MapPinned size={18} /><h3>Airport randomizer</h3></div><span className="pill blue">airports.dat</span></header>
      <div className="card-body">
        <p>Choose a real airport from the bundled OpenFlights-style dataset. No FAA registry download or cache is used.</p>
        <div className="form-grid three">
          <label><span>Country</span><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>Airport size</span><select value={size} onChange={event => setSize(event.target.value as typeof size)}><option value="large">Large</option><option value="medium">Medium</option><option value="small">Small</option></select></label>
          <button className="primary align-end" onClick={randomAirport} disabled={loadingAirports}><Shuffle size={17} /> {loadingAirports ? 'Loading…' : 'Random airport'}</button>
        </div>
        <label className="stacked-input"><span>Search airports</span><div className="input-with-icon"><Search size={16} /><input value={airportQuery} onChange={event => setAirportQuery(event.target.value)} placeholder="ICAO, IATA, city, or airport" /></div></label>
        <div className="airport-results">{searchResults.map(airport => <button key={airport.id} className={selectedAirport?.id === airport.id ? 'active' : ''} onClick={() => setSelectedAirport(airport)}><strong>{airport.icao}</strong><span>{airport.name}</span><small>{airport.city}, {airport.country} · {airport.size}</small></button>)}</div>
        {selectedAirport && <div className="selected-airport"><div><strong>{airportLabel(selectedAirport)}</strong><span>{selectedAirport.latitude.toFixed(4)}, {selectedAirport.longitude.toFixed(4)} · {selectedAirport.elevationFt.toLocaleString()} ft · {selectedAirport.timezoneName || 'Timezone unavailable'}</span></div><button onClick={() => window.open(`https://www.flightradar24.com/data/airports/${(selectedAirport.iata || selectedAirport.icao).toLowerCase()}`, 'dispatchlink-fr24', 'popup=yes,width=1300,height=900')}><ExternalLink size={16} /> Open FR24</button></div>}
      </div>
    </section>

    <section className="card">
      <header><div><Upload size={18} /><h3>Real-world flight parser</h3></div><button className="text-button" onClick={() => { setPaste(''); setFlights([]); setSelectedFlight(null); }}><RefreshCw size={15} /> Clear</button></header>
      <div className="card-body">
        <p>Paste an FR24 airport departures/arrivals table or an aircraft-history table. Times are retained exactly as pasted and normalized to <strong>HH:MMz</strong>; no local-time conversion is applied.</p>
        <textarea className="fr24-paste" value={paste} onChange={event => setPaste(event.target.value)} placeholder="Paste the complete FR24 table here…" />
        <div className="button-row"><button className="primary" onClick={parse}><Search size={17} /> Parse FR24 data</button><button onClick={() => { if (!flights.length) return notify('Parse flights first.'); const row = flights[Math.floor(Math.random() * flights.length)]; setSelectedFlight(row); notify(`Selected ${row.flightNumber}.`); }}><Shuffle size={17} /> Random flight</button></div>
      </div>
    </section>

    <section className="card span-full">
      <header><div><Plane size={18} /><h3>Available flights</h3></div><span className="pill neutral">{flights.length} rows</span></header>
      <div className="card-body table-wrap">
        <table className="data-table flight-table"><thead><tr><th></th><th>Date</th><th>Flight</th><th>Route</th><th>Aircraft</th><th>Registration</th><th>STD</th><th>STA</th><th>ETE</th><th></th></tr></thead><tbody>
          {flights.map(row => <tr key={row.id} className={selectedFlight?.id === row.id ? 'selected' : ''} onClick={() => setSelectedFlight(row)}><td><input type="radio" readOnly checked={selectedFlight?.id === row.id} /></td><td>{row.date}</td><td><strong>{row.flightNumber}</strong></td><td>{row.departure} → {row.arrival}</td><td>{row.aircraft}</td><td>{row.registration}</td><td>{row.std}</td><td>{row.sta}</td><td>{row.ete}</td><td><button className="primary compact" onClick={event => { event.stopPropagation(); dispatch(row); }}>Dispatch</button></td></tr>)}
          {!flights.length && <tr><td colSpan={10} className="empty-cell">Paste and parse FR24 data to create a dispatchable flight list.</td></tr>}
        </tbody></table>
      </div>
      {selectedFlight && <div className="dispatch-bar"><div><span>Selected flight</span><strong>{selectedFlight.flightNumber} · {selectedFlight.departure} → {selectedFlight.arrival} · {selectedFlight.aircraft} {selectedFlight.registration}</strong></div><button className="primary" onClick={() => dispatch(selectedFlight)}><Plane size={17} /> Build in SimBrief</button></div>}
    </section>
  </div>;
}
