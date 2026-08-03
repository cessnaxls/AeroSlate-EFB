import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatchlink-parser-'));

try {
  const compile = spawnSync('tsc', [
    path.join(root, 'src/lib/dispatchlink.ts'),
    '--target', 'ES2022',
    '--module', 'ES2022',
    '--moduleResolution', 'Bundler',
    '--lib', 'ES2022,DOM,DOM.Iterable',
    '--skipLibCheck',
    '--outDir', buildDir
  ], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (compile.status !== 0) throw new Error(`Parser test compilation failed:\n${compile.stdout}\n${compile.stderr}`);

  const compiledParserPath = path.join(buildDir, 'lib', 'dispatchlink.js');
  const airlineData = fs.readFileSync(path.join(root, 'src/data/airline-codes.json'), 'utf8');
  const compiledParser = fs.readFileSync(compiledParserPath, 'utf8').replace(/import airlineCodes from ['"]\.\.\/data\/airlineCodes['"];?/, `const airlineCodes = ${airlineData};`);
  fs.writeFileSync(compiledParserPath, compiledParser);
  const parser = await import(`${pathToFileURL(compiledParserPath).href}?test=${Date.now()}`);
  const airports = parser.airportMap(parser.parseAirportsDat(fs.readFileSync(path.join(root, 'public/data/airports.dat'), 'utf8')));
  const fixture = fs.readFileSync(path.join(here, 'fixtures/fr24-paste-formats.txt'), 'utf8');
  assert.ok(parser.AIRLINE_CODE_COUNT >= 500, `airline dictionary should contain at least 500 IATA/ICAO mappings, got ${parser.AIRLINE_CODE_COUNT}`);
  const venezuelaPaste = `Flight tracker map
Aviation data
Airports
Venezuela
Caracas
CCS/SVMI
Departures
TIME	FLIGHT	TO	AIRLINE	AIRCRAFT	STATUS
Sunday, Aug 02
3:30 PM	V0123	Maracaibo (MAR)	Conviasa	A320 (YV1000)	Scheduled
1:10 PM	QL456	Porlamar (PMV)	LASER Airlines	B737 (YV-5555)	Scheduled
* All times are in local timezone`;
  const venezuela = parser.parseFr24PasteDetailed(venezuelaPaste, airports);
  assert.equal(venezuela.flights.length, 2);
  assert.deepEqual(venezuela.flights.map(row => row.flightNumber), ['LER456', 'VCV123'], 'international airline codes should normalize and rows should sort chronologically');
  assert.equal(venezuela.flights[0].registration, 'YV-5555');
  assert.equal(venezuela.flights[1].registration, 'YV1000');

  const documents = fixture
    .split(/^\s*LOG IN\s*$/gmi)
    .map(value => value.trim())
    .filter(value => /Flight tracker map/i.test(value));

  assert.equal(documents.length, 4, 'fixture should contain the four requested FR24 paste formats');

  const expected = [
    ['airport-table', 100],
    ['airport-compact', 100],
    ['aircraft-history-cards', 33],
    ['aircraft-history-table', 33]
  ];

  for (let index = 0; index < documents.length; index += 1) {
    const result = parser.parseFr24PasteDetailed(documents[index], airports);
    assert.deepEqual(result.formats, [expected[index][0]], `format ${index + 1} should be detected`);
    assert.equal(result.flights.length, expected[index][1], `format ${index + 1} should parse every supplied row`);
    assert.ok(result.flights.every(row => row.departure !== '—' && row.arrival !== '—'), `format ${index + 1} should resolve routes`);
    assert.ok(result.flights.every(row => !/Estimated|Scheduled|Landed/i.test(row.flightNumber)), `format ${index + 1} should not parse status lines as flights`);
  }

  const desktopAirport = parser.parseFr24PasteDetailed(documents[0], airports);
  const compactAirport = parser.parseFr24PasteDetailed(documents[1], airports);
  const cardHistory = parser.parseFr24PasteDetailed(documents[2], airports);
  const tableHistory = parser.parseFr24PasteDetailed(documents[3], airports);

  for (const result of [desktopAirport, compactAirport, cardHistory, tableHistory]) {
    const jetBlue = result.flights.find(row => row.flightNumber === 'JBU1417');
    assert.ok(jetBlue, 'B61417 should normalize to JBU1417');
    assert.equal(jetBlue.departure, 'KJAX');
    assert.equal(jetBlue.arrival, 'KFLL');
    assert.equal(jetBlue.aircraft, 'A320');
    assert.equal(jetBlue.registration, 'N715JB');
    assert.equal(jetBlue.std, '19:35z', '3:35 PM Jacksonville local should convert to 19:35z on 2 Aug 2026');
  }

  assert.equal(cardHistory.flights.find(row => row.flightNumber === 'JBU1417')?.sta, '20:54z');
  assert.equal(cardHistory.flights.find(row => row.flightNumber === 'JBU1417')?.ete, '1:19');
  assert.equal(tableHistory.flights.find(row => row.flightNumber === 'JBU1417')?.sta, '20:54z');

  const privateFlight = desktopAirport.flights.find(row => row.registration === 'N482RK');
  assert.ok(privateFlight, 'blank flight-number rows should remain usable');
  assert.equal(privateFlight.flightNumber, 'N482RK');
  assert.equal(privateFlight.aircraft, 'BE40');
  assert.equal(privateFlight.arrival, 'KOPF');

  const compactOvernight = compactAirport.flights.find(row => row.flightNumber === 'SWA2162');
  const compactFirst = compactAirport.flights.find(row => row.flightNumber === 'JBU1417');
  const firstDate = new Date(`${compactFirst?.date} UTC`);
  const overnightDate = new Date(`${compactOvernight?.date} UTC`);
  assert.equal((overnightDate.getTime() - firstDate.getTime()) / 86400000, 1, 'compact schedules should detect midnight rollover');
  assert.equal(compactOvernight?.registration, 'N7748A', 'compact N-numbers must not consume the first airline-name letter');

  const combined = parser.parseFr24PasteDetailed(fixture, airports);
  assert.deepEqual(new Set(combined.formats), new Set(expected.map(([format]) => format)));
  const combinedJetBlue = combined.flights.find(row => row.flightNumber === 'JBU1417');
  assert.equal(combinedJetBlue?.sta, '20:54z', 'duplicate rows should merge richer history data into airport schedule rows');
  assert.equal(combinedJetBlue?.ete, '1:19');

  console.log(`Parser regression passed: ${expected.map(([format, count]) => `${format}=${count}`).join(', ')}`);
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
