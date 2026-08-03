import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BookOpenCheck, Calculator, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardCheck, CloudSun, FileText, Fuel, Gauge, HelpCircle, Import,
  LayoutDashboard, Link2, Map, Menu, NotebookPen, PanelLeftClose, PanelLeftOpen, Plane, RefreshCw, Route, Search, Settings, ShieldCheck, Timer, X
} from 'lucide-react';
import { AeroSlateLogo } from './components/AeroSlateLogo';
import { type ChartSource } from './components/ChartWorkspace';
import { isNativeApp } from './components/ProviderPortal';
import { demoOFP } from './lib/demoOFP';
import { dig, getRunwayAnalysis, getWeather, summary, weight, type AnyRecord } from './lib/ofp';
import { loadLocal, saveLocal } from './lib/storage';
import type { FlightCandidate } from './lib/dispatchlink';
import { FlightFinderPage } from './pages/FlightFinderPage';
import { SimBriefDispatchPage } from './pages/SimBriefDispatchPage';
import { ChartsPage } from './pages/ChartsPage';
import { OFPPage } from './pages/OFPPage';
import { NavlogPage } from './pages/NavlogPage';
import { WeatherPage } from './pages/WeatherPage';
import { FuelPage } from './pages/FuelPage';
import { RunwayAnalysisPage } from './pages/RunwayAnalysisPage';
import { SimPage } from './pages/SimPage';
import { OOOIPage } from './pages/OOOIPage';
import { RecordsPage } from './pages/RecordsPage';
import { ScratchpadPage } from './pages/ScratchpadPage';
import { TripsPage } from './pages/TripsPage';
import { HelpPage } from './pages/HelpPage';
import { OperationalWorkflowPage } from './pages/OperationalWorkflowPage';

type Page = 'dashboard' | 'finder' | 'trips' | 'simbrief' | 'charts' | 'ofp' | 'navlog' | 'weather' | 'fuel' | 'performance' | 'frat' | 'preflight' | 'sim' | 'times' | 'postflight' | 'flightlogs' | 'dutylogs' | 'scratchpad' | 'help' | 'settings';
interface RuntimeStatus { simLinked: boolean; mode: 'standalone' | 'sim-linked'; providerMode: 'official-web-session'; }
interface NavItem { id: Page; label: string; shortLabel: string; icon: typeof LayoutDashboard; group: 'Plan' | 'Brief' | 'Fly' | 'Record' | 'System'; }
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Deck', shortLabel: 'Home', icon: LayoutDashboard, group: 'Plan' },
  { id: 'finder', label: 'Find flights', shortLabel: 'Find', icon: Search, group: 'Plan' },
  { id: 'trips', label: 'Trips', shortLabel: 'Trips', icon: CalendarDays, group: 'Plan' },
  { id: 'simbrief', label: 'Dispatch', shortLabel: 'Dispatch', icon: Plane, group: 'Plan' },
  { id: 'charts', label: 'Charts', shortLabel: 'Charts', icon: Map, group: 'Brief' },
  { id: 'ofp', label: 'OFP', shortLabel: 'OFP', icon: FileText, group: 'Brief' },
  { id: 'navlog', label: 'Navlog', shortLabel: 'Navlog', icon: Route, group: 'Brief' },
  { id: 'weather', label: 'WX / NOTAMs', shortLabel: 'Weather', icon: CloudSun, group: 'Brief' },
  { id: 'fuel', label: 'Fuel', shortLabel: 'Fuel', icon: Fuel, group: 'Brief' },
  { id: 'performance', label: 'Runway', shortLabel: 'Runway', icon: Calculator, group: 'Brief' },
  { id: 'frat', label: 'FRAT', shortLabel: 'FRAT', icon: ShieldCheck, group: 'Brief' },
  { id: 'preflight', label: 'Preflight', shortLabel: 'Preflight', icon: ClipboardCheck, group: 'Fly' },
  { id: 'sim', label: 'Live data', shortLabel: 'Live', icon: Activity, group: 'Fly' },
  { id: 'times', label: 'OOOI', shortLabel: 'OOOI', icon: Timer, group: 'Fly' },
  { id: 'postflight', label: 'Postflight', shortLabel: 'Post', icon: CheckCircle2, group: 'Fly' },
  { id: 'flightlogs', label: 'Flights', shortLabel: 'Flights', icon: BookOpenCheck, group: 'Record' },
  { id: 'dutylogs', label: 'Duty', shortLabel: 'Duty', icon: Timer, group: 'Record' },
  { id: 'scratchpad', label: 'Scratchpad', shortLabel: 'Notes', icon: NotebookPen, group: 'Record' },
  { id: 'help', label: 'Help', shortLabel: 'Help', icon: HelpCircle, group: 'System' },
  { id: 'settings', label: 'Settings', shortLabel: 'More', icon: Settings, group: 'System' }
];
const MOBILE_ITEMS: Page[] = ['dashboard', 'finder', 'simbrief', 'charts', 'times'];

