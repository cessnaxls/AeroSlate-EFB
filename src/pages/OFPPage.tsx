import { Download, ExternalLink, FileText, Printer } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { type AnyRecord, type FlightSummary } from '../lib/ofp';
import { buildOFPpdf } from '../lib/ofpPdf';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; notify: (message: string) => void; }

export function OFPPage({ ofp, flight, notify }: Props) {
  const generated = useMemo(() => ofp ? buildOFPpdf(ofp, flight) : null, [ofp, flight]);
  const url = useMemo(() => generated ? URL.createObjectURL(new Blob([generated.bytes], { type: 'application/pdf' })) : '', [generated]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (!ofp || !generated) {
    return <section className="card ofp-pdf-empty"><div className="card-body"><FileText size={34}/><h2>No OFP loaded</h2><p>Import a SimBrief OFP to generate the flight-release PDF.</p></div></section>;
  }

  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = generated.filename;
    a.click();
    notify('OFP PDF downloaded.');
  };
  const open = () => window.open(url, '_blank', 'noopener,noreferrer');
  const print = () => {
    const win = window.open(url, '_blank');
    if (!win) return notify('Allow pop-ups to print the OFP.');
    window.setTimeout(() => win.print(), 900);
  };

  return <div className="ofp-pdf-workspace">
    <header className="ofp-pdf-toolbar">
      <div>
        <FileText size={18}/>
        <div><strong>{flight.airline}{flight.flightNumber} · {flight.origin}–{flight.destination}</strong><span>{generated.styleName} · Release {flight.release}</span></div>
      </div>
      <nav>
        <button onClick={download}><Download size={16}/>Download</button>
        <button onClick={print}><Printer size={16}/>Print</button>
        <button onClick={open}><ExternalLink size={16}/>Open</button>
      </nav>
    </header>
    <div className="ofp-pdf-viewer-shell">
      <iframe title={`${flight.airline}${flight.flightNumber} operational flight plan`} src={url} className="ofp-pdf-viewer" />
    </div>
  </div>;
}
