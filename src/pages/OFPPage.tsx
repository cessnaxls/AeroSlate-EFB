import { useMemo, useState } from 'react';
import { Clipboard, ExternalLink, FileText, Gauge, Plane, Route } from 'lucide-react';
import { ChartWorkspace, type ChartSource } from '../components/ChartWorkspace';
import { dig, getICAOFlightPlan, getOFPDocument, type AnyRecord, type FlightSummary } from '../lib/ofp';

interface Props {
  ofp: AnyRecord | null;
  flight: FlightSummary;
  notify: (message: string) => void;
}

export function OFPPage({ ofp, flight, notify }: Props) {
  const [view, setView] = useState<'document' | 'summary'>('document');
  const pdf = getOFPDocument(ofp);
  const source = useMemo<ChartSource | null>(() => pdf ? ({
    id: `simbrief-ofp-${flight.release}`,
    title: `${flight.origin}-${flight.destination} OFP`,
    url: `/api/document?url=${encodeURIComponent(pdf)}`,
    kind: 'pdf'
  }) : null, [pdf, flight.release, flight.origin, flight.destination]);
  const atc = getICAOFlightPlan(ofp);
  const remarks = String(dig(ofp, 'general.dx_rmk', 'params.manualrmk') || 'No dispatcher remarks.');

  const copyFpl = async () => {
    if (!atc) { notify('No ICAO flight plan was included in this OFP.'); return; }
    await navigator.clipboard.writeText(atc);
    notify('ICAO flight plan copied.');
  };

  return <div className="ofp-page">
    <div className="subnav-tabs">
      <button className={view === 'document' ? 'active' : ''} onClick={() => setView('document')}><FileText size={17} /> Briefing PDF</button>
      <button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}><Gauge size={17} /> Dispatch summary</button>
    </div>
    <div className={`workspace-pane ${view === 'document' ? 'active' : ''}`}><div className="embedded-document">
      <ChartWorkspace source={source} />
    </div></div>
    <div className={`workspace-pane ${view === 'summary' ? 'active' : ''}`}><div className="content-grid two">
      <section className="card span-2"><header><div><FileText size={18} /><h3>Operational flight plan</h3></div></header><div className="card-body"><div className="ofp-header"><div><span>{flight.airline}{flight.flightNumber}</span><strong>{flight.origin} → {flight.destination}</strong><small>{flight.aircraft} / {flight.registration}</small></div><div className="button-row"><button className="primary" disabled={!pdf} onClick={() => pdf && window.open(pdf, 'aeroslate-ofp')}><ExternalLink size={17} /> Open OFP</button><button onClick={copyFpl}><Clipboard size={16} /> Copy ICAO FPL</button></div></div></div></section>
      <section className="card"><header><div><Gauge size={18} /><h3>Dispatch parameters</h3></div></header><div className="card-body status-list">
        <div><span>Release</span><strong>{flight.release}</strong></div><div><span>Callsign</span><strong>{flight.callsign || '—'}</strong></div>
        <div><span>STD / STA</span><strong>{flight.schedOut} / {flight.schedIn}</strong></div><div><span>Block</span><strong>{flight.blockTime}</strong></div>
        <div><span>ETE</span><strong>{flight.ete}</strong></div><div><span>Cruise / CI</span><strong>{flight.cruiseAltitude} / {flight.costIndex}</strong></div>
      </div></section>
      <section className="card"><header><div><Route size={18} /><h3>Route</h3></div></header><div className="card-body"><div className="monospace block-text">{flight.route}</div></div></section>
      <section className="card span-2"><header><div><Plane size={18} /><h3>ICAO flight plan</h3></div><button onClick={copyFpl}><Clipboard size={15} /> Copy</button></header><div className="card-body"><pre className="flightplan-text">{atc || 'No ICAO flight plan available.'}</pre></div></section>
      <section className="card span-2"><header><div><FileText size={18} /><h3>Dispatcher remarks</h3></div></header><div className="card-body"><div className="block-text">{remarks}</div></div></section>
    </div></div>
  </div>;
}
