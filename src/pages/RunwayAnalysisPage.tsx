import { Clipboard, ExternalLink, FileText, Gauge, Plane, Wind } from 'lucide-react';
import { ProviderPortal } from '../components/ProviderPortal';
import {
  getRunwayAnalysis,
  getStructuredTlr,
  getWeather,
  weight,
  type AnyRecord,
  type FlightSummary,
  type TlrLandingDistance,
  type TlrRunway
} from '../lib/ofp';
import { useEffect, useMemo, useState } from 'react';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; onOpenOFP: () => void; notify?: (message: string) => void; }
interface LegacyRunwayResult { runway: string; phase: 'takeoff' | 'landing'; values: { label: string; value: string }[]; raw: string[]; }

function metarValues(metar: string) {
  const wind = metar.match(/\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/i);
  const temp = metar.match(/\s(M?\d{2})\/(M?\d{2})\s/);
  const altA = metar.match(/\bA(\d{4})\b/); const altQ = metar.match(/\bQ(\d{4})\b/);
  return { wind: wind ? `${wind[1]}${wind[2]}${wind[3] || ''}KT` : '', temperature: temp ? temp[1].replace('M', '-') : '', altimeter: altA ? `${altA[1].slice(0, 2)}.${altA[1].slice(2)}` : altQ ? altQ[1] : '' };
}
function labelForKey(key: string) {
  return key.replace(/[_-]+/g, ' ').replace(/\b(?:rwy|rw)\b/gi, 'Runway').replace(/\b\w/g, c => c.toUpperCase());
}
function parseLegacyRunwayResults(text: string): LegacyRunwayResult[] {
  if (!text.trim() || text.trim().startsWith('{')) return [];
  const lines = text.replace(/\r/g, '').split('\n').map(v => v.trim()).filter(Boolean);
  const results: LegacyRunwayResult[] = [];
  let phase: 'takeoff' | 'landing' = 'takeoff';
  let current: LegacyRunwayResult | null = null;
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
  return results;
}

