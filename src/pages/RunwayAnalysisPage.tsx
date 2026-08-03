import { Clipboard, ExternalLink, FileText, Gauge, Plane, Wind } from 'lucide-react';
import { ProviderPortal } from '../components/ProviderPortal';
import { dig, getRunwayAnalysis, getWeather, weight, type AnyRecord, type FlightSummary } from '../lib/ofp';
import { useMemo, useState } from 'react';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; onOpenOFP: () => void; notify?: (message: string) => void; }
interface RunwayResult { runway: string; phase: 'takeoff' | 'landing'; values: { label: string; value: string }[]; raw: string[]; }

function metarValues(metar: string) {
  const wind = metar.match(/\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/i);
  const temp = metar.match(/\s(M?\d{2})\/(M?\d{2})\s/);
  const altA = metar.match(/\bA(\d{4})\b/); const altQ = metar.match(/\bQ(\d{4})\b/);
  return { wind: wind ? `${wind[1]}${wind[2]}${wind[3] || ''}KT` : '', temperature: temp ? temp[1].replace('M', '-') : '', altimeter: altA ? `${altA[1].slice(0, 2)}.${altA[1].slice(2)}` : altQ ? altQ[1] : '' };
}
function labelForKey(key: string) {
  return key.replace(/[_-]+/g, ' ').replace(/\b(?:rwy|rw)\b/gi, 'Runway').replace(/\b\w/g, c => c.toUpperCase());
}
function parseRunwayResults(text: string): RunwayResult[] {
  if (!text.trim()) return [];
  const lines = text.replace(/\r/g, '').split('\n').map(v => v.trim()).filter(Boolean);
  const results: RunwayResult[] = [];
  let phase: 'takeoff' | 'landing' = 'takeoff';
  let current: RunwayResult | null = null;
  const flush = () => { if (current && (current.values.length || current.raw.length)) results.push(current); current = null; };
  for (const line of lines) {
    if (/\bLANDING\b|\bARRIVAL\b/i.test(line) && !/TAKEOFF/i.test(line)) { flush(); phase = 'landing'; continue; }
    if (/\bTAKEOFF\b|\bDEPARTURE\b/i.test(line)) { flush(); phase = 'takeoff'; continue; }
    const runway = line.match(/\b(?:RWY|RUNWAY)\s*([0-3]?\d[LRC]?)\b/i)?.[1];
    if (runway) { flush(); current = { runway: runway.toUpperCase(), phase, values: [], raw: [] }; }
    if (!current) continue;
    const pairs = [...line.matchAll(/([A-Z][A-Z0-9 _/()-]{1,24})\s*[:=]\s*([^|;]{1,45})/gi)];
    if (pairs.length) pairs.forEach(match => current?.values.push({ label: labelForKey(match[1].trim()), value: match[2].trim() }));
    else if (!runway || line.replace(/\s/g, '').length > 8) current.raw.push(line);
  }
  flush();
  const deduped = new Map<string, RunwayResult>();
  for (const result of results) {
    const key = `${result.phase}-${result.runway}`;
    const previous = deduped.get(key);
    if (!previous) deduped.set(key, result);
    else deduped.set(key, { ...previous, values: [...previous.values, ...result.values], raw: [...previous.raw, ...result.raw] });
  }
  return [...deduped.values()];
}

