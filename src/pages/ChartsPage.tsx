import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, PanelLeftOpen, PanelLeftClose, RefreshCw, Save, NotebookPen } from 'lucide-react';
import { isNativeApp } from '../components/ProviderPortal';
import type { AnyRecord, FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

const NAVIGRAPH_CURRENT_FLIGHT = 'https://charts.navigraph.com/flights/current';

type NoteScope = 'flight' | 'departure' | 'destination' | 'alternate' | 'chart';
interface ChartNotes {
  flight: string;
  departure: string;
  destination: string;
  alternate: string;
  chart: string;
  chartLabel: string;
  updatedAt: string;
}

function nativeApi(): any {
  return (window as any).aeroslateNative || (window as any).dispatchlinkNative;
}

function emptyNotes(): ChartNotes {
  return { flight: '', departure: '', destination: '', alternate: '', chart: '', chartLabel: '', updatedAt: '' };
}

function flightKey(flight: FlightSummary) {
  return `${flight.release || 'draft'}.${flight.origin || 'ORIG'}${flight.destination || 'DEST'}`;
}

function openNavigraph() {
  const api = nativeApi();
  if (api?.openProvider) return api.openProvider(NAVIGRAPH_CURRENT_FLIGHT, 'Navigraph Charts');
  const browser = (window as any).Capacitor?.Plugins?.Browser;
  if (browser?.open) return browser.open({ url: NAVIGRAPH_CURRENT_FLIGHT, presentationStyle: 'fullscreen' });
  window.open(NAVIGRAPH_CURRENT_FLIGHT, 'aeroslate-navigraph', 'popup=yes,width=1500,height=1000');
}

export function ChartsPage({ flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const native = isNativeApp();
  const webviewRef = useRef<any>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [scope, setScope] = useState<NoteScope>('flight');
  const storageKey = useMemo(() => `aeroslate.navigraph.notes.${flightKey(flight)}`, [flight.release, flight.origin, flight.destination]);
  const [notes, setNotes] = useState<ChartNotes>(() => loadLocal(storageKey, emptyNotes()));

  useEffect(() => setNotes(loadLocal(storageKey, emptyNotes())), [storageKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => saveLocal(storageKey, { ...notes, updatedAt: new Date().toISOString() }), 350);
    return () => window.clearTimeout(timer);
  }, [notes, storageKey]);

  const labels: Record<NoteScope, string> = {
    flight: `${flight.origin}–${flight.destination}`,
    departure: flight.origin || 'Departure',
    destination: flight.destination || 'Destination',
    alternate: flight.alternate || 'Alternate',
    chart: notes.chartLabel || 'Named chart'
  };

  const updateNote = (value: string) => setNotes(current => ({ ...current, [scope]: value }));
  const reload = () => {
    if (native && webviewRef.current?.reload) webviewRef.current.reload();
    else setReloadKey(value => value + 1);
  };

  return <div className={`navigraph-page ${expanded ? 'expanded' : ''}`}>
    <div className="navigraph-topbar">
      <div className="navigraph-heading">
        <strong>Navigraph Charts</strong>
        <span>{flight.origin} → {flight.destination}{flight.alternate && flight.alternate !== '—' ? ` · ALT ${flight.alternate}` : ''}</span>
      </div>
      <div className="navigraph-actions">
        <button onClick={reload}><RefreshCw size={16} /><span>Reload</span></button>
        <button onClick={() => setNotesOpen(value => !value)} className={notesOpen ? 'active' : ''}><NotebookPen size={16} /><span>Notes</span></button>
        <button onClick={() => setExpanded(value => !value)}>{expanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}<span>{expanded ? 'Restore' : 'Expand'}</span></button>
        <button onClick={() => void openNavigraph()}><ExternalLink size={16} /><span>Open</span></button>
      </div>
    </div>

    <div className={`navigraph-workspace ${notesOpen ? 'with-notes' : ''}`}>
      <section className="navigraph-provider-pane">
        {native ? <webview
          key={reloadKey}
          ref={webviewRef}
          className="navigraph-webview"
          src={NAVIGRAPH_CURRENT_FLIGHT}
          partition="persist:aeroslate-providers"
          allowpopups="true"
          webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no"
        /> : <>
          <iframe key={reloadKey} className="navigraph-iframe" src={NAVIGRAPH_CURRENT_FLIGHT} title="Navigraph Charts" allow="clipboard-read; clipboard-write; fullscreen" />
          <div className="navigraph-web-help">
            <span>When your browser blocks embedded provider pages, use Open to keep the authenticated Navigraph session in an in-app browser window.</span>
            <button className="primary" onClick={() => void openNavigraph()}><ExternalLink size={15} /> Open Navigraph</button>
          </div>
        </>}
      </section>

      {notesOpen && <aside className="navigraph-notes-pane">
        <header>
          <div><NotebookPen size={17} /><strong>Chart notes</strong></div>
          <small>Stored on this device for the active flight</small>
        </header>
        <div className="chart-note-tabs">
          {(Object.keys(labels) as NoteScope[]).map(item => <button key={item} className={scope === item ? 'active' : ''} onClick={() => setScope(item)}>{labels[item]}</button>)}
        </div>
        {scope === 'chart' && <label className="chart-label-field"><span>Chart name or procedure</span><input value={notes.chartLabel} onChange={event => setNotes(current => ({ ...current, chartLabel: event.target.value }))} placeholder="Example: ILS RWY 27L" /></label>}
        <textarea value={notes[scope]} onChange={event => updateNote(event.target.value)} placeholder={`Notes for ${labels[scope]}…`} />
        <div className="notes-status"><Save size={14} /><span>Autosaved locally</span></div>
        <div className="notes-guidance"><FileText size={15} /><p>These notes are stored separately from Navigraph. They persist across tab changes and app restarts, but do not alter or cache the Navigraph chart itself.</p></div>
      </aside>}
    </div>
  </div>;
}
