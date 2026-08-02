import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPinned, Plane, RefreshCw, Search, Shuffle, Upload } from 'lucide-react';
import { airportMap, buildSimbriefDispatch, parseAirportsDat, parseFr24PasteDetailed, type Airport, type FlightCandidate, type Fr24ParseResult, type Fr24PasteFormat } from '../lib/dispatchlink';
import { loadLocal, saveLocal } from '../lib/storage';

interface Props {
  onDispatch: (url: string, flight: FlightCandidate, staticId: string) => void;
  notify: (message: string) => void;
}

function airportLabel(airport: Airport) {
  return `${airport.icao}${airport.iata ? ` / ${airport.iata}` : ''} — ${airport.name}, ${airport.city}`;
}

const FORMAT_LABELS: Record<Fr24PasteFormat, string> = {
  'airport-table': 'Airport table',
  'airport-compact': 'Airport compact/mobile',
  'aircraft-history-cards': 'Aircraft history cards',
  'aircraft-history-table': 'Aircraft history table'
};

function timeModeLabel(mode?: FlightCandidate['timeMode']) {
  if (mode === 'local-converted') return 'Local → Zulu';
  if (mode === 'local-unresolved') return 'Local, review';
  if (mode === 'utc') return 'Zulu source';
  return 'Timezone unknown';
}

