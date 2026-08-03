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
assert.match(chartsPage, /https:\/\/charts\.navigraph\.com\/flights\/current/);
const runwayPage = fs.readFileSync(path.join(root, 'src/pages/RunwayAnalysisPage.tsx'), 'utf8');
assert.match(runwayPage, /https:\/\/dispatch\.simbrief\.com\/tools/);

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeroslate-workflow-'));
try {
  const compile = spawnSync('tsc', [path.join(root, 'src/lib/ofp.ts'), path.join(root, 'src/lib/dispatchlink.ts'), '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM,DOM.Iterable', '--skipLibCheck', '--outDir', buildDir], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (compile.status !== 0) throw new Error(`Workflow test compilation failed:\n${compile.stdout}\n${compile.stderr}`);
  const ofp = await import(`${pathToFileURL(path.join(buildDir, 'ofp.js')).href}?test=${Date.now()}`);
  const sample = {
    origin: { icao_code: 'KIND', notams: [
      { text: 'KIND RWY 05R CLSD DLY 0200-1000' },
      { text: 'KIND ILS OR LOC RWY 23L AMDT 4A' },
      { text: 'KIND TOWER 912 FT AGL 2 NM EAST UNLIGHTED' }
    ] },
    destination: { icao_code: 'KORD' }, alternate: { icao_code: 'KMDW' }
  };
  const notams = ofp.getAllNotams(sample);
  assert.equal(notams.length, 3, 'complete NOTAM set should be retained');
  assert.equal(notams.find(item => /RWY 05R CLSD/.test(item.text))?.priority, 'critical');
  assert.equal(notams.find(item => /AMDT 4A/.test(item.text))?.priority, 'amendment');
  assert.equal(notams.find(item => /TOWER 912/.test(item.text))?.important, false, 'tower obstacle should remain in all NOTAMs without being promoted');
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
console.log(`Workflow regression passed: airports=${airports.length}, countries=${new Set(airports.map(item => item.country)).size}, persistent providers, clipboard parser, NOTAM priorities`);
