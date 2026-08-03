import { Clipboard, ExternalLink, FileText, Gauge, Plane, Wind } from 'lucide-react';
import { ProviderPortal } from '../components/ProviderPortal';
import { dig, getRunwayAnalysis, getWeather, weight, type AnyRecord, type FlightSummary } from '../lib/ofp';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; onOpenOFP: () => void; notify?: (message: string) => void; }

function metarValues(metar: string) {
  const wind = metar.match(/\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/i);
  const temp = metar.match(/\s(M?\d{2})\/(M?\d{2})\s/);
  const altA = metar.match(/\bA(\d{4})\b/); const altQ = metar.match(/\bQ(\d{4})\b/);
  return {
    wind: wind ? `${wind[1]}${wind[2]}${wind[3] || ''}KT` : '',
    temperature: temp ? temp[1].replace('M', '-') : '',
    altimeter: altA ? `${altA[1].slice(0, 2)}.${altA[1].slice(2)}` : altQ ? altQ[1] : ''
  };
}

export function RunwayAnalysisPage({ ofp, flight, onOpenOFP, notify }: Props) {
  const analysis = getRunwayAnalysis(ofp);
  const originMetar = getWeather(ofp, 'origin').metar;
  const destinationMetar = getWeather(ofp, 'destination').metar;
  const origin = metarValues(originMetar); const destination = metarValues(destinationMetar);
  const takeoffWeight = weight(ofp, 'weights.est_tow'); const landingWeight = weight(ofp, 'weights.est_ldw');
  const zfw = weight(ofp, 'weights.est_zfw'); const blockFuel = weight(ofp, 'fuel.plan_ramp');
  const toolsUrl = 'https://dispatch.simbrief.com/tools';
  const prefill = {
    origin: flight.origin, destination: flight.destination, aircraft: flight.aircraft, registration: flight.registration,
    departureRunway: flight.departureRunway, arrivalRunway: flight.arrivalRunway,
    takeoffWeight, landingWeight, zeroFuelWeight: zfw, blockFuel,
    departureWind: origin.wind, arrivalWind: destination.wind,
    departureTemperature: origin.temperature, arrivalTemperature: destination.temperature,
    departureAltimeter: origin.altimeter, arrivalAltimeter: destination.altimeter
  };
  const copyValues = async () => {
    const text = [`Aircraft: ${flight.aircraft} ${flight.registration}`, `Route: ${flight.origin}-${flight.destination}`, `Takeoff: RWY ${flight.departureRunway} · TOW ${takeoffWeight} ${flight.units} · ${originMetar}`, `Landing: RWY ${flight.arrivalRunway} · LDW ${landingWeight} ${flight.units} · ${destinationMetar}`].join('\n');
    await navigator.clipboard.writeText(text); notify?.('Runway-analysis values copied.');
  };

  return <div className="runway-tools-page">
    <section className="card runway-tools-summary"><header><div><Gauge size={18} /><h3>Runway analysis · SimBrief Tools</h3></div><span className={`pill ${ofp ? 'good' : 'warn'}`}>{ofp ? 'OFP VALUES LOADED' : 'LOAD AN OFP'}</span></header><div className="card-body">
      <div className="runway-input-strip"><div><span>Aircraft</span><strong>{flight.aircraft}</strong><small>{flight.registration}</small></div><div><span>Takeoff</span><strong>{flight.origin} RWY {flight.departureRunway}</strong><small>{takeoffWeight ? `${takeoffWeight.toLocaleString()} ${flight.units}` : 'No TOW'}</small></div><div><span>Landing</span><strong>{flight.destination} RWY {flight.arrivalRunway}</strong><small>{landingWeight ? `${landingWeight.toLocaleString()} ${flight.units}` : 'No LDW'}</small></div><div><span>Weather</span><strong>{origin.wind || '—'} / {destination.wind || '—'}</strong><small>Departure / arrival</small></div></div>
      <div className="button-row"><button onClick={copyValues}><Clipboard size={15} /> Copy values</button><button onClick={onOpenOFP}><FileText size={15} /> View OFP</button>{analysis.documents.map(document => <button key={document.url} onClick={() => window.open(document.url, 'aeroslate-tlr-document')}><ExternalLink size={15} /> {document.title}</button>)}</div>
    </div></section>
    <section className="card provider-card runway-provider"><ProviderPortal title="SimBrief Tools" url={toolsUrl} windowName="aeroslate-simbrief-tools" autoPrefill prefill={prefill} description="AeroSlate loads SimBrief Tools in-app and applies the active OFP’s aircraft, runways, weights and weather to matching fields." /></section>
    {analysis.text && <section className="card"><header><div><Plane size={18} /><h3>Generated OFP runway-analysis section</h3></div><button onClick={async () => { await navigator.clipboard.writeText(analysis.text); notify?.('TLR text copied.'); }}><Clipboard size={15} /> Copy</button></header><div className="card-body"><pre className="tlr-report">{analysis.text}</pre></div></section>}
    {!analysis.text && <div className="notice runway-note"><Wind size={18} /><div><strong>SimBrief Tools is the interactive workspace.</strong><p>The imported OFP still supplies the active weights, runway selections, weather and any generated TLR document. AeroSlate does not substitute a generic performance formula.</p></div></div>}
  </div>;
}