export function FlightFinderPage({ onDispatch, notify }: Props) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loadingAirports, setLoadingAirports] = useState(true);
  const [country, setCountry] = useState(() => loadLocal('aeroslate.finder.country', loadLocal('dispatchlink.finder.country', 'United States')));
  const [size, setSize] = useState<'large' | 'medium' | 'small'>(() => loadLocal('aeroslate.finder.size', loadLocal('dispatchlink.finder.size', 'large')));
  const [airportQuery, setAirportQuery] = useState('');
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(() => loadLocal('aeroslate.finder.airport', loadLocal<Airport | null>('dispatchlink.finder.airport', null)));
  const [paste, setPaste] = useState(() => loadLocal('aeroslate.finder.paste', loadLocal('dispatchlink.finder.paste', '')));
  const [flights, setFlights] = useState<FlightCandidate[]>(() => loadLocal('aeroslate.finder.flights', loadLocal<FlightCandidate[]>('dispatchlink.finder.flights', [])));
  const [selectedFlight, setSelectedFlight] = useState<FlightCandidate | null>(() => loadLocal('aeroslate.finder.flight', loadLocal<FlightCandidate | null>('dispatchlink.finder.flight', null)));
  const [parseInfo, setParseInfo] = useState<Fr24ParseResult | null>(null);

  useEffect(() => {
    fetch('/data/airports.dat').then(response => response.text()).then(text => setAirports(parseAirportsDat(text))).catch(() => notify('Unable to load airports.dat.')).finally(() => setLoadingAirports(false));
  }, [notify]);

  useEffect(() => { saveLocal('aeroslate.finder.country', country); saveLocal('aeroslate.finder.size', size); }, [country, size]);
  useEffect(() => saveLocal('aeroslate.finder.airport', selectedAirport), [selectedAirport]);
  useEffect(() => { saveLocal('aeroslate.finder.paste', paste); saveLocal('aeroslate.finder.flights', flights); }, [paste, flights]);
  useEffect(() => saveLocal('aeroslate.finder.flight', selectedFlight), [selectedFlight]);

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
    const result = parseFr24PasteDetailed(paste, airportMap(airports));
    setParseInfo(result); setFlights(result.flights); setSelectedFlight(result.flights[0] || null);
    const formats = result.formats.map(format => FORMAT_LABELS[format]).join(', ');
    notify(result.flights.length ? `Parsed ${result.flights.length} flight${result.flights.length === 1 ? '' : 's'} from ${formats || 'FR24'}.` : 'No supported FR24 rows were recognized. Paste the complete airport or aircraft-history page.');
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
        {selectedAirport && <div className="selected-airport"><div><strong>{airportLabel(selectedAirport)}</strong><span>{selectedAirport.latitude.toFixed(4)}, {selectedAirport.longitude.toFixed(4)} · {selectedAirport.elevationFt.toLocaleString()} ft · {selectedAirport.timezoneName || 'Timezone unavailable'}</span></div><button onClick={() => window.open(`https://www.flightradar24.com/data/airports/${(selectedAirport.iata || selectedAirport.icao).toLowerCase()}`, 'aeroslate-fr24', 'popup=yes,width=1300,height=900')}><ExternalLink size={16} /> Open FR24</button></div>}
      </div>
    </section>

    <section className="card">
      <header><div><Upload size={18} /><h3>Real-world flight parser</h3></div><button className="text-button" onClick={() => { setPaste(''); setFlights([]); setSelectedFlight(null); setParseInfo(null); }}><RefreshCw size={15} /> Clear</button></header>
      <div className="card-body">
        <p>Paste any supported FR24 airport or aircraft-history layout. AeroSlate automatically recognizes desktop tables, compact/mobile cards, aircraft-history cards, and aircraft-history tables. UTC sources are retained; local sources are converted to <strong>HH:MMz</strong> with the applicable airport timezone from <strong>airports.dat</strong>.</p>
        <textarea className="fr24-paste" value={paste} onChange={event => setPaste(event.target.value)} placeholder="Paste the complete FR24 table here…" />
        <div className="button-row"><button className="primary" onClick={parse}><Search size={17} /> Parse FR24 data</button><button onClick={() => { if (!flights.length) return notify('Parse flights first.'); const row = flights[Math.floor(Math.random() * flights.length)]; setSelectedFlight(row); notify(`Selected ${row.flightNumber}.`); }}><Shuffle size={17} /> Random flight</button></div>
        {parseInfo && <div className="parser-result">
          <div className="parser-format-row"><strong>Detected</strong>{parseInfo.formats.map(format => <span className="pill blue" key={format}>{FORMAT_LABELS[format]}</span>)}{parseInfo.timeModes.map(mode => <span className={mode === 'local-unresolved' || mode === 'unknown' ? 'pill warn' : 'pill good'} key={mode}>{timeModeLabel(mode)}</span>)}</div>
          {parseInfo.warnings.map(warning => <div className="notice warn parser-warning" key={warning}><p>{warning}</p></div>)}
        </div>}
      </div>
    </section>

    <section className="card span-full">
      <header><div><Plane size={18} /><h3>Available flights</h3></div><span className="pill neutral">{flights.length} rows</span></header>
      <div className="card-body table-wrap">
        <table className="data-table flight-table"><thead><tr><th></th><th>Date</th><th>Flight</th><th>Route</th><th>Aircraft</th><th>Registration</th><th>STD</th><th>STA</th><th>ETE</th><th>Source</th><th></th></tr></thead><tbody>
          {flights.map(row => <tr key={row.id} className={selectedFlight?.id === row.id ? 'selected' : ''} onClick={() => setSelectedFlight(row)}><td><input type="radio" readOnly checked={selectedFlight?.id === row.id} /></td><td>{row.date}</td><td><strong>{row.flightNumber}</strong></td><td>{row.departure} → {row.arrival}</td><td>{row.aircraft}</td><td>{row.registration}</td><td title={row.rawStd ? `Pasted: ${row.rawStd}` : undefined}>{row.std}</td><td title={row.rawSta ? `Pasted: ${row.rawSta}` : undefined}>{row.sta}</td><td>{row.ete}</td><td><span className="source-format">{row.sourceFormat ? FORMAT_LABELS[row.sourceFormat] : 'FR24'}</span><small>{timeModeLabel(row.timeMode)}</small></td><td><button className="primary compact" onClick={event => { event.stopPropagation(); dispatch(row); }}>Dispatch</button></td></tr>)}
          {!flights.length && <tr><td colSpan={11} className="empty-cell">Paste and parse FR24 data to create a dispatchable flight list.</td></tr>}
        </tbody></table>
      </div>
      {selectedFlight && <div className="dispatch-bar"><div><span>Selected flight</span><strong>{selectedFlight.flightNumber} · {selectedFlight.departure} → {selectedFlight.arrival} · {selectedFlight.aircraft} {selectedFlight.registration}</strong></div><button className="primary" onClick={() => dispatch(selectedFlight)}><Plane size={17} /> Build in SimBrief</button></div>}
    </section>
  </div>;
}