export function RunwayAnalysisPage({ ofp, flight, onOpenOFP, notify }: Props) {
  const analysis = getRunwayAnalysis(ofp);
  const parsed = useMemo(() => parseRunwayResults(analysis.text), [analysis.text]);
  const takeoffOptions = parsed.filter(item => item.phase === 'takeoff');
  const landingOptions = parsed.filter(item => item.phase === 'landing');
  const [takeoffRunway, setTakeoffRunway] = useState(''); const [landingRunway, setLandingRunway] = useState('');
  const selectedTakeoff = takeoffOptions.find(item => item.runway === (takeoffRunway || flight.departureRunway)) || takeoffOptions[0];
  const selectedLanding = landingOptions.find(item => item.runway === (landingRunway || flight.arrivalRunway)) || landingOptions[0];
  const originMetar = getWeather(ofp, 'origin').metar; const destinationMetar = getWeather(ofp, 'destination').metar;
  const origin = metarValues(originMetar); const destination = metarValues(destinationMetar);
  const takeoffWeight = weight(ofp, 'weights.est_tow'); const landingWeight = weight(ofp, 'weights.est_ldw');
  const zfw = weight(ofp, 'weights.est_zfw'); const blockFuel = weight(ofp, 'fuel.plan_ramp');
  const toolsUrl = 'https://dispatch.simbrief.com/tools';
  const prefill = { origin: flight.origin, destination: flight.destination, aircraft: flight.aircraft, registration: flight.registration, departureRunway: selectedTakeoff?.runway || flight.departureRunway, arrivalRunway: selectedLanding?.runway || flight.arrivalRunway, takeoffWeight, landingWeight, zeroFuelWeight: zfw, blockFuel, departureWind: origin.wind, arrivalWind: destination.wind, departureTemperature: origin.temperature, arrivalTemperature: destination.temperature, departureAltimeter: origin.altimeter, arrivalAltimeter: destination.altimeter };
  const copyValues = async () => { await navigator.clipboard.writeText([`Aircraft: ${flight.aircraft} ${flight.registration}`, `Route: ${flight.origin}-${flight.destination}`, `Takeoff: RWY ${prefill.departureRunway} · TOW ${takeoffWeight} ${flight.units} · ${originMetar}`, `Landing: RWY ${prefill.arrivalRunway} · LDW ${landingWeight} ${flight.units} · ${destinationMetar}`].join('\n')); notify?.('Runway-analysis values copied.'); };
  const resultCard = (title: string, result: RunwayResult | undefined, phase: 'takeoff' | 'landing') => <section className="runway-result-card"><header><div><Plane size={16}/><strong>{title}</strong></div>{(phase === 'takeoff' ? takeoffOptions : landingOptions).length > 0 && <select value={result?.runway || ''} onChange={event => phase === 'takeoff' ? setTakeoffRunway(event.target.value) : setLandingRunway(event.target.value)}>{(phase === 'takeoff' ? takeoffOptions : landingOptions).map(item => <option key={item.runway} value={item.runway}>Runway {item.runway}</option>)}</select>}</header>{result ? <div className="runway-result-grid">{result.values.map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}{!result.values.length && result.raw.slice(0,12).map((line,index)=><p key={index}>{line}</p>)}</div> : <div className="empty-inline">No structured {phase} runway result was found in this OFP. Use SimBrief Tools above.</div>}</section>;

  return <div className="runway-tools-page">
    <section className="card runway-tools-summary"><header><div><Gauge size={18} /><h3>Runway analysis</h3></div><span className={`pill ${ofp ? 'good' : 'warn'}`}>{ofp ? 'OFP VALUES LOADED' : 'LOAD AN OFP'}</span></header><div className="card-body"><div className="runway-input-strip"><div><span>Aircraft</span><strong>{flight.aircraft}</strong><small>{flight.registration}</small></div><div><span>Takeoff</span><strong>{flight.origin} RWY {prefill.departureRunway}</strong><small>{takeoffWeight ? `${takeoffWeight.toLocaleString()} ${flight.units}` : 'No TOW'}</small></div><div><span>Landing</span><strong>{flight.destination} RWY {prefill.arrivalRunway}</strong><small>{landingWeight ? `${landingWeight.toLocaleString()} ${flight.units}` : 'No LDW'}</small></div><div><span>Weather</span><strong>{origin.wind || '—'} / {destination.wind || '—'}</strong><small>Departure / arrival</small></div></div><div className="button-row"><button onClick={copyValues}><Clipboard size={15} /> Copy values</button><button onClick={onOpenOFP}><FileText size={15} /> View OFP</button>{analysis.documents.map(document => <button key={document.url} onClick={() => window.open(document.url, 'aeroslate-tlr-document')}><ExternalLink size={15} /> {document.title}</button>)}</div></div></section>
    <section className="card provider-card runway-provider"><ProviderPortal title="SimBrief Tools" url={toolsUrl} windowName="aeroslate-simbrief-tools" autoPrefill prefill={prefill} description="AeroSlate keeps SimBrief Tools in-app and applies the active OFP’s aircraft, selected runways, weights and weather." /></section>
    {analysis.text && <section className="runway-results"><div className="runway-results-header"><div><Gauge size={18}/><div><strong>Parsed OFP runway results</strong><span>Select a runway to review its returned SimBrief values.</span></div></div></div><div className="runway-result-columns">{resultCard('Takeoff', selectedTakeoff, 'takeoff')}{resultCard('Landing', selectedLanding, 'landing')}</div></section>}
    {!analysis.text && <div className="notice runway-note"><Wind size={18} /><div><strong>SimBrief Tools is the interactive workspace.</strong><p>The imported OFP supplies the active weights, runway selections, weather and any generated TLR document. AeroSlate does not substitute generic performance formulas.</p></div></div>}
  </div>;
}
