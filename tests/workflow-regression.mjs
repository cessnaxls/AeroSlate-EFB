import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const airports = JSON.parse(fs.readFileSync(path.join(root, 'src/data/airports.catalog.json'), 'utf8'));
assert.equal(airports.length, 7692, 'bundled catalog should contain every valid ICAO row from airports.dat');
assert.ok(new Set(airports.map(item => item.country)).size > 200, 'country dropdown should have global coverage');
assert.ok(airports.some(item => item.country === 'United States' && item.size === 'large'), 'United States large-airport randomizer must have candidates');

const finder = fs.readFileSync(path.join(root, 'src/pages/FlightFinderPage.tsx'), 'utf8');
assert.match(finder, /Paste & Parse/);
assert.doesNotMatch(finder, /<textarea[^>]*fr24-paste/);
assert.doesNotMatch(finder, /<th>Source<\/th>/);
assert.match(finder, /<th>EQUIP<\/th>/);
assert.match(finder, /<th>REG<\/th>/);
assert.match(finder, /Random tail on FR24/);
assert.match(finder, /flightradar24\.com\/data\/aircraft/);
assert.match(finder, /> Tail<\/button>/);

const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.match(app, /page-panel/);
assert.match(app, /flightlogs/);
assert.match(app, /dutylogs/);
const chartsPage = fs.readFileSync(path.join(root, 'src/pages/ChartsPage.tsx'), 'utf8');
assert.match(chartsPage, /charts\.navigraph\.com\/flights\/current/);
assert.match(chartsPage, /persist:aeroslate-providers/);
assert.doesNotMatch(chartsPage, /aeroslate\.navigraph\.notes/);
assert.doesNotMatch(chartsPage, /api\/charts\/faa/);
assert.doesNotMatch(chartsPage, /pdfjs-dist/);
const runwayPage = fs.readFileSync(path.join(root, 'src/pages/RunwayAnalysisPage.tsx'), 'utf8');
assert.match(runwayPage, /https:\/\/dispatch\.simbrief\.com\/tools/);

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeroslate-workflow-'));
try {
  const compile = spawnSync('tsc', [path.join(root, 'src/lib/ofp.ts'), path.join(root, 'src/lib/dispatchlink.ts'), '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM,DOM.Iterable', '--skipLibCheck', '--outDir', buildDir], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (compile.status !== 0) throw new Error(`Workflow test compilation failed:\n${compile.stdout}\n${compile.stderr}`);
  const dispatchPath = path.join(buildDir, 'lib', 'dispatchlink.js');
  if (fs.existsSync(dispatchPath)) {
    const airlineData = fs.readFileSync(path.join(root, 'src/data/airline-codes.json'), 'utf8');
    fs.writeFileSync(dispatchPath, fs.readFileSync(dispatchPath, 'utf8').replace(/import airlineCodes from ['"]\.\.\/data\/airlineCodes['"]\;?/, `const airlineCodes = ${airlineData};`).replace('../data/aircraftWeights', '../data/aircraftWeights.js'));
  }
  const ofp = await import(`${pathToFileURL(path.join(buildDir, 'lib', 'ofp.js')).href}?test=${Date.now()}`);
  const dispatch = await import(`${pathToFileURL(dispatchPath).href}?test=${Date.now()}`);
  const dispatchPlan = dispatch.buildSimbriefDispatch({ id:'1', date:'03 Aug 2026', aircraft:'A20N', registration:'N377FR', flightNumber:'FFT2615', departure:'KLGA', arrival:'KMCO', std:'18:00z', sta:'21:03z', ete:'3:03' }, { pax:130, bags:105, bagWeight:4200, payload:28900, freight:1200 });
  const dispatchParams = new URL(dispatchPlan.url).searchParams;
  assert.equal(dispatchParams.get('pax'), '130');
  assert.equal(dispatchParams.get('payload'), null, 'manual payload is not a documented SimBrief URL parameter');
  assert.equal(dispatchParams.get('manualpayload'), null);
  assert.equal(dispatchParams.get('cargo'), '1.2', 'cargo is sent in thousands of pounds');
  assert.equal(dispatchParams.get('acdata'), null, 'manual ZFW avoids altering SimBrief passenger-weight assumptions');
  assert.equal(dispatchParams.get('manualzfw'), '128.1', 'manual ZFW is BOW + passenger/bag payload + freight, in thousands of pounds');
  assert.equal(dispatchParams.get('as_bow_lbs'), '98000');
  assert.equal(dispatchParams.get('as_zfw_lbs'), '128100');
  assert.equal(dispatchParams.get('as_payload_lbs'), '28900');
  assert.equal(dispatchParams.get('as_freight_lbs'), '1200');
  assert.equal(dispatchParams.get('freight'), null, 'SimBrief documents Freight as the cargo parameter');
  const sample = {
    origin: { icao_code: 'KIND', notams: [
      { text: 'KIND RWY 05R CLSD DLY 0200-1000' },
      { text: 'KIND ILS OR LOC RWY 23L AMDT 4A' },
      { text: 'KIND TOWER 912 FT AGL 2 NM EAST UNLIGHTED' }
    ] },
    destination: { icao_code: 'KORD' }, alternate: { icao_code: 'KMDW' }
  };
  const procedures = ofp.getProcedures({ general: { route: 'DCT ELOCO6 LLA DCT LEV Y290 DOWRY TEEKY4' }, navlog: { fix: [{ via_airway: 'ELOCO6' }, { via_airway: 'Y290' }, { via_airway: 'TEEKY4' }] } });
  assert.equal(procedures.sid, 'ELOCO6');
  assert.equal(procedures.star, 'TEEKY4');
  assert.equal(ofp.getSelcal({ aircraft: { selcal: { value: 'ABCD' } } }), 'AB-CD');
  const notams = ofp.getAllNotams(sample);
  assert.equal(notams.length, 3, 'complete NOTAM set should be retained');
  assert.equal(notams.find(item => /RWY 05R CLSD/.test(item.text))?.priority, 'critical');
  assert.equal(notams.find(item => /AMDT 4A/.test(item.text))?.priority, 'amendment');
  assert.equal(notams.find(item => /TOWER 912/.test(item.text))?.important, false, 'tower obstacle should remain in all NOTAMs without being promoted');

  const tlr = ofp.getStructuredTlr({ tlr: {
    takeoff: { conditions: { airport_icao: 'KMSP', planned_runway: '17', planned_weight: '154013', wind_direction: '160', wind_speed: '6', temperature: '24', altimeter: '29.91', surface_condition: 'dry' }, runway: [
      { identifier: '17', length_tora: '8000', length_toda: '8000', length_asda: '8000', length_lda: '8000', headwind_component: '6', crosswind_component: '1', flap_setting: '5', thrust_setting: 'D-TO', flex_temperature: '51', max_weight: '182200', speeds_v1: '142', speeds_vr: '142', speeds_v2: '149', distance_reject: '7482', distance_continue: '7998', distance_margin: '518' }
    ] },
    landing: { conditions: { airport_icao: 'KMDW', planned_runway: '31R', planned_weight: '148359', flap_setting: '40', wind_direction: '354', wind_speed: '4', temperature: '21', altimeter: '29.91', surface_condition: 'dry' }, distance_dry: { weight: '150000', flap_setting: '40', brake_setting: 'MAX MAN', reverser_credit: 'YES', speeds_vref: '139', actual_distance: '3030', factored_distance: '4230' }, distance_wet: { weight: '150000', flap_setting: '40', brake_setting: 'MAX MAN', reverser_credit: 'YES', speeds_vref: '139', actual_distance: '4205', factored_distance: '5581' }, runway: [
      { identifier: '31R', length_lda: '5826', ils_frequency: '109.90', max_weight_dry: '152800', max_weight_wet: '152800', headwind_component: '3', crosswind_component: '2' }
    ] }
  }});
  assert.equal(tlr.available, true, 'structured TLR should be detected');
  assert.equal(tlr.takeoff?.conditions.plannedRunway, '17');
  assert.equal(tlr.takeoff?.runways[0].v1, 142);
  assert.equal(tlr.takeoff?.runways[0].distanceMargin, 518);
  assert.equal(tlr.landing?.conditions.plannedRunway, '31R');
  assert.equal(tlr.landing?.dry?.factoredDistance, 4230);
  assert.equal(tlr.landing?.wet?.factoredDistance, 5581);
  assert.equal(tlr.landing?.runways[0].lda, 5826);
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
console.log(`Workflow regression passed: airports=${airports.length}, countries=${new Set(airports.map(item => item.country)).size}, Navigraph workspace, VATSIM/ATIS briefing, clipboard parser, NOTAM priorities, structured TLR`);

// v0.11.2 source regressions
{
  const dispatchSource = fs.readFileSync(path.join(root, 'src/lib/dispatchlink.ts'), 'utf8');
  assert.match(dispatchSource, /poundsToThousands/);
  assert.match(dispatchSource, /as_payload_lbs/);
  assert.match(dispatchSource, /calculateManualZfwLb/);
  assert.match(dispatchSource, /params\.set\('manualzfw'/);
  assert.match(dispatchSource, /as_freight_lbs/);
  const finderSource = fs.readFileSync(path.join(root, 'src/pages/FlightFinderPage.tsx'), 'utf8');
  assert.match(finderSource, /rememberAddedTripKey/);
  assert.match(finderSource, /loadAddedTripKeys/);
}
