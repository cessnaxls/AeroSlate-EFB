import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BookOpenCheck, Calculator, Check, ChevronRight, ClipboardCheck, CloudSun,
  FileText, Fuel, Gauge, Import, LayoutDashboard, Link2, Map, MapPinned, Menu, NotebookPen,
  Plane, RefreshCw, Route, Search, Settings, Timer, Upload, Wifi, WifiOff, X
} from 'lucide-react';
import { ChartWorkspace, type ChartSource } from './components/ChartWorkspace';
import { demoOFP } from './lib/demoOFP';
import {
  asArray, dig, duration, getFlightMaps, getNavlog, getNotams, getOFPDocument,
  getWeather, numberText, summary, weight, zuluFromEpoch, type AnyRecord
} from './lib/ofp';
import { loadLocal, saveLocal } from './lib/storage';
import type { FlightCandidate } from './lib/dispatchlink';
import { FlightFinderPage } from './pages/FlightFinderPage';
import { SimBriefDispatchPage } from './pages/SimBriefDispatchPage';
import { ToldPage } from './pages/ToldPage';
import { SimPage } from './pages/SimPage';
import { OOOIPage } from './pages/OOOIPage';
import { RecordsPage } from './pages/RecordsPage';

type Page = 'dashboard' | 'finder' | 'simbrief' | 'charts' | 'ofp' | 'navlog' | 'weather' | 'fuel' | 'told' | 'sim' | 'times' | 'records' | 'checklists' | 'scratchpad' | 'settings';
interface RuntimeStatus {
  simLinked: boolean;
  chartsApproved: boolean;
  navigraphConfigured: boolean;
  navigraphSignedIn: boolean;
  mode: 'standalone' | 'sim-linked';
  navigraphUsername?: string;
}
interface NavigraphChart {
  id: string;
  name: string;
  category: string;
  type_code: string;
  index_number: string;
  image_day_url: string;
  image_night_url: string;
  revision_date: string;
  is_georeferenced: boolean;
  procedures?: string[];
  runways?: string[];
}

const NAV_ITEMS: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Flight deck', icon: LayoutDashboard },
  { id: 'finder', label: 'Real-world flight finder', icon: Search },
  { id: 'simbrief', label: 'SimBrief dispatch', icon: Plane },
  { id: 'charts', label: 'Charts & documents', icon: Map },
  { id: 'ofp', label: 'OFP', icon: FileText },
  { id: 'navlog', label: 'Navlog', icon: Route },
  { id: 'weather', label: 'Weather & NOTAMs', icon: CloudSun },
  { id: 'fuel', label: 'Fuel monitor', icon: Fuel },
  { id: 'told', label: 'TOLD worksheet', icon: Calculator },
  { id: 'sim', label: 'Simulator data', icon: Activity },
  { id: 'times', label: 'OOOI & schedule', icon: Timer },
  { id: 'records', label: 'Logbook & duty', icon: BookOpenCheck },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { id: 'scratchpad', label: 'Scratchpad', icon: NotebookPen },
  { id: 'settings', label: 'Connections', icon: Settings }
];

