import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BookOpenCheck, Calculator, CalendarDays, Check, ChevronRight, CloudSun, FileText, Fuel, Gauge, HelpCircle, Import,
  LayoutDashboard, Link2, Map, MapPin, Menu, PanelLeftClose, PanelLeftOpen, Plane, RefreshCw, Route, Search, Settings, Timer, X
} from 'lucide-react';
import { AeroSlateLogo } from './components/AeroSlateLogo';
import { isNativeApp } from './components/ProviderPortal';
import { demoOFP } from './lib/demoOFP';
import { dig, getICAOFlightPlan, getRunwayAnalysis, getSelcal, getWeather, leafText, summary, weight, type AnyRecord } from './lib/ofp';
import { loadLocal, saveLocal } from './lib/storage';
import type { FlightCandidate } from './lib/dispatchlink';
import { FlightFinderPage } from './pages/FlightFinderPage';
import { SimBriefDispatchPage } from './pages/SimBriefDispatchPage';
import { FlightPlannerPage } from './pages/FlightPlannerPage';
import { ChartsPage } from './pages/ChartsPage';
import { OFPPage } from './pages/OFPPage';
import { NavlogPage } from './pages/NavlogPage';
import { WeatherPage } from './pages/WeatherPage';
import { FuelPage } from './pages/FuelPage';
import { RunwayAnalysisPage } from './pages/RunwayAnalysisPage';
import { SimPage, useSimTelemetry } from './pages/SimPage';
import { OOOIPage } from './pages/OOOIPage';
import { RecordsPage } from './pages/RecordsPage';
import { GatePage } from './pages/GatePage';
import { TripsPage } from './pages/TripsPage';
import { HelpPage } from './pages/HelpPage';
import { appendLedgerRecord, emptyLedger, getOrCreateDeviceId, normalizeLedger } from './lib/cloudLedger';
import { addTripsLocal, tripToRecordData } from './lib/trips';
import { generateDispatchPayload } from './lib/dispatchlink';

type Page = 'dashboard' | 'finder' | 'trips' | 'planner' | 'simbrief' | 'charts' | 'ofp' | 'navlog' | 'weather' | 'fuel' | 'performance' | 'sim' | 'times' | 'gates' | 'flightlogs' | 'dutylogs' | 'help' | 'settings';
interface RuntimeStatus { simLinked: boolean; mode: 'standalone' | 'sim-linked'; providerMode: 'official-web-session'; }
interface NavItem { id: Page; label: string; shortLabel: string; icon: typeof LayoutDashboard; group: 'Plan' | 'Brief' | 'Fly' | 'Record' | 'System'; }
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Flight Overview', shortLabel: 'Overview', icon: LayoutDashboard, group: 'Plan' },
  { id: 'finder', label: 'Find flights', shortLabel: 'Find', icon: Search, group: 'Plan' },
  { id: 'trips', label: 'Trips', shortLabel: 'Trips', icon: CalendarDays, group: 'Plan' },
  { id: 'planner', label: 'Flight planner', shortLabel: 'Planner', icon: FileText, group: 'Plan' },
  { id: 'simbrief', label: 'Dispatch', shortLabel: 'Dispatch', icon: Plane, group: 'Plan' },
  { id: 'charts', label: 'Charts', shortLabel: 'Charts', icon: Map, group: 'Brief' },
  { id: 'ofp', label: 'OFP', shortLabel: 'OFP', icon: FileText, group: 'Brief' },
  { id: 'navlog', label: 'Navlog', shortLabel: 'Navlog', icon: Route, group: 'Brief' },
  { id: 'weather', label: 'WX / NOTAMs', shortLabel: 'Weather', icon: CloudSun, group: 'Brief' },
  { id: 'fuel', label: 'Fuel', shortLabel: 'Fuel', icon: Fuel, group: 'Brief' },
  { id: 'performance', label: 'Runway', shortLabel: 'Runway', icon: Calculator, group: 'Brief' },
  { id: 'sim', label: 'Live data', shortLabel: 'Live', icon: Activity, group: 'Fly' },
  { id: 'times', label: 'OOOI', shortLabel: 'OOOI', icon: Timer, group: 'Fly' },
  { id: 'flightlogs', label: 'Flights', shortLabel: 'Flights', icon: BookOpenCheck, group: 'Record' },
  { id: 'dutylogs', label: 'Duty', shortLabel: 'Duty', icon: Timer, group: 'Record' },
  { id: 'gates', label: 'Gates', shortLabel: 'Gates', icon: MapPin, group: 'Fly' },
  { id: 'help', label: 'Help', shortLabel: 'Help', icon: HelpCircle, group: 'System' },
  { id: 'settings', label: 'Settings', shortLabel: 'More', icon: Settings, group: 'System' }
];

