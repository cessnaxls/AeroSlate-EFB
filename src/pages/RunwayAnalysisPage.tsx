import { ClipboardCheck, ExternalLink, FileText, Gauge, Plane, RefreshCw, Wind } from 'lucide-react';
import { dig, getRunwayAnalysis, getWeather, numberText, weight, type AnyRecord, type FlightSummary } from '../lib/ofp';

interface Props {
  ofp: AnyRecord | null;
  flight: FlightSummary;
  onOpenOFP: () => void;
  onOpenSimBrief: () => void;
}

interface MetarPerformance {
  wind: string;
  temperature: string;
  altimeter: string;
}

function parseMetar(metar: string): MetarPerformance {
  const wind = metar.match(/\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/i);
  const temp = metar.match(/\s(M?\d{2})\/(M?\d{2})\s/);
  const altA = metar.match(/\bA(\d{4})\b/);
  const altQ = metar.match(/\bQ(\d{4})\b/);
  const temperature = temp ? `${temp[1].replace('M', '−')}°C / ${temp[2].replace('M', '−')}°C` : '—';
  const altimeter = altA ? `${altA[1].slice(0, 2)}.${altA[1].slice(2)} inHg` : altQ ? `${altQ[1]} hPa` : '—';
  return { wind: wind ? `${wind[1]}° / ${wind[2]}${wind[3] || ''} kt` : '—', temperature, altimeter };
}

function PerformanceAirport({ title, code, runway, metar, weightLabel, plannedWeight }: { title: string; code: string; runway: string; metar: string; weightLabel: string; plannedWeight: string }) {
  const parsed = parseMetar(metar);
  return <section className="performance-airport">
    <header><div><Plane size={17} /><h3>{title} · {code}</h3></div><span className="pill blue">RWY {runway || '—'}</span></header>
    <div className="status-list">
      <div><span>{weightLabel}</span><strong>{plannedWeight}</strong></div>
      <div><span>Wind</span><strong>{parsed.wind}</strong></div>
      <div><span>Temperature / dewpoint</span><strong>{parsed.temperature}</strong></div>
      <div><span>Pressure</span><strong>{parsed.altimeter}</strong></div>
    </div>
    <div className="weather-block compact-weather"><span>SimBrief METAR</span><p>{metar}</p></div>
  </section>;
}

export function RunwayAnalysisPage({ ofp, flight, onOpenOFP, onOpenSimBrief }: Props) {
  const analysis = getRunwayAnalysis(ofp);
  const originMetar = getWeather(ofp, 'origin').metar;
  const destinationMetar = getWeather(ofp, 'destination').metar;
  const takeoffWeight = weight(ofp, 'weights.est_tow');
  const landingWeight = weight(ofp, 'weights.est_ldw');
  const units = flight.units;
  const requested = String(dig(ofp, 'params.tlr', 'general.tlr') || '') === '1' || analysis.available;

  return <div className="content-grid two">
    <section className="card span-2 performance-status-card">
      <header><div><Gauge size={18} /><h3>SimBrief runway analysis</h3></div><span className={`pill ${analysis.available ? 'good' : requested ? 'warn' : 'bad'}`}>{analysis.available ? 'AVAILABLE' : requested ? 'REQUESTED' : 'NOT LOADED'}</span></header>
      <div className="card-body">
        <div className="workflow-callout">
          <div><strong>SimBrief is the performance backend.</strong><p>DispatchLink requests the SimBrief Runway Analysis option for every dispatched flight, then presents the returned TLR section and copies its flight, runway, weight, and weather inputs into this page.</p></div>
          <div className="button-row"><button className="primary" onClick={onOpenSimBrief}><RefreshCw size={16} /> Generate / update in SimBrief</button><button onClick={onOpenOFP}><FileText size={16} /> Open complete OFP</button></div>
        </div>
        {!ofp && <div className="notice warn"><strong>No generated OFP loaded</strong><p>Complete the flight in SimBrief, generate it with Runway Analysis enabled, then press “Import generated OFP.”</p></div>}
        {ofp && !analysis.available && <div className="notice warn"><strong>TLR was not exposed as a separate data section</strong><p>The loaded OFP may still contain the runway-analysis pages in its PDF. Open the full OFP below. Regenerating from the DispatchLink SimBrief page keeps <code>tlr=1</code> enabled.</p></div>}
      </div>
    </section>

    <PerformanceAirport title="Takeoff" code={flight.origin} runway={flight.departureRunway} metar={originMetar} weightLabel="Planned TOW" plannedWeight={takeoffWeight ? `${takeoffWeight.toLocaleString()} ${units}` : '—'} />
    <PerformanceAirport title="Landing" code={flight.destination} runway={flight.arrivalRunway} metar={destinationMetar} weightLabel="Planned LDW" plannedWeight={landingWeight ? `${landingWeight.toLocaleString()} ${units}` : '—'} />

    <section className="card span-2">
      <header><div><ClipboardCheck size={18} /><h3>Runway-analysis report</h3></div><div className="button-row">{analysis.text && <button onClick={() => navigator.clipboard.writeText(analysis.text)}>Copy TLR</button>}{analysis.documents.map(document => <button key={document.url} onClick={() => window.open(document.url, 'dispatchlink-tlr-document')}><ExternalLink size={15} /> {document.title}</button>)}</div></header>
      <div className="card-body">
        {analysis.text ? <pre className="tlr-report">{analysis.text}</pre> : <div className="empty-state compact-empty"><Wind size={38} /><h2>Runway analysis is in the SimBrief briefing package</h2><p>DispatchLink does not substitute a generic home-built distance formula for SimBrief’s aircraft/runway analysis. Use the full OFP button to view the generated TLR pages.</p></div>}
      </div>
    </section>

    <section className="card span-2">
      <header><div><Gauge size={18} /><h3>Data copied from the active OFP</h3></div></header>
      <div className="card-body"><div className="metric-strip mini"><div className="metric"><span>Aircraft</span><strong>{flight.aircraft}</strong><small>{flight.registration}</small></div><div className="metric"><span>Takeoff runway</span><strong>{flight.departureRunway}</strong></div><div className="metric"><span>Landing runway</span><strong>{flight.arrivalRunway}</strong></div><div className="metric"><span>Passengers</span><strong>{numberText(dig(ofp, 'weights.pax_count', 'general.passengers'))}</strong></div><div className="metric"><span>Payload</span><strong>{weight(ofp, 'weights.payload') ? `${weight(ofp, 'weights.payload').toLocaleString()} ${units}` : '—'}</strong></div></div></div>
    </section>
  </div>;
}