function Card({ title, icon: Icon, action, children, className = '' }: { title: string; icon?: typeof Plane; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>
    <header><div>{Icon && <Icon size={18} />}<h3>{title}</h3></div>{action}</header>
    <div className="card-body">{children}</div>
  </section>;
}

function Metric({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: 'good' | 'warn' | 'bad' }) {
  return <div className={`metric ${alert || ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'blue' }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function formatWeight(value: number, units: string) {
  return value ? `${value.toLocaleString()} ${units}` : '—';
}

function hhmmNow() { return new Date().toISOString().slice(11, 16); }
function minutesBetween(a: string, b: string) {
  if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b)) return null;
  const [ah, am] = a.split(':').map(Number); const [bh, bm] = b.split(':').map(Number);
  let diff = bh * 60 + bm - (ah * 60 + am);
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ofp, setOfp] = useState<AnyRecord | null>(() => loadLocal<AnyRecord | null>('dispatchlink.lastOFP', null));
  const [simbriefKey, setSimbriefKey] = useState(() => loadLocal('dispatchlink.simbriefKey', ''));
  const [simbriefMode, setSimbriefMode] = useState<'username' | 'userid'>(() => loadLocal('dispatchlink.simbriefMode', 'username'));
  const [loadingOFP, setLoadingOFP] = useState(false);
  const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<RuntimeStatus>({ simLinked: false, chartsApproved: false, navigraphConfigured: false, navigraphSignedIn: false, mode: 'standalone' });
  const [clock, setClock] = useState(new Date());
  const [chartSource, setChartSource] = useState<ChartSource | null>(null);
  const [dispatchUrl, setDispatchUrl] = useState(() => loadLocal('dispatchlink.dispatch.url', ''));
  const [dispatchFlight, setDispatchFlight] = useState<FlightCandidate | null>(() => loadLocal<FlightCandidate | null>('dispatchlink.dispatch.flight', null));

  const flight = useMemo(() => summary(ofp), [ofp]);

  const refreshRuntime = useCallback(async () => {
    try {
      const response = await fetch('/api/runtime', { cache: 'no-store' });
      if (response.ok) setRuntime(await response.json());
    } catch { /* connection status is displayed */ }
  }, []);

  useEffect(() => {
    void refreshRuntime();
    const runtimeTimer = window.setInterval(() => void refreshRuntime(), 5000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    return () => { clearInterval(runtimeTimer); clearInterval(clockTimer); };
  }, [refreshRuntime]);

  const importOFP = async () => {
    if (!simbriefKey.trim()) { setMessage('Enter your SimBrief username or Pilot ID.'); return; }
    setLoadingOFP(true); setMessage('');
    try {
      const query = new URLSearchParams({ [simbriefMode]: simbriefKey.trim() });
      const response = await fetch(`/api/simbrief?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to import OFP.');
      setOfp(data);
      saveLocal('dispatchlink.lastOFP', data);
      saveLocal('dispatchlink.simbriefKey', simbriefKey.trim());
      saveLocal('dispatchlink.simbriefMode', simbriefMode);
      setMessage(`Loaded ${dig(data, 'origin.icao_code') || 'flight'}–${dig(data, 'destination.icao_code') || ''}.`);
      setPage('dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import OFP.');
    } finally { setLoadingOFP(false); }
  };

  const loadDemo = () => {
    setOfp(demoOFP); saveLocal('dispatchlink.lastOFP', demoOFP); setMessage('Demo Hawker OFP loaded.'); setPage('dashboard');
  };

  const openDispatch = (url: string, selected: FlightCandidate) => {
    setDispatchUrl(url); setDispatchFlight(selected);
    saveLocal('dispatchlink.dispatch.url', url); saveLocal('dispatchlink.dispatch.flight', selected);
    setPage('simbrief'); setMessage(`Prepared ${selected.flightNumber} in SimBrief.`);
  };

  const openOFPChart = () => {
    const url = getOFPDocument(ofp);
    if (!url) { setMessage('This SimBrief response did not include an OFP PDF link.'); return; }
    setChartSource({ id: `simbrief-ofp-${flight.release}`, title: `${flight.origin}-${flight.destination} OFP`, url: `/api/document?url=${encodeURIComponent(url)}`, kind: 'pdf' });
    setPage('charts');
  };

  return <div className="app-shell">
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><Plane size={22} /></div><div><strong>DispatchLink</strong><span>EFB / Flight deck</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div>
      <nav>{NAV_ITEMS.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setMenuOpen(false); }}><item.icon size={19} /><span>{item.label}</span>{page === item.id && <ChevronRight size={16} />}</button>)}</nav>
      <div className="sidebar-status">
        <div><span className={`status-dot ${runtime.simLinked ? 'online' : ''}`} />{runtime.simLinked ? 'Simulator linked' : 'Standalone mode'}</div>
        <div><span className={`status-dot ${runtime.navigraphSignedIn ? 'online' : ''}`} />{runtime.navigraphSignedIn ? 'Navigraph connected' : 'Navigraph offline'}</div>
      </div>
    </aside>

    <main>
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button>
        <div className="flight-ident">
          <span>{flight.airline}{flight.flightNumber || '—'}</span>
          <strong>{flight.origin} <Plane size={17} /> {flight.destination}</strong>
          <small>{flight.aircraft} · {flight.registration}</small>
        </div>
        <div className="topbar-actions">
          <div className="zulu-clock"><span>ZULU</span><strong>{clock.toISOString().slice(11, 19)}</strong></div>
          <button className="primary" onClick={() => setPage('settings')}><Import size={17} /> Import OFP</button>
        </div>
      </header>
      {message && <div className="toast" onClick={() => setMessage('')}>{message}<X size={15} /></div>}
      <div className="page-content">
        {page === 'dashboard' && <Dashboard ofp={ofp} flight={flight} setPage={setPage} openOFP={openOFPChart} />}
        {page === 'finder' && <FlightFinderPage onDispatch={openDispatch} notify={setMessage} />}
        {page === 'simbrief' && <SimBriefDispatchPage url={dispatchUrl} flight={dispatchFlight} />}
        {page === 'charts' && <ChartsPage ofp={ofp} flight={flight} runtime={runtime} source={chartSource} setSource={setChartSource} refreshRuntime={refreshRuntime} />}
        {page === 'ofp' && <OFPPage ofp={ofp} flight={flight} openOFP={openOFPChart} />}
        {page === 'navlog' && <NavlogPage ofp={ofp} flight={flight} />}
        {page === 'weather' && <WeatherPage ofp={ofp} flight={flight} />}
        {page === 'fuel' && <FuelPage ofp={ofp} flight={flight} />}
        {page === 'told' && <ToldPage />}
        {page === 'sim' && <SimPage />}
        {page === 'times' && <OOOIPage release={flight.release} origin={flight.origin} destination={flight.destination} schedOut={flight.schedOut} schedIn={flight.schedIn} />}
        {page === 'records' && <RecordsPage flight={flight} />}
        {page === 'checklists' && <ChecklistPage flight={flight} />}
        {page === 'scratchpad' && <ScratchpadPage flight={flight} />}
        {page === 'settings' && <SettingsPage simbriefKey={simbriefKey} setSimbriefKey={setSimbriefKey} mode={simbriefMode} setMode={setSimbriefMode} loading={loadingOFP} importOFP={importOFP} loadDemo={loadDemo} runtime={runtime} refreshRuntime={refreshRuntime} />}
      </div>
    </main>
  </div>;
}