const PORTRAIT_BOTTOM_ITEMS: Page[] = ['dashboard', 'finder', 'trips', 'simbrief', 'ofp'];

function Card({ title, icon: Icon, action, children, className = '' }: { title: string; icon?: typeof Plane; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}><header><div>{Icon && <Icon size={18} />}<h3>{title}</h3></div>{action}</header><div className="card-body">{children}</div></section>;
}
function Metric({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: 'good' | 'warn' | 'bad' }) {
  return <div className={`metric ${alert || ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'blue' }) { return <span className={`pill ${tone}`}>{children}</span>; }
function formatWeight(value: number, units: string) { return value ? `${value.toLocaleString()} ${units}` : '—'; }
function flightSuffix(flight: ReturnType<typeof summary>) { return `${flight.release}.${flight.origin}${flight.destination}`; }
function departureCountdown(now: Date, flightDate: string, schedOut: string) {
  const match = String(schedOut || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return { std: 'STD —', label: 'DEP IN', value: '—' };
  const dateMatch = String(flightDate || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const year = dateMatch ? Number(dateMatch[1]) : now.getUTCFullYear();
  const month = dateMatch ? Number(dateMatch[2]) - 1 : now.getUTCMonth();
  const day = dateMatch ? Number(dateMatch[3]) : now.getUTCDate();
  const target = Date.UTC(year, month, day, Number(match[1]), Number(match[2]), 0);
  const delta = target - now.getTime();
  const abs = Math.abs(delta);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1_000);
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return { std: `STD ${String(match[1]).padStart(2, '0')}:${match[2]}Z`, label: delta >= 0 ? 'DEP IN' : 'STD +', value };
}
function migrateFlightLocalData(previous: ReturnType<typeof summary>, next: ReturnType<typeof summary>) {
  const from = flightSuffix(previous); const to = flightSuffix(next); if (from === to || previous.source === 'none') return;
  const prefixes = ['aeroslate.times.', 'aeroslate.scratch.', 'aeroslate.fuel.', 'aeroslate.records.draft.', 'aeroslate.duty.draft.', 'aeroslate.active-navlog.', 'dispatchlink.times.', 'dispatchlink.scratch.', 'dispatchlink.fuel.'];
  for (const prefix of prefixes) { const source = localStorage.getItem(`${prefix}${from}`); if (source !== null && localStorage.getItem(`${prefix}${to}`) === null) localStorage.setItem(`${prefix}${to}`, source); }
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard'); const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadLocal('aeroslate.sidebar.collapsed', false));
  const [portraitDrawer, setPortraitDrawer] = useState(() => window.matchMedia('(max-width: 699px), (orientation: portrait) and (max-width: 1180px)').matches);
  const [ofp, setOfp] = useState<AnyRecord | null>(() => loadLocal('aeroslate.lastOFP', loadLocal<AnyRecord | null>('dispatchlink.lastOFP', null)));
  const [simbriefKey, setSimbriefKey] = useState(() => loadLocal('aeroslate.simbriefKey', loadLocal('dispatchlink.simbriefKey', '')));
  const [simbriefMode, setSimbriefMode] = useState<'username' | 'userid'>(() => loadLocal('aeroslate.simbriefMode', loadLocal<'username' | 'userid'>('dispatchlink.simbriefMode', 'username')));
  const [loadingOFP, setLoadingOFP] = useState(false); const [message, setMessage] = useState('');
  const [runtime, setRuntime] = useState<RuntimeStatus>({ simLinked: false, mode: 'standalone', providerMode: 'official-web-session' });
  const [clock, setClock] = useState(new Date());
  const { telemetry: headerTelemetry, linked: headerSimLinked } = useSimTelemetry();
  const [dispatchUrl, setDispatchUrl] = useState(() => loadLocal('aeroslate.dispatch.url', loadLocal('dispatchlink.dispatch.url', '')));
  const [selectedCandidate, setSelectedCandidate] = useState<FlightCandidate | null>(() => loadLocal<FlightCandidate | null>('aeroslate.finder.flight', null));
  const [dispatchFlight, setDispatchFlight] = useState<FlightCandidate | null>(() => loadLocal('aeroslate.dispatch.flight', loadLocal<FlightCandidate | null>('dispatchlink.dispatch.flight', null)));
  const [dispatchStaticId, setDispatchStaticId] = useState(() => loadLocal('aeroslate.dispatch.staticId', loadLocal('dispatchlink.dispatch.staticId', '')));
  const [theme, setTheme] = useState(() => loadLocal('aeroslate.theme', 'ocean'));
  const flight = useMemo(() => summary(ofp, dispatchFlight), [ofp, dispatchFlight]);
  const departure = useMemo(() => departureCountdown(clock, flight.flightDate, flight.schedOut), [clock, flight.flightDate, flight.schedOut]);
  const zuluClockText = useMemo(() => {
    if (headerSimLinked && typeof headerTelemetry?.simZuluSeconds === 'number' && Number.isFinite(headerTelemetry.simZuluSeconds)) {
      const total = Math.floor(headerTelemetry.simZuluSeconds) % 86400;
      const safe = total < 0 ? total + 86400 : total;
      const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
      const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
      const ss = String(safe % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}z`;
    }
    if (headerSimLinked && headerTelemetry?.simZulu) {
      const match = String(headerTelemetry.simZulu).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?[zZ]?$/);
      if (match) return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}:${match[3] || '00'}z`;
    }
    return `${clock.toISOString().slice(11, 19)}z`;
  }, [clock, headerSimLinked, headerTelemetry?.simZulu, headerTelemetry?.simZuluSeconds]);
  const notify = useCallback((text: string) => setMessage(text), []);

  useEffect(() => saveLocal('aeroslate.sidebar.collapsed', sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => { document.documentElement.dataset.theme = theme; saveLocal('aeroslate.theme', theme); }, [theme]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 699px), (orientation: portrait) and (max-width: 1180px)');
    const update = () => { setPortraitDrawer(query.matches); if (query.matches) setMenuOpen(false); };
    update(); query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 4200); return () => window.clearTimeout(timer); }, [message]);
  const refreshRuntime = useCallback(async () => { try { const response = await fetch('/api/runtime', { cache: 'no-store' }); if (response.ok) setRuntime(await response.json()); } catch { /* offline status */ } }, []);
  useEffect(() => {
    void refreshRuntime();
    const runtimeTimer = window.setInterval(() => void refreshRuntime(), 5000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
        void registration.update();
      });
    }

    return () => {
      clearInterval(runtimeTimer);
      clearInterval(clockTimer);
    };
  }, [refreshRuntime]);

  const fetchLatestSimBriefOFP = useCallback(async (): Promise<AnyRecord | null> => {
    if (!simbriefKey.trim()) { notify('Enter your SimBrief username or Pilot ID in Connections.'); return null; }
    try {
      const query = new URLSearchParams({ [simbriefMode]: simbriefKey.trim() });
      const response = await fetch(`/api/simbrief?${query}`, { cache: 'no-store' }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to import SimBrief OFP.');
      const origin = String(dig(data, 'origin.icao_code') || ''); const destination = String(dig(data, 'destination.icao_code') || '');
      if (!origin || !destination || /error|failed/i.test(String(dig(data, 'fetch.status') || ''))) throw new Error(String(dig(data, 'fetch.message') || 'Your latest SimBrief flight has not been generated yet.'));
      saveLocal('aeroslate.simbriefKey', simbriefKey.trim()); saveLocal('aeroslate.simbriefMode', simbriefMode);
      return data;
    } catch (error) { notify(error instanceof Error ? error.message : 'Unable to import SimBrief OFP.'); return null; }
  }, [simbriefKey, simbriefMode, notify]);

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
  const loadCustomOFP = useCallback((data: AnyRecord) => { migrateFlightLocalData(summary(ofp, dispatchFlight), summary(data, null)); setOfp(data); saveLocal('aeroslate.lastOFP', data); setDispatchFlight(null); setDispatchUrl(''); setDispatchStaticId(''); saveLocal('aeroslate.dispatch.flight', null); saveLocal('aeroslate.dispatch.url', ''); saveLocal('aeroslate.dispatch.staticId', ''); setPage('dashboard'); }, [ofp, dispatchFlight]);
  const scheduleTrip = useCallback(async (candidate: FlightCandidate): Promise<boolean> => {
    setSelectedCandidate(candidate); saveLocal('aeroslate.finder.flight', candidate);
    const local = addTripsLocal([candidate], String(candidate.date).slice(0, 10), '', true);
    if (!local.added.length) { notify(`${candidate.flightNumber} is already in Unscheduled Trips.`); return false; }
    const trip = local.added[0];
    try {
      const key='aeroslate.records.ledger.v2';
      const ledger=normalizeLedger(loadLocal(key,emptyLedger()));
      if (!ledger.trips.some(entry => String(entry.data.candidateId)===candidate.id && String(entry.data.date).slice(0,10)===trip.date)) {
        const result=await appendLedgerRecord(ledger,'trip',tripToRecordData(trip),getOrCreateDeviceId());
        saveLocal(key,result.ledger);
        window.dispatchEvent(new CustomEvent('aeroslate-ledger-updated'));
      }
    } catch (error) {
      console.warn('Trip audit copy could not be written; local trip remains saved.', error);
    }
    return true;
  },[notify]);

  const navigate = (next: Page) => { setPage(next); setMenuOpen(false); };
  const grouped = ['Plan', 'Brief', 'Fly', 'Record', 'System'] as const;

  const effectiveCollapsed = portraitDrawer ? !menuOpen : sidebarCollapsed;
  return <div className={`app-shell ${effectiveCollapsed ? 'sidebar-collapsed' : ''}`}>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`${menuOpen ? 'sidebar open' : 'sidebar'} ${effectiveCollapsed ? 'collapsed' : ''} ${portraitDrawer ? 'portrait-sidebar' : ''}`}>
      <div className="brand"><div className="brand-mark"><AeroSlateLogo size={40} /></div><div><strong>AeroSlate</strong><span>Electronic flight bag</span></div><button className="sidebar-collapse" title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)}>{effectiveCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div>
      <nav>{grouped.map(group => <div className="nav-group" key={group}><span>{group}</span>{NAV_ITEMS.filter(item => item.group === group).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{page === item.id && <ChevronRight size={15} />}</button>)}</div>)}</nav>
      <div className="sidebar-status"><div><span className={`status-dot ${runtime.simLinked ? 'online' : ''}`} />{runtime.simLinked ? 'Simulator linked' : 'Simulator offline'}</div><div><span className="status-dot online" />Provider workspaces ready</div></div>
    </aside>

    <main>
      <header className="topbar">
        <button className="menu-button always-menu" aria-label="Toggle navigation" onClick={() => { const landscapeTablet = window.matchMedia('(orientation: landscape) and (min-width: 700px)').matches; if (landscapeTablet || window.innerWidth > 1180) setSidebarCollapsed(value => !value); else setMenuOpen(true); }}><Menu /></button>
        <div className="flight-ident">
          <div className="flight-primary"><span>{flight.airline}{flight.flightNumber || '—'}</span><strong>{flight.origin} <Plane size={16} /> {flight.destination}</strong></div>
          <div className="flight-aircraft"><span><b>EQUIP</b>{flight.aircraft}</span><span><b>REG</b>{flight.registration}</span></div>
        </div>
        <div className="topbar-actions">
          <button className="primary top-import" onClick={() => void importOFP()} disabled={loadingOFP}>{loadingOFP ? <RefreshCw className="spin" size={16} /> : <Import size={16} />}<span>{loadingOFP ? 'Syncing' : 'Import OFP'}</span></button>
          <div className={`departure-clock ${departure.label === 'STD +' ? 'late' : ''}`}><span>{departure.label}</span><strong>{departure.value}</strong><small>{departure.std}</small></div>
          <div className="zulu-clock"><span>UTC</span><strong>{zuluClockText}</strong></div>
        </div>
      </header>
      {message && <div className="toast toast-auto" role="status">{message}<span className="toast-progress" /></div>}
      <div className="page-content">
        {/* Provider and document workspaces stay mounted so authenticated sessions, OFP position, and tool state survive tab changes. */}
        <div className={`page-panel ${page === 'simbrief' ? 'active' : ''}`}><SimBriefDispatchPage url={dispatchUrl} flight={dispatchFlight} staticId={dispatchStaticId} loading={loadingOFP} onImport={importOFP} /></div>
        <div className={`page-panel ${page === 'charts' ? 'active' : ''}`}><ChartsPage ofp={ofp} flight={flight} /></div>
        <div className={`page-panel ${page === 'ofp' ? 'active' : ''}`}><OFPPage ofp={ofp} flight={flight} notify={notify} /></div>
        <div className={`page-panel ${page === 'performance' ? 'active' : ''}`}><RunwayAnalysisPage ofp={ofp} flight={flight} onOpenOFP={() => setPage('ofp')} notify={notify} /></div>
        {page === 'dashboard' && <Dashboard ofp={ofp} flight={flight} setPage={setPage} />}
        {page === 'finder' && <FlightFinderPage onDispatch={openDispatch} onSelect={setSelectedCandidate} onSchedule={scheduleTrip} notify={notify} />}
        {page === 'trips' && <TripsPage candidate={selectedCandidate} onDispatch={openDispatch} notify={notify} />}
        {page === 'planner' && <FlightPlannerPage onLoadOFP={loadCustomOFP} onFetchSimBriefOFP={fetchLatestSimBriefOFP} notify={notify} />}
        {page === 'navlog' && <NavlogPage ofp={ofp} flight={flight} />}
        {page === 'weather' && <WeatherPage ofp={ofp} flight={flight} />}
        {page === 'fuel' && <FuelPage ofp={ofp} flight={flight} />}
        {page === 'sim' && <SimPage />}
        {page === 'times' && <OOOIPage release={flight.release} origin={flight.origin} destination={flight.destination} schedOut={flight.schedOut} schedIn={flight.schedIn} />}
        {page === 'flightlogs' && <RecordsPage flight={flight} mode="logbook" />}
        {page === 'dutylogs' && <RecordsPage flight={flight} mode="duty" />}
        {page === 'gates' && <GatePage ofp={ofp} flight={flight} notify={notify} />}
        {page === 'help' && <HelpPage />}
        {page === 'settings' && <SettingsPage simbriefKey={simbriefKey} setSimbriefKey={setSimbriefKey} mode={simbriefMode} setMode={setSimbriefMode} loading={loadingOFP} importOFP={async () => { await importOFP(); }} loadDemo={loadDemo} runtime={runtime} refreshRuntime={refreshRuntime} notify={notify} theme={theme} setTheme={setTheme} />}
      </div>
    </main>
    {portraitDrawer && <nav className="portrait-workflow-bar" aria-label="Primary workflow">
      {PORTRAIT_BOTTOM_ITEMS.map(id => {
        const item = NAV_ITEMS.find(entry => entry.id === id)!;
        const Icon = item.icon;
        return <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)} aria-label={item.label}><Icon size={20}/><span>{item.shortLabel}</span></button>;
      })}
      <button className={menuOpen ? 'active' : ''} onClick={() => setMenuOpen(true)} aria-label="Open all sections"><Menu size={20}/><span>More</span></button>
    </nav>}
  </div>;
}

function Dashboard({ ofp, flight, setPage }: { ofp: AnyRecord | null; flight: ReturnType<typeof summary>; setPage: (page: Page) => void }) {
  const units = flight.units; const tow = weight(ofp, 'weights.est_tow'); const mtow = weight(ofp, 'weights.max_tow'); const ramp = weight(ofp, 'fuel.plan_ramp'); const landing = weight(ofp, 'fuel.plan_landing');
  const tlr = getRunwayAnalysis(ofp); const originWx = getWeather(ofp, 'origin').metar; const destinationWx = getWeather(ofp, 'destination').metar;
  return <div className="dashboard-page">
    {flight.source === 'none' && <div className="hero-empty"><AeroSlateLogo size={64} /><div><h1>Your flight, one continuous workflow</h1><p>Find a real flight, generate it with SimBrief, review Navigraph charts and maps, fly with live simulator data, and copy actual times into your records.</p><button className="primary" onClick={() => setPage('finder')}><Search size={17} /> Find a flight</button></div></div>}
    {flight.source === 'candidate' && <div className="active-flight-banner"><div><span>Selected flight</span><strong>{flight.airline}{flight.flightNumber} · {flight.origin} → {flight.destination}</strong><small>{flight.aircraft} {flight.registration} · STD {flight.schedOut}</small></div><button className="primary" onClick={() => setPage('simbrief')}><Plane size={17} /> Dispatch in SimBrief</button></div>}
    <div className="metric-strip dashboard-metrics"><Metric label="STD / STA" value={`${flight.schedOut} / ${flight.schedIn}`} sub={`Block ${flight.blockTime}`} /><Metric label="Distance" value={flight.distance} sub={`${flight.cruiseAltitude} · CI ${flight.costIndex}`} /><Metric label="Ramp fuel" value={formatWeight(ramp, units)} sub={`Landing ${formatWeight(landing, units)}`} /><Metric label="Takeoff weight" value={formatWeight(tow, units)} sub={mtow ? `Limit ${formatWeight(mtow, units)}` : 'SimBrief OFP'} alert={mtow && tow > mtow ? 'bad' : tow ? 'good' : undefined} /></div>
    <div className="dashboard-grid streamlined-dashboard">
      <Card title="Active flight" icon={Plane} className="span-2 active-flight-card"><div className="route-display"><div className="route-endpoint"><span>{flight.origin}</span><small>{flight.originName}</small></div><div className="route-line"><Plane /><span className="route-distance">{flight.distance}</span></div><div className="route-endpoint destination"><span>{flight.destination}</span><small>{flight.destinationName}</small></div></div><div className="route-string">{flight.route}</div><div className="button-row"><button className="primary" onClick={() => setPage(ofp ? 'ofp' : 'simbrief')}><FileText size={16} /> {ofp ? 'Open OFP' : 'Generate OFP'}</button><button onClick={() => setPage('charts')}><Map size={16} /> Charts</button><button onClick={() => setPage('performance')}><Calculator size={16} /> Runway analysis</button></div></Card>
      <Card title="Ready state" icon={Check}><div className="status-list"><div><span>OFP</span><Pill tone={ofp ? 'good' : 'warn'}>{ofp ? 'LOADED' : 'PENDING'}</Pill></div><div><span>Runway analysis</span><Pill tone={tlr.available ? 'good' : ofp ? 'warn' : 'neutral'}>{tlr.available ? 'IN OFP' : 'TOOLS READY'}</Pill></div><div><span>Alternate</span><strong>{flight.alternate}</strong></div><div><span>Simulator</span><Pill tone="neutral">OPEN LIVE PAGE</Pill></div></div></Card>
      <Card title="Weather" icon={CloudSun} className="span-2"><div className="wx-snapshot"><div><Pill tone="blue">{flight.origin}</Pill><p>{originWx}</p></div><div><Pill tone="blue">{flight.destination}</Pill><p>{destinationWx}</p></div></div><button className="text-button weather-notams-button" onClick={() => setPage('weather')}>Weather and all NOTAMs <ChevronRight size={16} /></button></Card>
      <Card title="Next actions" icon={Gauge}><div className="next-actions"><button onClick={() => setPage('navlog')}><Route size={18} /><span><strong>Navlog</strong><small>Planned or active</small></span></button><button onClick={() => setPage('times')}><Timer size={18} /><span><strong>OOOI</strong><small>Automatic or NOW</small></span></button><button onClick={() => setPage('flightlogs')}><BookOpenCheck size={18} /><span><strong>Flight logs</strong><small>Duty logs linked separately</small></span></button></div></Card>
    </div>
  </div>;
}

function SettingsPage({ simbriefKey, setSimbriefKey, mode, setMode, loading, importOFP, loadDemo, runtime, refreshRuntime, notify, theme, setTheme }: { simbriefKey: string; setSimbriefKey: (value: string) => void; mode: 'username' | 'userid'; setMode: (value: 'username' | 'userid') => void; loading: boolean; importOFP: () => Promise<void>; loadDemo: () => void; runtime: RuntimeStatus; refreshRuntime: () => Promise<void>; notify: (message: string) => void; theme: string; setTheme: (value:string)=>void; }) {
  const native = isNativeApp(); const api = (window as any).aeroslateNative || (window as any).dispatchlinkNative;
  const [gistId,setGistId]=useState(()=>loadLocal('aeroslate.records.gistId',''));
  const [gistToken,setGistToken]=useState(()=>loadLocal('aeroslate.records.gistToken',''));
  const [atisApi,setAtisApi]=useState(()=>loadLocal('aeroslate.atis.api',''));
  const [recordDefaults,setRecordDefaults]=useState<any>(()=>({role:'SIC',operation:'Part 91',rules:'IFR',crossCountry:true,autoDutyTimes:true,reportLeadMinutes:60,postFlightMinutes:15,defaultNight:0,defaultInstrument:0,defaultSimulatedInstrument:0,defaultDayLandings:0,defaultNightLandings:0,defaultApproaches:'',defaultRemarks:'',defaultSigner:'',dutyRegulation:'FAA Part 117',dutyRole:'Flightcrew',restBefore:10,maxDuty:13,maxFdp:13,minRest:10,...loadLocal('aeroslate.records.presets',{})}));
  const [startingTotals,setStartingTotals]=useState<any>(()=>({total:0,pic:0,sic:0,dual:0,instructor:0,night:0,instrument:0,simulatedInstrument:0,crossCountry:0,dayLandings:0,nightLandings:0,approaches:0,...loadLocal('aeroslate.records.startingTotals',{})}));
  const themes=[['ocean','Deep blue'],['midnight','Midnight'],['cobalt','Cobalt'],['slate','Slate'],['graphite','Graphite'],['arctic','Light']];
  const install = async () => { const prompt = (window as any).deferredPrompt; if (prompt) await prompt.prompt(); else notify('Use the browser menu and choose Add to Home Screen.'); };
  const changeBackend = async () => { if (!api?.setAppUrl) return; const current = await api.getAppUrl?.(); const next = window.prompt('Render service URL', current || 'https://your-aeroslate.onrender.com'); if (next) await api.setAppUrl(next); };
  const saveConnections=()=>{ saveLocal('aeroslate.records.gistId',gistId.trim()); saveLocal('aeroslate.records.gistToken',gistToken.trim()); saveLocal('aeroslate.atis.api',atisApi.trim()); notify('Connection and API settings saved on this device.'); };
  const saveRecordSettings=()=>{saveLocal('aeroslate.records.presets',recordDefaults);saveLocal('aeroslate.records.startingTotals',startingTotals);window.dispatchEvent(new CustomEvent('aeroslate-record-settings-updated'));notify('Logbook defaults and opening totals saved.');};
  const updateDefault=(key:string,value:any)=>setRecordDefaults((current:any)=>({...current,[key]:value}));
  const updateTotal=(key:string,value:any)=>setStartingTotals((current:any)=>({...current,[key]:Number(value)||0}));
  return <div className="content-grid two settings-grid">
    <Card title="Accounts & data sources" icon={Link2}><div className="settings-fields"><label><span>GitHub Gist ID</span><input value={gistId} onChange={e=>setGistId(e.target.value)} placeholder="Private sync vault"/></label><label><span>GitHub token</span><input type="password" value={gistToken} onChange={e=>setGistToken(e.target.value)} placeholder="Gist permission only"/></label><label><span>D-ATIS API base URL</span><input value={atisApi} onChange={e=>setAtisApi(e.target.value)} placeholder="Optional custom provider"/></label></div><button className="primary" onClick={saveConnections}>Save connections</button></Card>
    <Card title="Appearance" icon={Settings}><p className="muted">Choose a professional device-local AeroSlate theme.</p><div className="theme-grid">{themes.map(([id,label])=><button key={id} className={theme===id?'active':''} onClick={()=>setTheme(id)}><i className={`theme-swatch ${id}`}/><span>{label}</span></button>)}</div></Card>
    <Card title="Logbook entry defaults" icon={BookOpenCheck}><div className="settings-fields logbook-settings"><label><span>Crew role</span><select value={recordDefaults.role} onChange={e=>updateDefault('role',e.target.value)}><option>PIC</option><option>SIC</option><option>Dual</option><option>Instructor</option></select></label><label><span>Operation</span><select value={recordDefaults.operation} onChange={e=>updateDefault('operation',e.target.value)}>{['Part 91','Part 121','Part 135','EASA CAT','EASA NCC','EASA NCO','Training','Other'].map(v=><option key={v}>{v}</option>)}</select></label><label><span>Flight rules</span><select value={recordDefaults.rules} onChange={e=>updateDefault('rules',e.target.value)}><option>IFR</option><option>VFR</option></select></label><label><span>Duty scheme</span><select value={recordDefaults.dutyRegulation} onChange={e=>updateDefault('dutyRegulation',e.target.value)}>{['FAA Part 117','FAA Part 135','FAA Part 91 / company','EASA ORO.FTL.205','Company scheme','Other'].map(v=><option key={v}>{v}</option>)}</select></label><label><span>Duty role</span><select value={recordDefaults.dutyRole} onChange={e=>updateDefault('dutyRole',e.target.value)}>{['Flightcrew','PIC','SIC','Cabin crew','Other'].map(v=><option key={v}>{v}</option>)}</select></label><label><span>Report lead (min)</span><input type="number" value={recordDefaults.reportLeadMinutes} onChange={e=>updateDefault('reportLeadMinutes',Number(e.target.value))}/></label><label><span>Postflight (min)</span><input type="number" value={recordDefaults.postFlightMinutes} onChange={e=>updateDefault('postFlightMinutes',Number(e.target.value))}/></label><label><span>Rest before (hr)</span><input type="number" step="0.1" value={recordDefaults.restBefore} onChange={e=>updateDefault('restBefore',Number(e.target.value))}/></label><label><span>Max duty (hr)</span><input type="number" step="0.1" value={recordDefaults.maxDuty} onChange={e=>updateDefault('maxDuty',Number(e.target.value))}/></label><label><span>Max FDP (hr)</span><input type="number" step="0.1" value={recordDefaults.maxFdp} onChange={e=>updateDefault('maxFdp',Number(e.target.value))}/></label><label><span>Min rest (hr)</span><input type="number" step="0.1" value={recordDefaults.minRest} onChange={e=>updateDefault('minRest',Number(e.target.value))}/></label><label><span>Default night (hr)</span><input type="number" step="0.1" value={recordDefaults.defaultNight} onChange={e=>updateDefault('defaultNight',Number(e.target.value))}/></label><label><span>Default actual IMC (hr)</span><input type="number" step="0.1" value={recordDefaults.defaultInstrument} onChange={e=>updateDefault('defaultInstrument',Number(e.target.value))}/></label><label><span>Default simulated IMC</span><input type="number" step="0.1" value={recordDefaults.defaultSimulatedInstrument} onChange={e=>updateDefault('defaultSimulatedInstrument',Number(e.target.value))}/></label><label><span>Day landings</span><input type="number" value={recordDefaults.defaultDayLandings} onChange={e=>updateDefault('defaultDayLandings',Number(e.target.value))}/></label><label><span>Night landings</span><input type="number" value={recordDefaults.defaultNightLandings} onChange={e=>updateDefault('defaultNightLandings',Number(e.target.value))}/></label><label><span>Default approaches</span><input value={recordDefaults.defaultApproaches} onChange={e=>updateDefault('defaultApproaches',e.target.value)}/></label><label className="wide"><span>Default remarks</span><input value={recordDefaults.defaultRemarks} onChange={e=>updateDefault('defaultRemarks',e.target.value)}/></label><label><span>Default signer</span><input value={recordDefaults.defaultSigner} onChange={e=>updateDefault('defaultSigner',e.target.value)}/></label></div><div className="settings-checks"><label><input type="checkbox" checked={recordDefaults.crossCountry} onChange={e=>updateDefault('crossCountry',e.target.checked)}/> Block time defaults to XC</label><label><input type="checkbox" checked={recordDefaults.autoDutyTimes} onChange={e=>updateDefault('autoDutyTimes',e.target.checked)}/> Auto-calculate duty times</label></div></Card>
    <Card title="Logbook opening totals" icon={Gauge}><p className="muted">Use these once when migrating an existing paper or electronic logbook. They are added to AeroSlate’s saved-entry totals without creating fake flight records.</p><div className="settings-fields opening-totals">{[['total','Total time'],['pic','PIC'],['sic','SIC'],['dual','Dual'],['instructor','Instructor'],['night','Night'],['instrument','Actual instrument'],['simulatedInstrument','Simulated instrument'],['crossCountry','Cross-country'],['dayLandings','Day landings'],['nightLandings','Night landings'],['approaches','Approaches']].map(([key,label])=><label key={key}><span>{label}</span><input type="number" step={key.includes('Landings')||key==='approaches'?'1':'0.1'} value={startingTotals[key]} onChange={e=>updateTotal(key,e.target.value)}/></label>)}</div><button className="primary" onClick={saveRecordSettings}>Save logbook settings</button></Card>
    <Card title="SimBrief synchronization" icon={Plane}><p>The account identifier imports the latest generated OFP and makes it the source for route, fuel, weather and NOTAMs.</p><div className="segmented"><button className={mode === 'username' ? 'active' : ''} onClick={() => setMode('username')}>Username</button><button className={mode === 'userid' ? 'active' : ''} onClick={() => setMode('userid')}>Pilot ID</button></div><label className="stacked-input"><span>{mode === 'username' ? 'SimBrief username' : 'Numeric Pilot ID'}</span><input value={simbriefKey} onChange={event => setSimbriefKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void importOFP(); }} /></label><div className="button-row"><button className="primary" onClick={() => void importOFP()} disabled={loading}>{loading ? <RefreshCw className="spin" /> : <Import />} {loading ? 'Synchronizing…' : 'Import latest OFP'}</button><button onClick={loadDemo}>Load demo</button></div></Card>
    <Card title="Provider workspaces" icon={Map}><p className="muted">Sign in inside each provider workspace once. AeroSlate uses persistent app storage so the authenticated SimBrief, Navigraph and VATSIM sessions survive tab changes and normal app restarts.</p><div className="connection-cards"><div className="ok"><Check /><span><strong>SimBrief</strong><small>In-app dispatch and tools</small></span></div><div className="ok"><Check /><span><strong>Navigraph Charts</strong><small>Persistent authenticated workspace</small></span></div><div className={runtime.simLinked ? 'ok' : 'blocked'}>{runtime.simLinked ? <Check /> : <X />}<span><strong>Simulator bridge</strong><small>{runtime.simLinked ? 'Connected' : 'Optional for flight data'}</small></span></div></div><button onClick={() => void refreshRuntime()}><RefreshCw size={15} /> Refresh status</button></Card>
    <Card title={native ? 'Native application' : 'Install AeroSlate'} icon={LayoutDashboard}>{native ? <button onClick={() => void changeBackend()}><Settings size={16} /> Change Render backend</button> : <button onClick={() => void install()}>Install / Add to Home Screen</button>}</Card>
  </div>;
}