function Card({ title, icon: Icon, action, children, className = '' }: { title: string; icon?: typeof Plane; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}><header><div>{Icon && <Icon size={18} />}<h3>{title}</h3></div>{action}</header><div className="card-body">{children}</div></section>;
}
function Metric({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: 'good' | 'warn' | 'bad' }) {
  return <div className={`metric ${alert || ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'blue' }) { return <span className={`pill ${tone}`}>{children}</span>; }
function formatWeight(value: number, units: string) { return value ? `${value.toLocaleString()} ${units}` : '—'; }
function flightSuffix(flight: ReturnType<typeof summary>) { return `${flight.release}.${flight.origin}${flight.destination}`; }
function migrateFlightLocalData(previous: ReturnType<typeof summary>, next: ReturnType<typeof summary>) {
  const from = flightSuffix(previous); const to = flightSuffix(next); if (from === to || previous.source === 'none') return;
  const prefixes = ['aeroslate.times.', 'aeroslate.scratch.', 'aeroslate.fuel.', 'aeroslate.records.draft.', 'aeroslate.duty.draft.', 'aeroslate.active-navlog.', 'dispatchlink.times.', 'dispatchlink.scratch.', 'dispatchlink.fuel.'];
  for (const prefix of prefixes) { const source = localStorage.getItem(`${prefix}${from}`); if (source !== null && localStorage.getItem(`${prefix}${to}`) === null) localStorage.setItem(`${prefix}${to}`, source); }
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard'); const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadLocal('aeroslate.sidebar.collapsed', false));
  const [ofp, setOfp] = useState<AnyRecord | null>(() => loadLocal('aeroslate.lastOFP', loadLocal<AnyRecord | null>('dispatchlink.lastOFP', null)));
  const [simbriefKey, setSimbriefKey] = useState(() => loadLocal('aeroslate.simbriefKey', loadLocal('dispatchlink.simbriefKey', '')));
  const [simbriefMode, setSimbriefMode] = useState<'username' | 'userid'>(() => loadLocal('aeroslate.simbriefMode', loadLocal<'username' | 'userid'>('dispatchlink.simbriefMode', 'username')));
  const [loadingOFP, setLoadingOFP] = useState(false); const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<RuntimeStatus>({ simLinked: false, mode: 'standalone', providerMode: 'official-web-session' });
  const [clock, setClock] = useState(new Date()); const [chartSource, setChartSource] = useState<ChartSource | null>(null);
  const [dispatchUrl, setDispatchUrl] = useState(() => loadLocal('aeroslate.dispatch.url', loadLocal('dispatchlink.dispatch.url', '')));
  const [selectedCandidate, setSelectedCandidate] = useState<FlightCandidate | null>(() => loadLocal<FlightCandidate | null>('aeroslate.finder.flight', null));
  const [dispatchFlight, setDispatchFlight] = useState<FlightCandidate | null>(() => loadLocal('aeroslate.dispatch.flight', loadLocal<FlightCandidate | null>('dispatchlink.dispatch.flight', null)));
  const [dispatchStaticId, setDispatchStaticId] = useState(() => loadLocal('aeroslate.dispatch.staticId', loadLocal('dispatchlink.dispatch.staticId', '')));
  const flight = useMemo(() => summary(ofp, dispatchFlight), [ofp, dispatchFlight]);
  const notify = useCallback((text: string) => setMessage(text), []);

  useEffect(() => saveLocal('aeroslate.sidebar.collapsed', sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 4200); return () => window.clearTimeout(timer); }, [message]);
  const refreshRuntime = useCallback(async () => { try { const response = await fetch('/api/runtime', { cache: 'no-store' }); if (response.ok) setRuntime(await response.json()); } catch { /* offline status */ } }, []);
  useEffect(() => { void refreshRuntime(); const runtimeTimer = window.setInterval(() => void refreshRuntime(), 5000); const clockTimer = window.setInterval(() => setClock(new Date()), 1000); if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js'); return () => { clearInterval(runtimeTimer); clearInterval(clockTimer); }; }, [refreshRuntime]);

  const importOFP = useCallback(async (staticId = '', options: { stayOnPage?: boolean; silent?: boolean } = {}): Promise<boolean> => {
    if (!simbriefKey.trim()) { if (!options.silent) notify('Enter your SimBrief username or Pilot ID in Connections.'); return false; }
    setLoadingOFP(true);
    try {
      const query = new URLSearchParams({ [simbriefMode]: simbriefKey.trim() }); if (staticId) query.set('static_id', staticId);
      const response = await fetch(`/api/simbrief?${query}`, { cache: 'no-store' }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to import OFP.');
      const origin = String(dig(data, 'origin.icao_code') || ''); const destination = String(dig(data, 'destination.icao_code') || '');
      if (!origin || !destination || /error|failed/i.test(String(dig(data, 'fetch.status') || ''))) throw new Error(String(dig(data, 'fetch.message') || 'The selected SimBrief flight has not been generated yet.'));
      migrateFlightLocalData(summary(ofp, dispatchFlight), summary(data, dispatchFlight)); setOfp(data); saveLocal('aeroslate.lastOFP', data); saveLocal('aeroslate.simbriefKey', simbriefKey.trim()); saveLocal('aeroslate.simbriefMode', simbriefMode);
      const mismatch = dispatchFlight && (origin !== dispatchFlight.departure || destination !== dispatchFlight.arrival);
      if (mismatch) { setDispatchFlight(null); setDispatchUrl(''); setDispatchStaticId(''); saveLocal('aeroslate.dispatch.flight', null); saveLocal('aeroslate.dispatch.url', ''); saveLocal('aeroslate.dispatch.staticId', ''); }
      if (!options.silent) notify(`Loaded ${origin}–${destination}. Flight data synchronized across AeroSlate.`); if (!options.stayOnPage) setPage('dashboard'); return true;
    } catch (error) { if (!options.silent) notify(error instanceof Error ? error.message : 'Unable to import OFP.'); return false; }
    finally { setLoadingOFP(false); }
  }, [simbriefKey, simbriefMode, dispatchFlight, ofp, notify]);

  const openDispatch = (url: string, selected: FlightCandidate, staticId: string) => {
    setDispatchUrl(url); setDispatchFlight(selected); setDispatchStaticId(staticId);
    if (ofp && (flight.origin !== selected.departure || flight.destination !== selected.arrival)) { setOfp(null); saveLocal('aeroslate.lastOFP', null); }
    saveLocal('aeroslate.dispatch.url', url); saveLocal('aeroslate.dispatch.flight', selected); saveLocal('aeroslate.dispatch.staticId', staticId); setPage('simbrief'); notify(`Prepared ${selected.flightNumber} for SimBrief.`);
  };
  const loadDemo = () => { setOfp(demoOFP); saveLocal('aeroslate.lastOFP', demoOFP); notify('Demo OFP loaded.'); setPage('dashboard'); };
  const navigate = (next: Page) => { setPage(next); setMenuOpen(false); };
  const grouped = ['Plan', 'Brief', 'Fly', 'Record', 'System'] as const;

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`${menuOpen ? 'sidebar open' : 'sidebar'} ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="brand"><div className="brand-mark"><AeroSlateLogo size={40} /></div><div><strong>AeroSlate</strong><span>Electronic flight bag</span></div><button className="sidebar-collapse" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div>
      <nav>{grouped.map(group => <div className="nav-group" key={group}><span>{group}</span>{NAV_ITEMS.filter(item => item.group === group).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{page === item.id && <ChevronRight size={15} />}</button>)}</div>)}</nav>
      <div className="sidebar-status"><div><span className={`status-dot ${runtime.simLinked ? 'online' : ''}`} />{runtime.simLinked ? 'Simulator linked' : 'Simulator offline'}</div><div><span className="status-dot online" />Provider workspaces ready</div></div>
    </aside>

    <main>
      <header className="topbar"><button className="menu-button always-menu" onClick={() => { const landscapeTablet = window.matchMedia('(orientation: landscape) and (min-width: 700px)').matches; if (landscapeTablet || window.innerWidth > 1180) setSidebarCollapsed(value => !value); else setMenuOpen(true); }}><Menu /></button><div className="flight-ident"><div className="flight-primary"><span>{flight.airline}{flight.flightNumber || '—'}</span><strong>{flight.origin} <Plane size={16} /> {flight.destination}</strong></div><div className="flight-aircraft"><span><b>EQUIP</b>{flight.aircraft}</span><span><b>REG</b>{flight.registration}</span></div></div><div className="topbar-actions"><div className="zulu-clock"><span>ZULU</span><strong>{clock.toISOString().slice(11, 19)}</strong></div><button className="primary top-import" onClick={() => void importOFP()} disabled={loadingOFP}>{loadingOFP ? <RefreshCw className="spin" size={16} /> : <Import size={16} />} {loadingOFP ? 'Syncing' : 'Import OFP'}</button></div></header>
      {message && <div className="toast toast-auto" role="status">{message}<span className="toast-progress" /></div>}
      <div className="page-content">
        {/* Provider and document workspaces stay mounted so authenticated sessions, OFP position, and tool state survive tab changes. */}
        <div className={`page-panel ${page === 'simbrief' ? 'active' : ''}`}><SimBriefDispatchPage url={dispatchUrl} flight={dispatchFlight} staticId={dispatchStaticId} loading={loadingOFP} onImport={importOFP} /></div>
        <div className={`page-panel ${page === 'charts' ? 'active' : ''}`}><ChartsPage ofp={ofp} flight={flight} source={chartSource} setSource={setChartSource} /></div>
        <div className={`page-panel ${page === 'ofp' ? 'active' : ''}`}><OFPPage ofp={ofp} flight={flight} notify={notify} /></div>
        <div className={`page-panel ${page === 'performance' ? 'active' : ''}`}><RunwayAnalysisPage ofp={ofp} flight={flight} onOpenOFP={() => setPage('ofp')} notify={notify} /></div>
        {page === 'dashboard' && <Dashboard ofp={ofp} flight={flight} setPage={setPage} />}
        {page === 'finder' && <FlightFinderPage onDispatch={openDispatch} onSelect={setSelectedCandidate} onSchedule={flight => { setSelectedCandidate(flight); setPage('trips'); }} notify={notify} />}
        {page === 'trips' && <TripsPage candidate={selectedCandidate} onDispatch={openDispatch} notify={notify} />}
        {page === 'navlog' && <NavlogPage ofp={ofp} flight={flight} />}
        {page === 'weather' && <WeatherPage ofp={ofp} flight={flight} />}
        {page === 'fuel' && <FuelPage ofp={ofp} flight={flight} />}
        {page === 'frat' && <OperationalWorkflowPage mode="frat" flight={flight} />}
        {page === 'preflight' && <OperationalWorkflowPage mode="preflight" flight={flight} />}
        {page === 'sim' && <SimPage />}
        {page === 'times' && <OOOIPage release={flight.release} origin={flight.origin} destination={flight.destination} schedOut={flight.schedOut} schedIn={flight.schedIn} />}
        {page === 'postflight' && <OperationalWorkflowPage mode="postflight" flight={flight} />}
        {page === 'flightlogs' && <RecordsPage flight={flight} mode="logbook" />}
        {page === 'dutylogs' && <RecordsPage flight={flight} mode="duty" />}
        {page === 'scratchpad' && <ScratchpadPage flight={flight} notify={notify} />}
        {page === 'help' && <HelpPage />}
        {page === 'settings' && <SettingsPage simbriefKey={simbriefKey} setSimbriefKey={setSimbriefKey} mode={simbriefMode} setMode={setSimbriefMode} loading={loadingOFP} importOFP={async () => { await importOFP(); }} loadDemo={loadDemo} runtime={runtime} refreshRuntime={refreshRuntime} notify={notify} />}
      </div>
      <nav className="mobile-tabbar">{MOBILE_ITEMS.map(id => { const item = NAV_ITEMS.find(entry => entry.id === id)!; return <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><item.icon size={20} /><span>{item.shortLabel}</span></button>; })}<button className={menuOpen ? 'active' : ''} onClick={() => setMenuOpen(true)}><Menu size={20} /><span>More</span></button></nav>
    </main>
  </div>;
}