function Dashboard({ ofp, flight, setPage, openOFP }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary>; setPage: (p: Page) => void; openOFP: () => void }) {
  const units = flight.units;
  const tow = weight(ofp, 'weights.est_tow'); const mtow = weight(ofp, 'weights.max_tow');
  const ldw = weight(ofp, 'weights.est_ldw'); const mldw = weight(ofp, 'weights.max_ldw');
  const ramp = weight(ofp, 'fuel.plan_ramp'); const landing = weight(ofp, 'fuel.plan_landing');
  const originWx = getWeather(ofp, 'origin').metar; const destWx = getWeather(ofp, 'destination').metar;
  const overweight = mtow > 0 && tow > mtow;
  return <>
    {!ofp && <div className="hero-empty"><Plane size={54} /><div><h1>Your entire simulated flight in one place</h1><p>Import a SimBrief OFP to populate the route, fuel, weather, navlog, schedule, charts, checklists, and briefing tools.</p><button className="primary" onClick={() => setPage('settings')}><Import /> Connect SimBrief</button></div></div>}
    <div className="metric-strip">
      <Metric label="Scheduled out" value={flight.schedOut} sub="SimBrief schedule" />
      <Metric label="Block" value={flight.blockTime} sub={`${flight.distance} planned`} />
      <Metric label="Cruise" value={flight.cruiseAltitude} sub={`CI ${flight.costIndex}`} />
      <Metric label="Ramp fuel" value={formatWeight(ramp, units)} sub={`Landing ${formatWeight(landing, units)}`} />
      <Metric label="Takeoff weight" value={formatWeight(tow, units)} sub={mtow ? `Limit ${formatWeight(mtow, units)}` : undefined} alert={overweight ? 'bad' : tow ? 'good' : undefined} />
    </div>
    <div className="dashboard-grid">
      <Card title="Flight briefing" icon={Plane} className="span-2">
        <div className="route-display"><div><span>{flight.origin}</span><small>{flight.originName}</small></div><div className="route-line"><Plane /><span>{flight.distance}</span></div><div><span>{flight.destination}</span><small>{flight.destinationName}</small></div></div>
        <div className="route-string">{flight.route}</div>
        <div className="button-row"><button className="primary" onClick={openOFP}><FileText size={17} /> Open OFP</button><button onClick={() => setPage('charts')}><Map size={17} /> Charts</button><button onClick={() => setPage('navlog')}><Route size={17} /> Navlog</button></div>
      </Card>
      <Card title="Dispatch status" icon={Activity}>
        <div className="status-list">
          <div><span>Release</span><strong>{flight.release}</strong></div>
          <div><span>Alternate</span><strong>{flight.alternate}</strong></div>
          <div><span>TOW</span><Pill tone={overweight ? 'bad' : tow ? 'good' : 'neutral'}>{overweight ? 'OVER LIMIT' : tow ? 'WITHIN LIMIT' : 'NO DATA'}</Pill></div>
          <div><span>LDW margin</span><strong>{mldw && ldw ? formatWeight(mldw - ldw, units) : '—'}</strong></div>
          <div><span>ETOPS</span><strong>{String(dig(ofp, 'general.is_etops') || '0') === '1' ? 'YES' : 'NO'}</strong></div>
        </div>
      </Card>
      <Card title="Weather snapshot" icon={CloudSun} className="span-2">
        <div className="wx-snapshot"><div><Pill tone="blue">{flight.origin}</Pill><p>{originWx}</p></div><div><Pill tone="blue">{flight.destination}</Pill><p>{destWx}</p></div></div>
        <button className="text-button" onClick={() => setPage('weather')}>Full weather and NOTAM briefing <ChevronRight size={16} /></button>
      </Card>
      <Card title="Aircraft & load" icon={Gauge}>
        <div className="status-list">
          <div><span>Aircraft</span><strong>{dig(ofp, 'aircraft.name') || flight.aircraft}</strong></div>
          <div><span>Registration</span><strong>{flight.registration}</strong></div>
          <div><span>Passengers</span><strong>{numberText(dig(ofp, 'weights.pax_count', 'general.passengers'))}</strong></div>
          <div><span>Payload</span><strong>{formatWeight(weight(ofp, 'weights.payload'), units)}</strong></div>
          <div><span>ZFW</span><strong>{formatWeight(weight(ofp, 'weights.est_zfw'), units)}</strong></div>
        </div>
      </Card>
      <Card title="Quick cockpit" icon={BookOpenCheck} className="span-3">
        <div className="quick-grid">
          {[['Flight finder', Search, 'finder'], ['Charts', Map, 'charts'], ['TOLD', Calculator, 'told'], ['OOOI times', Timer, 'times'], ['Logbook', BookOpenCheck, 'records'], ['Connections', Link2, 'settings']].map(([label, Icon, id]) => <button key={String(id)} onClick={() => setPage(id as Page)}><Icon size={23} /><span>{String(label)}</span></button>)}
        </div>
      </Card>
    </div>
  </>;
}

