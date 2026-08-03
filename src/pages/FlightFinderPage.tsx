import { useEffect, useMemo, useState } from 'react';
import { Clipboard, ExternalLink, MapPinned, Plane, RefreshCw, Search, Shuffle } from 'lucide-react';
import airportCatalog from '../data/airports.catalog.json';
import { airportMap, buildSimbriefDispatch, parseFr24PasteDetailed, type Airport, type FlightCandidate, type Fr24ParseResult, type Fr24PasteFormat } from '../lib/dispatchlink';
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

const AIRPORTS = airportCatalog as Airport[];

function fr24TailUrl(registration?: string) {
  const reg = String(registration || '').trim().replace(/^REG\s*/i, '').toLowerCase();
  return reg ? `https://www.flightradar24.com/data/aircraft/${encodeURIComponent(reg)}` : '';
}

export function FlightFinderPage({ onDispatch, notify }: Props) {
  const airports = AIRPORTS;
  const [country, setCountry] = useState(() => loadLocal('aeroslate.finder.country', 'United States'));
  const [size, setSize] = useState<'large' | 'medium' | 'small'>(() => loadLocal('aeroslate.finder.size', 'large'));
  const [airportQuery, setAirportQuery] = useState('');
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(() => loadLocal<Airport | null>('aeroslate.finder.airport', null));
  const [flights, setFlights] = useState<FlightCandidate[]>(() => loadLocal<FlightCandidate[]>('aeroslate.finder.flights', []));
  const [selectedFlight, setSelectedFlight] = useState<FlightCandidate | null>(() => loadLocal<FlightCandidate | null>('aeroslate.finder.flight', null));
  const [parseInfo, setParseInfo] = useState<Fr24ParseResult | null>(null);
  const [readingClipboard, setReadingClipboard] = useState(false);

  useEffect(() => { saveLocal('aeroslate.finder.country', country); saveLocal('aeroslate.finder.size', size); }, [country, size]);
  useEffect(() => saveLocal('aeroslate.finder.airport', selectedAirport), [selectedAirport]);
  useEffect(() => saveLocal('aeroslate.finder.flights', flights), [flights]);
  useEffect(() => saveLocal('aeroslate.finder.flight', selectedFlight), [selectedFlight]);

  const countries = useMemo(() => [...new Set(airports.map(airport => airport.country).filter(Boolean))].sort(), [airports]);
  useEffect(() => {
    if (!countries.length) return;
    if (!countries.includes(country)) setCountry(countries.includes('United States') ? 'United States' : countries[0]);
  }, [countries, country]);

  const countryAirports = useMemo(() => airports.filter(airport => airport.country === country && airport.type.toLowerCase().includes('airport')), [airports, country]);
  const filteredAirports = useMemo(() => {
    const exact = countryAirports.filter(airport => airport.size === size);
    return exact.length ? exact : countryAirports;
  }, [countryAirports, size]);
  const searchResults = useMemo(() => {
    const q = airportQuery.trim().toLowerCase();
    if (!q) return filteredAirports.slice(0, 40);
    return airports.filter(airport => [airport.icao, airport.iata, airport.name, airport.city, airport.country].some(value => String(value).toLowerCase().includes(q))).slice(0, 80);
  }, [airportQuery, airports, filteredAirports]);

  const randomAirport = () => {
    if (!filteredAirports.length) { notify('No airports match that country.'); return; }
    const airport = filteredAirports[Math.floor(Math.random() * filteredAirports.length)];
    setSelectedAirport(airport); setAirportQuery(airport.icao);
    notify(`Selected ${airport.icao} · ${airport.name}.`);
  };

  const openRandomTail = () => {
    const withTail = flights.filter(row => fr24TailUrl(row.registration));
    if (!withTail.length) { notify('No registrations are available in the parsed flight list.'); return; }
    const row = withTail[Math.floor(Math.random() * withTail.length)];
    setSelectedFlight(row);
    window.open(fr24TailUrl(row.registration), 'aeroslate-fr24-tail', 'popup=yes,width=1300,height=900');
    notify(`Opened ${row.registration} aircraft history on FR24.`);
  };

  const parseText = (text: string) => {
    const result = parseFr24PasteDetailed(text, airportMap(airports));
    setParseInfo(result); setFlights(result.flights); setSelectedFlight(result.flights[0] || null);
    const formats = result.formats.map(format => FORMAT_LABELS[format]).join(', ');
    notify(result.flights.length
      ? `Parsed ${result.flights.length} flight${result.flights.length === 1 ? '' : 's'} from ${formats || 'FR24'}.`
      : 'No supported FR24 rows were found in the clipboard. Copy the complete airport or aircraft-history page and try again.');
  };

  const pasteAndParse = async () => {
    setReadingClipboard(true);
    try {
      if (!navigator.clipboard?.readText) throw new Error('Clipboard reading is unavailable. Install AeroSlate or use HTTPS, then try again.');
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('The clipboard is empty. Copy the FR24 page first.');
      parseText(text);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to read the clipboard.');
    } finally { setReadingClipboard(false); }
  };

  const dispatch = (flight: FlightCandidate) => { const plan = buildSimbriefDispatch(flight); onDispatch(plan.url, flight, plan.staticId); };

  return <div className="finder-layout finder-streamlined">
    <section className="card airport-picker-card">
      <header><div><MapPinned size={18} /><h3>Choose an airport</h3></div><span className="pill good">{airports.length.toLocaleString()} AIRPORTS</span></header>
      <div className="card-body">
        <div className="form-grid three airport-filter-grid">
          <label><span>Country</span><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>Airport size</span><select value={size} onChange={event => setSize(event.target.value as typeof size)}><option value="large">Large</option><option value="medium">Medium</option><option value="small">Small</option></select></label>
          <button className="primary align-end" onClick={randomAirport}><Shuffle size={17} /> Random airport</button>
        </div>
        <label className="stacked-input"><span>Find airport</span><div className="input-with-icon"><Search size={16} /><input value={airportQuery} onChange={event => setAirportQuery(event.target.value)} placeholder="ICAO, IATA, city, airport, or country" /></div></label>
        <div className="airport-results">{searchResults.map(airport => <button key={airport.id} className={selectedAirport?.id === airport.id ? 'active' : ''} onClick={() => setSelectedAirport(airport)}><strong>{airport.icao}</strong><span>{airport.name}</span><small>{airport.city}, {airport.country} · {airport.size}</small></button>)}</div>
        {selectedAirport && <div className="selected-airport"><div><strong>{airportLabel(selectedAirport)}</strong><span>{selectedAirport.latitude.toFixed(4)}, {selectedAirport.longitude.toFixed(4)} · {selectedAirport.elevationFt.toLocaleString()} ft · {selectedAirport.timezoneName || 'Timezone unavailable'}</span></div><button onClick={() => window.open(`https://www.flightradar24.com/data/airports/${(selectedAirport.iata || selectedAirport.icao).toLowerCase()}`, 'aeroslate-fr24', 'popup=yes,width=1300,height=900')}><ExternalLink size={16} /> Open FR24</button></div>}
      </div>
    </section>

    <section className="card paste-action-card">
      <header><div><Clipboard size={18} /><h3>Paste and parse flights</h3></div>{parseInfo && <span className="pill blue">{flights.length} FOUND</span>}</header>
      <div className="card-body paste-action-body">
        <div className="paste-action-copy"><strong>One-button import</strong><p>Copy a complete FR24 airport departures/arrivals page or aircraft-history page. AeroSlate reads the clipboard, detects the layout, converts times, and builds the flight list automatically.</p></div>
        <button className="primary paste-parse-button" onClick={() => void pasteAndParse()} disabled={readingClipboard}><Clipboard size={20} /> {readingClipboard ? 'Reading clipboard…' : 'Paste & Parse'}</button>
        <div className="button-row compact-actions"><button onClick={() => { if (!flights.length) return notify('Paste and parse flights first.'); const row = flights[Math.floor(Math.random() * flights.length)]; setSelectedFlight(row); notify(`Selected ${row.flightNumber}.`); }}><Shuffle size={17} /> Random flight</button><button onClick={openRandomTail} disabled={!flights.some(row => Boolean(fr24TailUrl(row.registration)))}><Plane size={17} /> Random tail on FR24</button><button className="text-button" onClick={() => { setFlights([]); setSelectedFlight(null); setParseInfo(null); }}><RefreshCw size={15} /> Clear flights</button></div>
        {parseInfo && <div className="parser-result">
          <div className="parser-format-row"><strong>Detected</strong>{parseInfo.formats.map(format => <span className="pill blue" key={format}>{FORMAT_LABELS[format]}</span>)}{parseInfo.timeModes.map(mode => <span className={mode === 'local-unresolved' || mode === 'unknown' ? 'pill warn' : 'pill good'} key={mode}>{timeModeLabel(mode)}</span>)}</div>
          {parseInfo.warnings.map(warning => <div className="notice warn parser-warning" key={warning}><p>{warning}</p></div>)}
        </div>}
      </div>
    </section>

    <section className="card span-full flights-card">
      <header><div><Plane size={18} /><h3>Available flights</h3></div><span className="pill neutral">{flights.length} rows</span></header>
      <div className="card-body table-wrap flight-table-wrap">
        <table className="data-table flight-table responsive-flight-table"><thead><tr><th>Flight</th><th>Route</th><th>EQUIP</th><th>REG</th><th>Schedule</th><th>ETE</th><th></th></tr></thead><tbody>
          {flights.map(row => <tr key={row.id} className={selectedFlight?.id === row.id ? 'selected' : ''} onClick={() => setSelectedFlight(row)}>
            <td className="flight-cell"><strong>{row.flightNumber}</strong><small>{row.date}</small></td>
            <td className="route-cell"><strong>{row.departure}</strong><span>→</span><strong>{row.arrival}</strong></td>
            <td className="equip-cell">{row.aircraft || '—'}</td>
            <td className="reg-cell">{row.registration || '—'}</td>
            <td className="schedule-cell"><span title={row.rawStd ? `Pasted: ${row.rawStd}` : undefined}><small>STD</small>{row.std}</span><span title={row.rawSta ? `Pasted: ${row.rawSta}` : undefined}><small>STA</small>{row.sta}</span></td>
            <td className="ete-cell">{row.ete}</td>
            <td className="dispatch-cell"><div className="flight-row-actions"><button className="primary compact" onClick={event => { event.stopPropagation(); dispatch(row); }}>Build</button><button className="compact tail-button" disabled={!fr24TailUrl(row.registration)} title={row.registration ? `Open ${row.registration} on Flightradar24` : 'No registration available'} onClick={event => { event.stopPropagation(); const url = fr24TailUrl(row.registration); if (url) window.open(url, 'aeroslate-fr24-tail', 'popup=yes,width=1300,height=900'); }}><ExternalLink size={14} /> Tail</button></div></td>
          </tr>)}
          {!flights.length && <tr><td colSpan={7} className="empty-cell">Copy a supported FR24 page, then press <strong>Paste & Parse</strong>.</td></tr>}
        </tbody></table>
      </div>
    </section>
  </div>;
}