function Dashboard({ ofp, flight, setPage }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary>; setPage: (page: Page) => void }) {
  const units = flight.units; const tow = weight(ofp, 'weights.est_tow'); const mtow = weight(ofp, 'weights.max_tow'); const ramp = weight(ofp, 'fuel.plan_ramp'); const landing = weight(ofp, 'fuel.plan_landing');
  const tlr = getRunwayAnalysis(ofp); const originWx = getWeather(ofp, 'origin').metar; const destinationWx = getWeather(ofp, 'destination').metar;
  return <div className="dashboard-page">
    {flight.source === 'none' && <div className="hero-empty"><AeroSlateLogo size={64} /><div><h1>Your flight, one continuous workflow</h1><p>Find a real flight, generate it with SimBrief, brief with Navigraph, fly with live simulator data, and copy actual times into your records.</p><button className="primary" onClick={() => setPage('finder')}><Search size={17} /> Find a flight</button></div></div>}
    {flight.source === 'candidate' && <div className="active-flight-banner"><div><span>Selected flight</span><strong>{flight.airline}{flight.flightNumber} · {flight.origin} → {flight.destination}</strong><small>{flight.aircraft} {flight.registration} · STD {flight.schedOut}</small></div><button className="primary" onClick={() => setPage('simbrief')}><Plane size={17} /> Dispatch in SimBrief</button></div>}
    <div className="metric-strip dashboard-metrics"><Metric label="STD / STA" value={`${flight.schedOut} / ${flight.schedIn}`} sub={`Block ${flight.blockTime}`} /><Metric label="Distance" value={flight.distance} sub={`${flight.cruiseAltitude} · CI ${flight.costIndex}`} /><Metric label="Ramp fuel" value={formatWeight(ramp, units)} sub={`Landing ${formatWeight(landing, units)}`} /><Metric label="Takeoff weight" value={formatWeight(tow, units)} sub={mtow ? `Limit ${formatWeight(mtow, units)}` : 'SimBrief OFP'} alert={mtow && tow > mtow ? 'bad' : tow ? 'good' : undefined} /></div>
    <div className="dashboard-grid streamlined-dashboard">
      <Card title="Active flight" icon={Plane} className="span-2 active-flight-card"><div className="route-display"><div className="route-endpoint"><span>{flight.origin}</span><small>{flight.originName}</small></div><div className="route-line"><Plane /><span className="route-distance">{flight.distance}</span></div><div className="route-endpoint destination"><span>{flight.destination}</span><small>{flight.destinationName}</small></div></div><div className="route-string">{flight.route}</div><div className="button-row"><button className="primary" onClick={() => setPage(ofp ? 'ofp' : 'simbrief')}><FileText size={16} /> {ofp ? 'Open OFP' : 'Generate OFP'}</button><button onClick={() => setPage('charts')}><Map size={16} /> Charts</button><button onClick={() => setPage('performance')}><Calculator size={16} /> Runway analysis</button></div></Card>
      <Card title="Ready state" icon={Check}><div className="status-list"><div><span>OFP</span><Pill tone={ofp ? 'good' : 'warn'}>{ofp ? 'LOADED' : 'PENDING'}</Pill></div><div><span>Runway analysis</span><Pill tone={tlr.available ? 'good' : ofp ? 'warn' : 'neutral'}>{tlr.available ? 'IN OFP' : 'TOOLS READY'}</Pill></div><div><span>Alternate</span><strong>{flight.alternate}</strong></div><div><span>Simulator</span><Pill tone="neutral">OPEN LIVE PAGE</Pill></div></div></Card>
      <Card title="Weather" icon={CloudSun} className="span-2"><div className="wx-snapshot"><div><Pill tone="blue">{flight.origin}</Pill><p>{originWx}</p></div><div><Pill tone="blue">{flight.destination}</Pill><p>{destinationWx}</p></div></div><button className="text-button" onClick={() => setPage('weather')}>Weather and all NOTAMs <ChevronRight size={16} /></button></Card>
      <Card title="Next actions" icon={Gauge}><div className="next-actions"><button onClick={() => setPage('navlog')}><Route size={18} /><span><strong>Navlog</strong><small>Planned or active</small></span></button><button onClick={() => setPage('times')}><Timer size={18} /><span><strong>OOOI</strong><small>Automatic or NOW</small></span></button><button onClick={() => setPage('flightlogs')}><BookOpenCheck size={18} /><span><strong>Flight logs</strong><small>Duty logs linked separately</small></span></button></div></Card>
    </div>
  </div>;
}