function ChartsPage({ ofp, flight, runtime, source, setSource, refreshRuntime }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary>; runtime: RuntimeStatus; source: ChartSource | null; setSource: (s: ChartSource | null) => void; refreshRuntime: () => Promise<void> }) {
  const [airport, setAirport] = useState(flight.origin !== '----' ? flight.origin : 'KIND');
  const [category, setCategory] = useState('ALL');
  const [query, setQuery] = useState('');
  const [charts, setCharts] = useState<NavigraphChart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (flight.origin !== '----') setAirport(flight.origin); }, [flight.origin]);

  const loadCharts = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/navigraph/charts/${encodeURIComponent(airport)}?version=STD&rules=IFR`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to retrieve charts.');
      setCharts(asArray<NavigraphChart>(data.charts));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to retrieve charts.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (runtime.navigraphSignedIn && runtime.simLinked && runtime.chartsApproved) void loadCharts(); }, [airport, runtime.navigraphSignedIn, runtime.simLinked, runtime.chartsApproved]);

  const filtered = charts.filter(chart => (category === 'ALL' || chart.category === category) && `${chart.index_number} ${chart.name} ${chart.type_code}`.toLowerCase().includes(query.toLowerCase()));
  const upload = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSource({ id: `local-${file.name}-${file.lastModified}`, title: file.name, url, kind: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image' });
  };
  const selectChart = (chart: NavigraphChart) => setSource({ id: `navigraph-${chart.id}-${chart.revision_date}`, title: `${airport} ${chart.index_number} ${chart.name}`, url: `/api/navigraph/chart-image?url=${encodeURIComponent(chart.image_day_url)}`, kind: 'image', navigraph: true });
  const ofpPdf = getOFPDocument(ofp);
  const maps = getFlightMaps(ofp);

  return <div className="charts-layout">
    <aside className="chart-catalog">
      <div className="catalog-header"><div><h2>Chart binder</h2><p>Flight-linked terminal charts and documents</p></div><label className="icon-upload"><Upload size={18} /><input type="file" accept="image/*,.pdf,application/pdf" onChange={e => upload(e.target.files?.[0])} /></label></div>
      <div className="airport-switcher">
        {[flight.origin, flight.destination, flight.alternate].filter(code => code && code !== '----').map(code => <button key={code} className={airport === code ? 'active' : ''} onClick={() => setAirport(code)}>{code}</button>)}
        <input value={airport} maxLength={4} onChange={e => setAirport(e.target.value.toUpperCase())} aria-label="Airport ICAO" />
      </div>
      <div className="connection-panel">
        <div><span className={`status-dot ${runtime.simLinked ? 'online' : ''}`} /><strong>{runtime.simLinked ? 'Simulator link active' : 'Simulator link required'}</strong></div>
        <div><span className={`status-dot ${runtime.navigraphSignedIn ? 'online' : ''}`} /><strong>{runtime.navigraphSignedIn ? 'Navigraph signed in' : 'Navigraph not signed in'}</strong></div>
        {!runtime.chartsApproved && <p>The third-party Charts API remains disabled until Navigraph approves this virtual-environment implementation.</p>}
        {runtime.chartsApproved && runtime.simLinked && !runtime.navigraphSignedIn && runtime.navigraphConfigured && <a className="primary button-link" href="/api/navigraph/login" target="_blank" rel="noreferrer">Sign in to approved Charts API</a>}
        <button onClick={() => window.open('https://charts.navigraph.com/', 'dispatchlink-navigraph', 'popup=yes,width=1500,height=1000')}><Map size={15} /> Open standalone Navigraph Charts</button>
        <button className="text-button" onClick={() => void refreshRuntime()}><RefreshCw size={15} /> Refresh connection</button>
      </div>
      <div className="document-list">
        <h4>SimBrief documents</h4>
        {ofpPdf && <button onClick={() => setSource({ id: `ofp-${flight.release}`, title: `${flight.origin}-${flight.destination} OFP`, url: `/api/document?url=${encodeURIComponent(ofpPdf)}`, kind: 'pdf' })}><FileText size={17} /><span>Operational flight plan</span></button>}
        {maps.map(map => <button key={map.url} onClick={() => setSource({ id: `map-${map.url}`, title: map.title, url: `/api/document?url=${encodeURIComponent(map.url)}`, kind: map.url.toLowerCase().includes('.pdf') ? 'pdf' : 'image' })}><MapPinned size={17} /><span>{map.title}</span></button>)}
        {!ofpPdf && !maps.length && <p className="muted">Import an OFP to attach SimBrief documents.</p>}
      </div>
      <div className="chart-filter">
        <div className="search-box"><Search size={16} /><input placeholder="Search charts" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="category-tabs">{['ALL', 'APT', 'DEP', 'ARR', 'APP', 'REF'].map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <div className="chart-list">
        {loading && <p className="muted">Loading {airport} charts…</p>}
        {error && <p className="error-text">{error}</p>}
        {filtered.map(chart => <button key={chart.id} onClick={() => selectChart(chart)} className={source?.id.includes(chart.id) ? 'active' : ''}><span className="chart-index">{chart.index_number}</span><span><strong>{chart.name}</strong><small>{chart.category} · {chart.type_code}{chart.is_georeferenced ? ' · GEO' : ''}</small></span></button>)}
        {!loading && !error && !filtered.length && <p className="muted">No Navigraph chart list is available in the current mode. Local files and SimBrief documents still work.</p>}
      </div>
    </aside>
    <ChartWorkspace source={source} watermark={runtime.navigraphUsername ? `This chart is linked to Navigraph account ${runtime.navigraphUsername}` : undefined} />
  </div>;
}

function OFPPage({ ofp, flight, openOFP }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary>; openOFP: () => void }) {
  const atc = String(dig(ofp, 'text.atc', 'atc.flight_plan') || 'No ICAO flight plan available.');
  const remarks = String(dig(ofp, 'general.dx_rmk', 'params.manualrmk') || 'No dispatcher remarks.');
  return <div className="content-grid two">
    <Card title="Operational flight plan" icon={FileText} className="span-2">
      <div className="ofp-header"><div><span>{flight.airline}{flight.flightNumber}</span><strong>{flight.origin} → {flight.destination}</strong><small>{flight.aircraft} / {flight.registration}</small></div><button className="primary" onClick={openOFP}><FileText size={17} /> Open full PDF</button></div>
    </Card>
    <Card title="Dispatch parameters" icon={Gauge}>
      <div className="status-list">
        <div><span>Release</span><strong>{flight.release}</strong></div><div><span>Callsign</span><strong>{flight.callsign || '—'}</strong></div>
        <div><span>Cruise</span><strong>{flight.cruiseAltitude}</strong></div><div><span>Cost index</span><strong>{flight.costIndex}</strong></div>
        <div><span>Block</span><strong>{flight.blockTime}</strong></div><div><span>ETE</span><strong>{flight.ete}</strong></div>
      </div>
    </Card>
    <Card title="Route" icon={Route}>
      <div className="monospace block-text">{flight.route}</div>
    </Card>
    <Card title="ICAO flight plan" icon={Plane} className="span-2">
      <pre className="flightplan-text">{atc}</pre>
      <button onClick={() => navigator.clipboard.writeText(atc)}>Copy ICAO FPL</button>
    </Card>
    <Card title="Dispatcher remarks" icon={NotebookPen} className="span-2"><div className="block-text">{remarks}</div></Card>
  </div>;
}

function NavlogPage({ ofp, flight }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary> }) {
  const fixes = getNavlog(ofp);
  return <Card title={`${flight.origin}–${flight.destination} navlog`} icon={Route}>
    <div className="table-scroll"><table className="navlog-table"><thead><tr><th>#</th><th>Fix</th><th>Via</th><th>Altitude</th><th>Wind</th><th>OAT</th><th>Leg</th><th>Fuel leg</th><th>Fuel remaining</th></tr></thead><tbody>
      {fixes.map((fix, index) => <tr key={`${fix.ident}-${index}`}><td>{index + 1}</td><td><strong>{fix.ident || '—'}</strong><small>{fix.name}</small></td><td>{fix.via_airway || 'DCT'}</td><td>{numberText(fix.altitude_feet, ' ft')}</td><td>{fix.wind_dir ? `${String(fix.wind_dir).padStart(3, '0')}/${fix.wind_spd}` : '—'}</td><td>{numberText(fix.oat, '°')}</td><td>{duration(fix.time_leg)}</td><td>{numberText(fix.fuel_leg)}</td><td><strong>{numberText(fix.fuel_total)}</strong></td></tr>)}
      {!fixes.length && <tr><td colSpan={9} className="empty-cell">No detailed navlog was included. Generate the SimBrief OFP with “Detailed Navlog” enabled.</td></tr>}
    </tbody></table></div>
  </Card>;
}

function WeatherPage({ ofp, flight }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary> }) {
  const stations: { key: 'origin' | 'destination' | 'alternate'; code: string }[] = [
    { key: 'origin', code: flight.origin }, { key: 'destination', code: flight.destination }, { key: 'alternate', code: flight.alternate }
  ];
  return <div className="weather-grid">{stations.map(station => {
    const wx = getWeather(ofp, station.key); const notams = getNotams(ofp, station.key);
    return <Card key={station.key} title={`${station.code} ${station.key}`} icon={CloudSun}>
      <div className="weather-block"><span>METAR</span><p>{wx.metar}</p></div><div className="weather-block"><span>TAF</span><p>{wx.taf}</p></div>
      <div className="notam-list"><h4>NOTAMs</h4>{notams.map((item, index) => <div key={index}>{String(item.notam || item.text || item)}</div>)}{!notams.length && <p className="muted">No NOTAMs included.</p>}</div>
    </Card>;
  })}</div>;
}

function FuelPage({ ofp, flight }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary> }) {
  const key = `dispatchlink.fuel.${flight.release}.${flight.origin}${flight.destination}`;
  const [actual, setActual] = useState(() => loadLocal(key, { ramp: '', takeoff: '', current: '', elapsed: '0' }));
  useEffect(() => saveLocal(key, actual), [key, actual]);
  const components = [
    ['Taxi', weight(ofp, 'fuel.taxi')], ['Trip', weight(ofp, 'fuel.enroute_burn')], ['Contingency', weight(ofp, 'fuel.contingency')],
    ['Alternate', weight(ofp, 'fuel.alternate_burn')], ['Final reserve', weight(ofp, 'fuel.reserve')], ['ETOPS', weight(ofp, 'fuel.etops')], ['Extra', weight(ofp, 'fuel.extra')]
  ];
  const plannedRamp = weight(ofp, 'fuel.plan_ramp'); const plannedLanding = weight(ofp, 'fuel.plan_landing'); const flow = weight(ofp, 'fuel.avg_fuel_flow');
  const actualStart = Number(actual.takeoff || actual.ramp || 0); const elapsed = Number(actual.elapsed || 0); const current = Number(actual.current || 0);
  const expected = actualStart && flow ? actualStart - flow * elapsed / 60 : 0;
  const variance = current && expected ? current - expected : 0;
  return <div className="content-grid two">
    <Card title="Planned fuel" icon={Fuel}>
      <div className="fuel-stack">{components.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{formatWeight(Number(value), flight.units)}</strong></div>)}</div>
      <div className="fuel-total"><span>Ramp</span><strong>{formatWeight(plannedRamp, flight.units)}</strong></div>
    </Card>
    <Card title="Fuel progress monitor" icon={Activity}>
      <div className="form-grid">
        {([['ramp', 'Actual ramp fuel'], ['takeoff', 'Actual takeoff fuel'], ['current', 'Fuel remaining'], ['elapsed', 'Elapsed flight minutes']] as const).map(([field, label]) => <label key={field}><span>{label}</span><input inputMode="decimal" value={actual[field]} onChange={e => setActual({ ...actual, [field]: e.target.value })} /></label>)}
      </div>
      <div className="metric-strip mini"><Metric label="Expected now" value={formatWeight(expected, flight.units)} /><Metric label="Variance" value={formatWeight(variance, flight.units)} alert={variance < -300 ? 'bad' : variance < 0 ? 'warn' : variance ? 'good' : undefined} /><Metric label="Planned landing" value={formatWeight(plannedLanding, flight.units)} /></div>
    </Card>
    <Card title="Fuel limits and flow" icon={Gauge} className="span-2">
      <div className="metric-strip mini"><Metric label="Average flow" value={formatWeight(flow, `${flight.units}/HR`)} /><Metric label="Min takeoff" value={formatWeight(weight(ofp, 'fuel.min_takeoff'), flight.units)} /><Metric label="Planned takeoff" value={formatWeight(weight(ofp, 'fuel.plan_takeoff'), flight.units)} /><Metric label="Max tanks" value={formatWeight(weight(ofp, 'fuel.max_tanks'), flight.units)} /></div>
      <p className="disclaimer">Planning aid for flight simulation only. Values are derived from the loaded SimBrief OFP and manual entries.</p>
    </Card>
  </div>;
}

function TimesPage({ ofp, flight }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary> }) {
  const key = `dispatchlink.times.${flight.release}.${flight.origin}${flight.destination}`;
  const [times, setTimes] = useState(() => loadLocal(key, { out: '', off: '', on: '', in: '' }));
  useEffect(() => saveLocal(key, times), [key, times]);
  const schedOut = zuluFromEpoch(dig(ofp, 'times.sched_out')).replace('Z', '');
  const schedIn = zuluFromEpoch(dig(ofp, 'times.sched_in')).replace('Z', '');
  const outDelay = minutesBetween(schedOut, times.out); const inDelay = minutesBetween(schedIn, times.in);
  const block = times.out && times.in ? minutesBetween(times.out, times.in) : null;
  const flightTime = times.off && times.on ? minutesBetween(times.off, times.on) : null;
  return <div className="content-grid two">
    <Card title="Schedule" icon={Timer}>
      <div className="metric-strip mini"><Metric label="STD" value={flight.schedOut} /><Metric label="STA" value={flight.schedIn} /><Metric label="Planned block" value={flight.blockTime} /></div>
      <div className="delay-display"><span>Departure</span><Pill tone={outDelay === null ? 'neutral' : outDelay <= 0 ? 'good' : outDelay <= 15 ? 'warn' : 'bad'}>{outDelay === null ? 'PENDING' : `${outDelay > 0 ? '+' : ''}${outDelay} MIN`}</Pill><span>Arrival</span><Pill tone={inDelay === null ? 'neutral' : inDelay <= 0 ? 'good' : inDelay <= 15 ? 'warn' : 'bad'}>{inDelay === null ? 'PENDING' : `${inDelay > 0 ? '+' : ''}${inDelay} MIN`}</Pill></div>
    </Card>
    <Card title="OOOI times" icon={Plane}>
      <div className="oooi-grid">{(['out', 'off', 'on', 'in'] as const).map(field => <label key={field}><span>{field.toUpperCase()}</span><input value={times[field]} placeholder="HH:MMZ" maxLength={5} onChange={e => setTimes({ ...times, [field]: e.target.value.replace(/[^0-9:]/g, '').slice(0, 5) })} /><button onClick={() => setTimes({ ...times, [field]: hhmmNow() })}>NOW</button></label>)}</div>
    </Card>
    <Card title="Actual time summary" icon={Calculator} className="span-2"><div className="metric-strip mini"><Metric label="Block time" value={block === null ? '--:--' : `${Math.floor(block / 60).toString().padStart(2, '0')}:${String(block % 60).padStart(2, '0')}`} /><Metric label="Flight time" value={flightTime === null ? '--:--' : `${Math.floor(flightTime / 60).toString().padStart(2, '0')}:${String(flightTime % 60).padStart(2, '0')}`} /><Metric label="Turn time" value="—" sub="Available after next flight" /></div></Card>
  </div>;
}

const DEFAULT_CHECKLISTS = {
  'Preflight setup': ['SimBrief OFP imported', 'AIRAC cycle checked', 'Charts selected', 'Weather and NOTAMs reviewed', 'Fuel and payload verified'],
  'Before start': ['Clearance copied', 'Performance complete', 'Doors closed', 'Beacon on', 'Before start checklist complete'],
  'Before takeoff': ['Flight controls checked', 'Takeoff briefing complete', 'Runway and SID verified', 'Transponder set', 'Cabin secure'],
  'Descent': ['Arrival and approach loaded', 'Approach chart briefed', 'Landing data complete', 'Minimums set', 'Destination weather updated'],
  'After landing': ['Transponder standby', 'Flaps retracted', 'APU or ground power set', 'Landing time recorded', 'Taxi chart reviewed']
};

function ChecklistPage({ flight }: { flight: ReturnType<typeof summary> }) {
  const key = `dispatchlink.checklists.${flight.release}.${flight.origin}${flight.destination}`;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadLocal(key, {}));
  useEffect(() => saveLocal(key, checked), [key, checked]);
  const total = Object.values(DEFAULT_CHECKLISTS).flat().length; const complete = Object.values(checked).filter(Boolean).length;
  return <><div className="checklist-progress"><div><ClipboardCheck /><span><strong>{complete}/{total}</strong> items complete</span></div><div className="progress-track"><span style={{ width: `${total ? complete / total * 100 : 0}%` }} /></div><button onClick={() => setChecked({})}>Reset flight</button></div>
    <div className="checklist-grid">{Object.entries(DEFAULT_CHECKLISTS).map(([section, items]) => <Card key={section} title={section} icon={Check}>{items.map(item => { const id = `${section}:${item}`; return <label className={checked[id] ? 'check-item done' : 'check-item'} key={item}><input type="checkbox" checked={Boolean(checked[id])} onChange={e => setChecked({ ...checked, [id]: e.target.checked })} /><span><Check size={15} /></span>{item}</label>; })}</Card>)}</div>
    <p className="disclaimer">Generic simulation workflow checklist, not an aircraft manufacturer checklist.</p></>;
}

function ScratchpadPage({ flight }: { flight: ReturnType<typeof summary> }) {
  const key = `dispatchlink.scratch.${flight.release}.${flight.origin}${flight.destination}`;
  const [tab, setTab] = useState<'clearance' | 'atis' | 'notes'>('clearance');
  const [notes, setNotes] = useState(() => loadLocal(key, { clearance: '', atis: '', notes: '' }));
  useEffect(() => saveLocal(key, notes), [key, notes]);
  const templates = {
    clearance: `CLEARED TO ${flight.destination}\nVIA: ${flight.route}\nCLIMB: \nDEP FREQ: \nSQUAWK: `,
    atis: `${flight.origin} ATIS \nINFO: \nWIND: \nVIS: \nCEILING: \nTEMP/DEW: \nALTIMETER: \nRUNWAY: `,
    notes: `${flight.origin}-${flight.destination} ${flight.aircraft} ${flight.registration}\n`
  };
  return <Card title="Cockpit scratchpad" icon={NotebookPen}>
    <div className="scratch-tabs">{(['clearance', 'atis', 'notes'] as const).map(item => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item.toUpperCase()}</button>)}</div>
    <textarea className="scratchpad" value={notes[tab]} onChange={e => setNotes({ ...notes, [tab]: e.target.value })} placeholder={`Enter ${tab} notes…`} />
    <div className="button-row"><button onClick={() => setNotes({ ...notes, [tab]: templates[tab] })}>Insert template</button><button onClick={() => navigator.clipboard.writeText(notes[tab])}>Copy</button><button onClick={() => setNotes({ ...notes, [tab]: '' })}>Clear</button></div>
  </Card>;
}

function SettingsPage({ simbriefKey, setSimbriefKey, mode, setMode, loading, importOFP, loadDemo, runtime, refreshRuntime }: { simbriefKey: string; setSimbriefKey: (s: string) => void; mode: 'username' | 'userid'; setMode: (m: 'username' | 'userid') => void; loading: boolean; importOFP: () => Promise<void>; loadDemo: () => void; runtime: RuntimeStatus; refreshRuntime: () => Promise<void> }) {
  const install = async () => {
    const prompt = (window as any).deferredPrompt;
    if (prompt) await prompt.prompt(); else alert('Use your browser menu and choose “Install app” or “Add to Home Screen.”');
  };
  return <div className="content-grid two">
    <Card title="SimBrief connection" icon={Plane}>
      <p>Import the latest OFP using the public SimBrief fetcher.</p>
      <div className="segmented"><button className={mode === 'username' ? 'active' : ''} onClick={() => setMode('username')}>Username</button><button className={mode === 'userid' ? 'active' : ''} onClick={() => setMode('userid')}>Pilot ID</button></div>
      <label className="stacked-input"><span>{mode === 'username' ? 'SimBrief username' : 'Numeric Pilot ID'}</span><input value={simbriefKey} onChange={e => setSimbriefKey(e.target.value)} placeholder={mode === 'username' ? 'Your username' : '123456'} onKeyDown={e => { if (e.key === 'Enter') void importOFP(); }} /></label>
      <div className="button-row"><button className="primary" onClick={() => void importOFP()} disabled={loading}>{loading ? <RefreshCw className="spin" /> : <Import />} {loading ? 'Importing…' : 'Import latest OFP'}</button><button onClick={loadDemo}>Load demo flight</button></div>
    </Card>
    <Card title="Navigraph connection" icon={Map}>
      <div className="connection-cards"><div className={runtime.chartsApproved ? 'ok' : 'blocked'}>{runtime.chartsApproved ? <Check /> : <X />}<span><strong>Developer approval</strong><small>{runtime.chartsApproved ? 'Enabled' : 'Required'}</small></span></div><div className={runtime.simLinked ? 'ok' : 'blocked'}>{runtime.simLinked ? <Wifi /> : <WifiOff />}<span><strong>Simulator link</strong><small>{runtime.simLinked ? 'Active' : 'Inactive'}</small></span></div><div className={runtime.navigraphSignedIn ? 'ok' : 'blocked'}>{runtime.navigraphSignedIn ? <Check /> : <X />}<span><strong>Navigraph account</strong><small>{runtime.navigraphSignedIn ? 'Signed in' : 'Not connected'}</small></span></div></div>
      {!runtime.chartsApproved && <div className="notice warn"><strong>Navigraph licensing boundary</strong><p>The Navigraph Charts API cannot be enabled as an unapproved standalone EFB. DispatchLink therefore offers the official standalone Charts portal in a reusable app window, while the drawing workspace supports SimBrief PDFs and user-supplied charts. The direct API adapter stays gated for an approved virtual-environment build.</p></div>}
      <button onClick={() => window.open('https://charts.navigraph.com/', 'dispatchlink-navigraph', 'popup=yes,width=1500,height=1000')}><Map size={16} /> Open Navigraph Charts portal</button>
      {runtime.chartsApproved && runtime.simLinked && !runtime.navigraphSignedIn && runtime.navigraphConfigured && <a href="/api/navigraph/login" target="_blank" rel="noreferrer" className="primary button-link">Sign in to approved API mode</a>}
      {runtime.navigraphSignedIn && <button onClick={async () => { await fetch('/api/navigraph/logout', { method: 'POST' }); await refreshRuntime(); }}>Disconnect Navigraph</button>}
      <button className="text-button" onClick={() => void refreshRuntime()}><RefreshCw size={15} /> Refresh status</button>
    </Card>
    <Card title="Install as an app" icon={LayoutDashboard}>
      <p>DispatchLink EFB is a progressive web app. Install it for a full-screen tablet or desktop experience.</p><button onClick={() => void install()}>Install / Add to Home Screen</button>
    </Card>
    <Card title="Data behavior" icon={Settings}>
      <div className="status-list"><div><span>OFP cache</span><strong>Local device</strong></div><div><span>Annotations</span><strong>Local device</strong></div><div><span>Navigraph chart images</span><strong>Never stored</strong></div><div><span>Purpose</span><strong>Flight simulation only</strong></div></div>
    </Card>
  </div>;
}
