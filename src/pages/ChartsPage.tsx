import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Map, MapPinned, NotebookPen, Upload } from 'lucide-react';
import { ChartWorkspace, type ChartSource } from '../components/ChartWorkspace';
import { ProviderPortal } from '../components/ProviderPortal';
import { getFlightMaps, getOFPDocument, type AnyRecord, type FlightSummary } from '../lib/ofp';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; source: ChartSource | null; setSource: (source: ChartSource | null) => void; }

export function ChartsPage({ ofp, flight, source, setSource }: Props) {
  const [view, setView] = useState<'navigraph' | 'binder'>('navigraph');
  const ofpPdf = getOFPDocument(ofp); const maps = getFlightMaps(ofp);
  useEffect(() => { if (!source && ofpPdf) setSource({ id: `ofp-${flight.release}`, title: `${flight.origin}-${flight.destination} OFP`, url: `/api/document?url=${encodeURIComponent(ofpPdf)}`, kind: 'pdf' }); }, [ofpPdf, flight.release]);
  const upload = (file?: File) => {
    if (!file) return; const url = URL.createObjectURL(file);
    setSource({ id: `local-${file.name}-${file.lastModified}`, title: file.name, url, kind: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image' }); setView('binder');
  };

  return <div className="charts-page">
    <div className="subnav-tabs provider-tabs"><button className={view === 'navigraph' ? 'active' : ''} onClick={() => setView('navigraph')}><Map size={17} /> Navigraph</button><button className={view === 'binder' ? 'active' : ''} onClick={() => setView('binder')}><NotebookPen size={17} /> Flight binder</button><label className="upload-button"><Upload size={16} /> Add PDF / image<input type="file" accept="image/*,.pdf,application/pdf" onChange={event => upload(event.target.files?.[0])} /></label></div>
    <section className={`workspace-pane ${view === 'navigraph' ? 'active' : ''}`}><section className="card provider-card charts-provider"><ProviderPortal title="Navigraph Charts" url="https://charts.navigraph.com/" windowName="aeroslate-navigraph" description="The official authenticated Navigraph Charts workspace is kept inside AeroSlate’s native provider frame." /></section></section>
    <section className={`workspace-pane ${view === 'binder' ? 'active' : ''}`}><div className="binder-layout"><aside className="card binder-sidebar"><header><div><FileText size={18} /><h3>Flight documents</h3></div></header><div className="card-body binder-links">
      {ofpPdf && <button className={source?.id.startsWith('ofp-') ? 'active' : ''} onClick={() => setSource({ id: `ofp-${flight.release}`, title: `${flight.origin}-${flight.destination} OFP`, url: `/api/document?url=${encodeURIComponent(ofpPdf)}`, kind: 'pdf' })}><FileText size={17} /><span><strong>SimBrief OFP</strong><small>Complete briefing package</small></span></button>}
      {maps.map(map => <button key={map.url} onClick={() => setSource({ id: `map-${map.url}`, title: map.title, url: `/api/document?url=${encodeURIComponent(map.url)}`, kind: map.url.toLowerCase().includes('.pdf') ? 'pdf' : 'image' })}><MapPinned size={17} /><span><strong>{map.title}</strong><small>SimBrief document</small></span></button>)}
      <button onClick={() => setView('navigraph')}><Map size={17} /><span><strong>Navigraph Charts</strong><small>Official live chart library</small></span></button>
      <button onClick={() => window.open('https://dispatch.simbrief.com/tools', 'aeroslate-simbrief-tools')}><ExternalLink size={17} /><span><strong>SimBrief Tools</strong><small>Runway analysis and utilities</small></span></button>
      {!ofpPdf && !maps.length && <p className="muted">Import a generated OFP to populate this binder.</p>}
    </div></aside><div className="binder-workspace"><ChartWorkspace source={source} /></div></div></section>
  </div>;
}
