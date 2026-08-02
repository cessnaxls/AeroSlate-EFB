import { ExternalLink, Plane, RefreshCw } from 'lucide-react';
import type { FlightCandidate } from '../lib/dispatchlink';

export function SimBriefDispatchPage({ url, flight }: { url: string; flight: FlightCandidate | null }) {
  if (!url) return <section className="card"><header><div><Plane size={18} /><h3>SimBrief dispatch</h3></div></header><div className="card-body empty-state"><Plane size={42} /><h2>No flight selected</h2><p>Choose a flight in Flight Finder and press Build in SimBrief.</p></div></section>;
  return <section className="card simbrief-card">
    <header><div><Plane size={18} /><h3>SimBrief dispatch · {flight?.flightNumber || 'custom flight'}</h3></div><div className="button-row"><button onClick={() => document.getElementById('simbrief-frame')?.setAttribute('src', url)}><RefreshCw size={15} /> Reload</button><button className="primary" onClick={() => window.open(url, 'dispatchlink-simbrief', 'popup=yes,width=1500,height=1000')}><ExternalLink size={15} /> Open dispatch window</button></div></header>
    <div className="embedded-notice">DispatchLink remains open. SimBrief may refuse browser embedding through its own security headers; the named dispatch window is the reliable fallback and reuses the same window for every flight.</div>
    <iframe id="simbrief-frame" className="simbrief-frame" src={url} title="SimBrief dispatch" allow="clipboard-read; clipboard-write" />
  </section>;
}