function SettingsPage({ simbriefKey, setSimbriefKey, mode, setMode, loading, importOFP, loadDemo, runtime, refreshRuntime, notify }: { simbriefKey: string; setSimbriefKey: (value: string) => void; mode: 'username' | 'userid'; setMode: (value: 'username' | 'userid') => void; loading: boolean; importOFP: () => Promise<void>; loadDemo: () => void; runtime: RuntimeStatus; refreshRuntime: () => Promise<void>; notify: (message: string) => void; }) {
  const native = isNativeApp(); const api = (window as any).aeroslateNative || (window as any).dispatchlinkNative;
  const install = async () => { const prompt = (window as any).deferredPrompt; if (prompt) await prompt.prompt(); else notify('Use the browser menu and choose Add to Home Screen.'); };
  const changeBackend = async () => { if (!api?.setAppUrl) return; const current = await api.getAppUrl?.(); const next = window.prompt('Render service URL', current || 'https://your-aeroslate.onrender.com'); if (next) await api.setAppUrl(next); };
  return <div className="content-grid two settings-grid">
    <Card title="SimBrief synchronization" icon={Plane}><p>The account identifier imports the latest generated OFP and makes it the single source for schedule, route, fuel, weather, NOTAMs and documents.</p><div className="segmented"><button className={mode === 'username' ? 'active' : ''} onClick={() => setMode('username')}>Username</button><button className={mode === 'userid' ? 'active' : ''} onClick={() => setMode('userid')}>Pilot ID</button></div><label className="stacked-input"><span>{mode === 'username' ? 'SimBrief username' : 'Numeric Pilot ID'}</span><input value={simbriefKey} onChange={event => setSimbriefKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void importOFP(); }} /></label><div className="button-row"><button className="primary" onClick={() => void importOFP()} disabled={loading}>{loading ? <RefreshCw className="spin" /> : <Import />} {loading ? 'Synchronizing…' : 'Import latest OFP'}</button><button onClick={loadDemo}>Load demo</button></div></Card>
    <Card title="Provider workspaces" icon={Map}><div className="connection-cards"><div className="ok"><Check /><span><strong>SimBrief</strong><small>In-app dispatch and tools</small></span></div><div className="ok"><Check /><span><strong>Navigraph</strong><small>Official authenticated Charts session</small></span></div><div className={runtime.simLinked ? 'ok' : 'blocked'}>{runtime.simLinked ? <Check /> : <X />}<span><strong>Simulator bridge</strong><small>{runtime.simLinked ? 'Connected' : 'Optional for flight data'}</small></span></div></div><p className="muted">The desktop shell embeds official provider sessions. Mobile wrappers use a secure in-app provider browser; the normal web/PWA build may need a provider window because browsers enforce provider framing restrictions.</p><button onClick={() => void refreshRuntime()}><RefreshCw size={15} /> Refresh status</button></Card>
    <Card title={native ? 'Native application' : 'Install AeroSlate'} icon={LayoutDashboard}>{native ? <><p>Provider sessions remain signed in across launches and are displayed in AeroSlate’s own workspace.</p><button onClick={() => void changeBackend()}><Settings size={16} /> Change Render backend</button></> : <><p>Install the PWA for safe-area support, full-screen layout and device-local settings.</p><button onClick={() => void install()}>Install / Add to Home Screen</button></>}</Card>
    <Card title="Data ownership" icon={Link2}><div className="status-list"><div><span>Planned flight</span><strong>SimBrief OFP</strong></div><div><span>Charts</span><strong>Navigraph session</strong></div><div><span>Actual times</span><strong>OOOI</strong></div><div><span>Records</span><strong>OOOI copied automatically</strong></div><div><span>Device settings</span><strong>Stored locally</strong></div></div></Card>
  </div>;
}
