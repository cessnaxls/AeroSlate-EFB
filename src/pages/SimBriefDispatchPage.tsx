import { useEffect, useState } from 'react';
import { Check, ExternalLink, Import, Plane, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { FlightCandidate } from '../lib/dispatchlink';
import { ProviderPortal } from '../components/ProviderPortal';

interface Props {
  url: string;
  flight: FlightCandidate | null;
  staticId: string;
  loading: boolean;
  onImport: (staticId?: string, options?: { stayOnPage?: boolean; silent?: boolean }) => Promise<boolean>;
}

export function SimBriefDispatchPage({ url, flight, staticId, loading, onImport }: Props) {
  const dispatchPrefill = (() => {
    try {
      const params = new URL(url).searchParams;
      return {
        passengers: params.get('pax') || undefined,
        payload: params.get('as_payload_lbs') || params.get('payload') || params.get('manualpayload') || undefined,
        freight: params.get('as_freight_lbs') || params.get('cargo') || undefined
      };
    } catch { return {}; }
  })();
  const [watching, setWatching] = useState(true);
  const [synced, setSynced] = useState(false);
  const [lastCheck, setLastCheck] = useState('');

  useEffect(() => { setWatching(Boolean(url)); setSynced(false); setLastCheck(''); }, [url, staticId]);
  useEffect(() => {
    if (!watching || synced || !staticId || !url) return;
    let cancelled = false;
    const check = async () => {
      const success = await onImport(staticId, { stayOnPage: true, silent: true });
      if (cancelled) return;
      setLastCheck(`${new Date().toISOString().slice(11, 16)}z`);
      if (success) { setSynced(true); setWatching(false); }
    };
    const first = window.setTimeout(() => void check(), 8000);
    const timer = window.setInterval(() => void check(), 20000);
    return () => { cancelled = true; window.clearTimeout(first); window.clearInterval(timer); };
  }, [watching, synced, staticId, url, onImport]);

  if (!url) return <section className="card"><header><div><Plane size={18} /><h3>SimBrief dispatch</h3></div></header><div className="card-body empty-state"><Plane size={42} /><h2>No flight selected</h2><p>Choose a flight in Flight Finder and press Build in SimBrief.</p></div></section>;

  const manualSync = async () => {
    const success = await onImport(staticId, { stayOnPage: true });
    setLastCheck(`${new Date().toISOString().slice(11, 16)}z`);
    if (success) { setSynced(true); setWatching(false); }
  };

  return <div className="simbrief-workspace">
    <section className="card dispatch-control-card">
      <header><div><Plane size={18} /><h3>Dispatch workflow · {flight?.flightNumber || 'custom flight'}</h3></div><span className="pill good">TLR ENABLED</span></header>
      <div className="card-body">
        <div className="dispatch-steps">
          <div><span>1</span><strong>Review options</strong><small>Flight, aircraft, schedule and registration are prefilled.</small></div>
          <div><span>2</span><strong>Generate OFP</strong><small>SimBrief creates fuel, route, weather, NOTAMs, maps and runway analysis.</small></div>
          <div><span>3</span><strong>Automatic sync</strong><small>AeroSlate watches this flight ID and copies the generated OFP into every module.</small></div>
        </div>
        <div className="active-dispatch-summary"><div><span>Flight</span><strong>{flight?.flightNumber || '—'}</strong></div><div><span>Route</span><strong>{flight?.departure || '—'} → {flight?.arrival || '—'}</strong></div><div><span>Aircraft</span><strong>{flight?.aircraft || '—'} · {flight?.registration || '—'}</strong></div><div><span>Schedule</span><strong>{flight?.std || '—'} / {flight?.sta || '—'}</strong></div></div>
        <div className={`sync-banner ${synced ? 'synced' : watching ? 'watching' : ''}`}>{synced ? <Check size={17} /> : watching ? <Wifi size={17} /> : <WifiOff size={17} />}<div><strong>{synced ? 'OFP synchronized' : watching ? 'Waiting for SimBrief generation' : 'Automatic synchronization paused'}</strong><small>{synced ? 'Route, schedule, weather, fuel, runway analysis, documents and record drafts were updated.' : watching ? `Generate the OFP below. AeroSlate checks every 20 seconds${lastCheck ? ` · last check ${lastCheck}` : ''}.` : 'Re-arm the watcher or import manually after regenerating.'}</small></div></div>
        <div className="button-row"><button className="primary" onClick={() => void manualSync()} disabled={loading}>{loading ? <RefreshCw className="spin" size={17} /> : <Import size={17} />} {loading ? 'Synchronizing…' : 'Synchronize now'}</button><button onClick={() => { setSynced(false); setWatching(true); }}><Wifi size={15} /> Watch for regenerated OFP</button><button onClick={() => window.open(url, 'aeroslate-simbrief', 'popup=yes,width=1500,height=1000')}><ExternalLink size={15} /> Open external window</button></div>
        <div className="provider-capabilities"><span><Check size={14} /> Detailed navlog</span><span><Check size={14} /> NOTAMs and maps</span><span><Check size={14} /> Runway analysis / TLR</span><span><Check size={14} /> Stable flight ID</span></div>
      </div>
    </section>
    <section className="card provider-card"><ProviderPortal title="SimBrief Dispatch" url={url} windowName="aeroslate-simbrief" prefill={dispatchPrefill} autoPrefill description="The native AeroSlate app keeps the authenticated SimBrief session inside the app. Generate the OFP here; the flight watcher then imports it without leaving AeroSlate." /></section>
  </div>;
}