const titleCase = (value: unknown) => String(value || '—').replace(/\b\w/g, c => c.toUpperCase());
const show = (value: unknown, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const integer = (value: number | null, suffix = '') => value === null ? '—' : `${Math.round(value).toLocaleString()}${suffix}`;
const signed = (value: number | null, suffix = '') => value === null ? '—' : `${value > 0 ? '+' : ''}${value}${suffix}`;
const windComponent = (value: number | null) => value === null ? '—' : value < 0 ? `${Math.abs(value)} kt tailwind` : `${value} kt headwind`;

function Value({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className={`tlr-value ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TakeoffPanel({ runway, plannedWeight }: { runway: TlrRunway; plannedWeight: number }) {
  const marginTone = runway.distanceMargin !== null && runway.distanceMargin < 500 ? 'danger' : runway.distanceMargin !== null && runway.distanceMargin < 1000 ? 'caution' : '';
  const weightMargin = runway.maxWeight !== null && plannedWeight ? runway.maxWeight - plannedWeight : null;
  return <div className="tlr-detail-grid">
    <section className="tlr-group"><h4>Runway</h4><div className="tlr-values">
      <Value label="TORA / TODA" value={`${integer(runway.tora, ' ft')} / ${integer(runway.toda, ' ft')}`} />
      <Value label="ASDA / LDA" value={`${integer(runway.asda, ' ft')} / ${integer(runway.lda, ' ft')}`} />
      <Value label="Elevation / gradient" value={`${integer(runway.elevation, ' ft')} / ${signed(runway.gradient, '%')}`} />
      <Value label="Course" value={`${integer(runway.magneticCourse, '°M')} · ${integer(runway.trueCourse, '°T')}`} />
      <Value label="Wind component" value={windComponent(runway.headwindComponent)} />
      <Value label="Crosswind" value={integer(runway.crosswindComponent === null ? null : Math.abs(runway.crosswindComponent), ' kt')} />
      <Value label="ILS" value={runway.ilsFrequency || 'None'} />
    </div></section>
    <section className="tlr-group"><h4>Configuration</h4><div className="tlr-values">
      <Value label="Flaps" value={runway.flapSetting || '—'} />
      <Value label="Thrust" value={runway.thrustSetting || '—'} />
      <Value label="Bleeds / anti-ice" value={`${runway.bleedSetting || '—'} / ${runway.antiIceSetting || '—'}`} />
      <Value label="Flex / max temp" value={`${show(runway.flexTemperature, '°C')} / ${show(runway.maxTemperature, '°C')}`} />
      <Value label="V1 / VR / V2" value={`${show(runway.v1)} / ${show(runway.vr)} / ${show(runway.v2)} kt`} />
      {runway.otherSpeed !== null && <Value label={runway.otherSpeedId || 'Other speed'} value={`${runway.otherSpeed} kt`} />}
    </div></section>
    <section className="tlr-group"><h4>Distances and limits</h4><div className="tlr-values">
      <Value label="Decision distance" value={integer(runway.distanceDecide, ' ft')} />
      <Value label="Accelerate-stop" value={integer(runway.distanceReject, ' ft')} />
      <Value label="Continue distance" value={integer(runway.distanceContinue, ' ft')} />
      <Value label="Available margin" value={integer(runway.distanceMargin, ' ft')} tone={marginTone} />
      <Value label="Maximum weight" value={integer(runway.maxWeight, ' lb')} />
      <Value label="Weight margin" value={weightMargin === null ? '—' : integer(weightMargin, ' lb')} tone={weightMargin !== null && weightMargin < 0 ? 'danger' : ''} />
      <Value label="Limit code" value={runway.limitCode || '—'} />
      {runway.limitObstacle && <Value label="Limiting obstacle" value={runway.limitObstacle} tone="caution" />}
    </div></section>
  </div>;
}

function LandingDistancePanel({ title, data }: { title: string; data: TlrLandingDistance | null }) {
  return <section className="tlr-distance-card"><h4>{title}</h4>{data ? <div className="tlr-values">
    <Value label="Reference weight" value={integer(data.weight, ' lb')} />
    <Value label="Flaps / VREF" value={`${data.flapSetting || '—'} / ${show(data.vref, ' kt')}`} />
    <Value label="Braking" value={data.brakeSetting || '—'} />
    <Value label="Reverser credit" value={data.reverserCredit || '—'} />
    <Value label="Actual distance" value={integer(data.actualDistance, ' ft')} />
    <Value label="Factored distance" value={integer(data.factoredDistance, ' ft')} />
  </div> : <div className="empty-inline">No {title.toLowerCase()} landing calculation was returned.</div>}</section>;
}

function LandingPanel({ runway, plannedWeight, dry, wet }: { runway: TlrRunway; plannedWeight: number; dry: TlrLandingDistance | null; wet: TlrLandingDistance | null }) {
  const dryMargin = dry?.factoredDistance !== null && dry?.factoredDistance !== undefined && runway.lda !== null ? runway.lda - dry.factoredDistance : null;
  const wetMargin = wet?.factoredDistance !== null && wet?.factoredDistance !== undefined && runway.lda !== null ? runway.lda - wet.factoredDistance : null;
  return <div className="tlr-detail-grid landing">
    <section className="tlr-group"><h4>Selected runway</h4><div className="tlr-values">
      <Value label="TORA / ASDA" value={`${integer(runway.tora, ' ft')} / ${integer(runway.asda, ' ft')}`} />
      <Value label="LDA" value={integer(runway.lda, ' ft')} />
      <Value label="Elevation / gradient" value={`${integer(runway.elevation, ' ft')} / ${signed(runway.gradient, '%')}`} />
      <Value label="Course" value={`${integer(runway.magneticCourse, '°M')} · ${integer(runway.trueCourse, '°T')}`} />
      <Value label="Wind component" value={windComponent(runway.headwindComponent)} />
      <Value label="Crosswind" value={integer(runway.crosswindComponent === null ? null : Math.abs(runway.crosswindComponent), ' kt')} />
      <Value label="ILS" value={runway.ilsFrequency || 'None'} />
      <Value label="Max dry / wet weight" value={`${integer(runway.maxWeightDry, ' lb')} / ${integer(runway.maxWeightWet, ' lb')}`} />
      <Value label="Planned landing weight" value={integer(plannedWeight || null, ' lb')} tone={runway.maxWeightDry !== null && plannedWeight > runway.maxWeightDry ? 'danger' : ''} />
    </div></section>
    <div className="tlr-distance-columns"><LandingDistancePanel title="Dry runway" data={dry} /><LandingDistancePanel title="Wet runway" data={wet} /></div>
    <section className="tlr-group"><h4>Factored margins</h4><div className="tlr-values">
      <Value label="Dry margin" value={integer(dryMargin, ' ft')} tone={dryMargin !== null && dryMargin < 0 ? 'danger' : dryMargin !== null && dryMargin < 500 ? 'caution' : ''} />
      <Value label="Wet margin" value={integer(wetMargin, ' ft')} tone={wetMargin !== null && wetMargin < 0 ? 'danger' : wetMargin !== null && wetMargin < 500 ? 'caution' : ''} />
      <Value label="Distance basis" value="Common SimBrief dry/wet result" />
    </div><p className="tlr-caveat">SimBrief supplies the dry and wet landing calculations once for the landing conditions. AeroSlate compares those factored distances with the selected runway’s LDA; it does not invent runway-specific landing calculations.</p></section>
  </div>;
}

export function RunwayAnalysisPage({ ofp, flight, onOpenOFP, notify }: Props) {
  const analysis = getRunwayAnalysis(ofp);
  const structured = useMemo(() => getStructuredTlr(ofp), [ofp]);
  const legacy = useMemo(() => parseLegacyRunwayResults(analysis.text), [analysis.text]);
  const [takeoffRunway, setTakeoffRunway] = useState('');
  const [landingRunway, setLandingRunway] = useState('');

  const takeoffOptions = structured.takeoff?.runways || [];
  const landingOptions = structured.landing?.runways || [];
  useEffect(() => {
    if (takeoffOptions.length) setTakeoffRunway(current => current && takeoffOptions.some(item => item.identifier === current) ? current : structured.takeoff?.conditions.plannedRunway || takeoffOptions[0].identifier);
    if (landingOptions.length) setLandingRunway(current => current && landingOptions.some(item => item.identifier === current) ? current : structured.landing?.conditions.plannedRunway || landingOptions[0].identifier);
  }, [ofp]);
  const selectedTakeoff = takeoffOptions.find(item => item.identifier === takeoffRunway) || takeoffOptions[0];
  const selectedLanding = landingOptions.find(item => item.identifier === landingRunway) || landingOptions[0];

  const originMetar = getWeather(ofp, 'origin').metar; const destinationMetar = getWeather(ofp, 'destination').metar;
  const origin = metarValues(originMetar); const destination = metarValues(destinationMetar);
  const takeoffWeight = structured.takeoff?.conditions.plannedWeight || weight(ofp, 'weights.est_tow');
  const landingWeight = structured.landing?.conditions.plannedWeight || weight(ofp, 'weights.est_ldw');
  const zfw = weight(ofp, 'weights.est_zfw'); const blockFuel = weight(ofp, 'fuel.plan_ramp');
  const toolsUrl = 'https://dispatch.simbrief.com/tools';
  const prefill = { origin: flight.origin, destination: flight.destination, aircraft: flight.aircraft, registration: flight.registration, departureRunway: selectedTakeoff?.identifier || flight.departureRunway, arrivalRunway: selectedLanding?.identifier || flight.arrivalRunway, takeoffWeight, landingWeight, zeroFuelWeight: zfw, blockFuel, departureWind: origin.wind, arrivalWind: destination.wind, departureTemperature: origin.temperature, arrivalTemperature: destination.temperature, departureAltimeter: origin.altimeter, arrivalAltimeter: destination.altimeter };
  const copyValues = async () => { await navigator.clipboard.writeText([`Aircraft: ${flight.aircraft} ${flight.registration}`, `Route: ${flight.origin}-${flight.destination}`, `Takeoff: RWY ${prefill.departureRunway} · TOW ${takeoffWeight} ${flight.units} · ${originMetar}`, `Landing: RWY ${prefill.arrivalRunway} · LDW ${landingWeight} ${flight.units} · ${destinationMetar}`].join('\n')); notify?.('Runway-analysis values copied.'); };

  return <div className="runway-tools-page">
    <section className="card runway-tools-summary"><header><div><Gauge size={18} /><h3>Runway analysis</h3></div><span className={`pill ${structured.available ? 'good' : ofp ? 'warn' : 'neutral'}`}>{structured.available ? 'SIMBRIEF TLR LOADED' : ofp ? 'NO STRUCTURED TLR' : 'LOAD AN OFP'}</span></header><div className="card-body"><div className="runway-input-strip"><div><span>Aircraft</span><strong>{flight.aircraft}</strong><small>{flight.registration}</small></div><div><span>Takeoff</span><strong>{structured.takeoff?.conditions.airportIcao || flight.origin} RWY {prefill.departureRunway}</strong><small>{takeoffWeight ? `${takeoffWeight.toLocaleString()} ${flight.units}` : 'No TOW'}</small></div><div><span>Landing</span><strong>{structured.landing?.conditions.airportIcao || flight.destination} RWY {prefill.arrivalRunway}</strong><small>{landingWeight ? `${landingWeight.toLocaleString()} ${flight.units}` : 'No LDW'}</small></div><div><span>Conditions</span><strong>{titleCase(structured.takeoff?.conditions.surfaceCondition)} / {titleCase(structured.landing?.conditions.surfaceCondition)}</strong><small>Takeoff / landing</small></div></div><div className="button-row"><button onClick={copyValues}><Clipboard size={15} /> Copy values</button><button onClick={onOpenOFP}><FileText size={15} /> View OFP</button>{analysis.documents.map(document => <button key={document.url} onClick={() => window.open(document.url, 'aeroslate-tlr-document')}><ExternalLink size={15} /> {document.title}</button>)}</div></div></section>

    {structured.available && <section className="runway-results structured-tlr"><div className="runway-results-header"><div><Gauge size={18}/><div><strong>SimBrief TLR</strong><span>Read-only performance values parsed directly from the imported OFP XML.</span></div></div></div><div className="tlr-phase-stack">
      {structured.takeoff && selectedTakeoff && <section className="runway-result-card"><header><div><Plane size={16}/><strong>Takeoff · {structured.takeoff.conditions.airportIcao}</strong><span className="planned-runway-tag">Planned RWY {structured.takeoff.conditions.plannedRunway}</span></div><select value={selectedTakeoff.identifier} onChange={event => setTakeoffRunway(event.target.value)}>{takeoffOptions.map(item => <option key={item.identifier} value={item.identifier}>Runway {item.identifier}</option>)}</select></header><div className="tlr-condition-strip"><span>Wind {show(structured.takeoff.conditions.windDirection, '°')}/{show(structured.takeoff.conditions.windSpeed, ' kt')}</span><span>OAT {show(structured.takeoff.conditions.temperature, '°C')}</span><span>Altimeter {structured.takeoff.conditions.altimeter || '—'}</span><span>{titleCase(structured.takeoff.conditions.surfaceCondition)}</span></div><TakeoffPanel runway={selectedTakeoff} plannedWeight={takeoffWeight} /></section>}
      {structured.landing && selectedLanding && <section className="runway-result-card"><header><div><Plane size={16}/><strong>Landing · {structured.landing.conditions.airportIcao}</strong><span className="planned-runway-tag">Planned RWY {structured.landing.conditions.plannedRunway}</span></div><select value={selectedLanding.identifier} onChange={event => setLandingRunway(event.target.value)}>{landingOptions.map(item => <option key={item.identifier} value={item.identifier}>Runway {item.identifier}</option>)}</select></header><div className="tlr-condition-strip"><span>Wind {show(structured.landing.conditions.windDirection, '°')}/{show(structured.landing.conditions.windSpeed, ' kt')}</span><span>OAT {show(structured.landing.conditions.temperature, '°C')}</span><span>Altimeter {structured.landing.conditions.altimeter || '—'}</span><span>Flaps {structured.landing.conditions.flapSetting || '—'}</span></div><LandingPanel runway={selectedLanding} plannedWeight={landingWeight} dry={structured.landing.dry} wet={structured.landing.wet} /></section>}
    </div></section>}

    {!structured.available && legacy.length > 0 && <section className="runway-results"><div className="runway-results-header"><div><Gauge size={18}/><div><strong>Legacy runway-analysis text</strong><span>This OFP did not expose structured TLR XML, so AeroSlate is showing the older text parser.</span></div></div></div><div className="runway-result-columns">{legacy.slice(0, 2).map(result => <section className="runway-result-card" key={`${result.phase}-${result.runway}`}><header><strong>{result.phase === 'takeoff' ? 'Takeoff' : 'Landing'} RWY {result.runway}</strong></header><div className="runway-result-grid">{result.values.map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></section>)}</div></section>}

    <section className="card provider-card runway-provider"><ProviderPortal title="SimBrief Tools" url={toolsUrl} windowName="aeroslate-simbrief-tools" autoPrefill prefill={prefill} description="AeroSlate keeps SimBrief Tools in-app and applies the active OFP’s aircraft, selected runways, weights and weather." /></section>

    {!structured.available && !legacy.length && <div className="notice runway-note"><Wind size={18} /><div><strong>No TLR data was returned in this OFP.</strong><p>Generate the SimBrief plan with Runway Analysis enabled, then import the latest OFP. AeroSlate will parse the returned <code>&lt;tlr&gt;</code> data directly.</p></div></div>}
  </div>;
}
