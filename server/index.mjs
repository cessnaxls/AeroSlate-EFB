import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
const app = express();
const port = Number(process.env.PORT || 3000);
const simLinkToken = process.env.SIM_LINK_TOKEN || 'development-sim-link';
let lastSimHeartbeat = 0;
let latestTelemetry = null;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, frameguard: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '2mb' }));

function simLinked() { return Date.now() - lastSimHeartbeat < 20_000; }
function secureEqual(supplied, expected) {
  const a = Buffer.from(String(supplied || '')); const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'aeroslate-efb', version: packageVersion, time: new Date().toISOString() }));
app.get('/api/runtime', (_req, res) => res.json({
  simLinked: simLinked(),
  mode: simLinked() ? 'sim-linked' : 'standalone',
  providerMode: 'official-web-session'
}));

app.options(['/api/sim/heartbeat', '/api/sim/telemetry'], (_req, res) => {
  res.set('access-control-allow-origin', '*'); res.set('access-control-allow-methods', 'POST, GET, OPTIONS'); res.set('access-control-allow-headers', 'content-type, x-sim-link-token'); res.sendStatus(204);
});
app.post('/api/sim/heartbeat', (req, res) => {
  res.set('access-control-allow-origin', '*');
  if (!secureEqual(req.get('x-sim-link-token') || req.body?.token, simLinkToken)) return res.status(401).json({ error: 'Invalid simulator link token.' });
  lastSimHeartbeat = Date.now(); res.json({ ok: true, linkedUntil: new Date(lastSimHeartbeat + 20_000).toISOString() });
});
app.post('/api/sim/telemetry', (req, res) => {
  res.set('access-control-allow-origin', '*');
  if (!secureEqual(req.get('x-sim-link-token') || req.body?.token, simLinkToken)) return res.status(401).json({ error: 'Invalid simulator link token.' });
  const allowed = ['simulator','simZulu','simZuluSeconds','latitude','longitude','headingTrue','altitudeMslFt','altitudeAglFt','groundAltitudeM','groundSpeedKt','indicatedAirspeedKt','verticalSpeedFpm','onGround','parkingBrake','enginesRunning','surfaceType','surfaceCondition','aircraftTitle','registration','totalFuelLb','totalFuelKg','totalWeightLb','totalWeightKg'];
  const telemetry = {};
  for (const key of allowed) if (Object.hasOwn(req.body || {}, key)) telemetry[key] = req.body[key];
  latestTelemetry = { ...telemetry, receivedAt: new Date().toISOString() }; lastSimHeartbeat = Date.now();
  res.json({ ok: true, receivedAt: latestTelemetry.receivedAt });
});
app.get('/api/sim/telemetry', (_req, res) => { res.set('cache-control', 'no-store'); res.json({ linked: simLinked(), telemetry: latestTelemetry }); });


const AWC_BASE = 'https://aviationweather.gov/api/data';
const FD_REGIONS = ['bos','mia','chi','dfw','slc','sfo','sea','alaska','hawaii'];
function awcHeaders() { return { accept: 'application/json,text/plain;q=0.9,*/*;q=0.8', 'user-agent': `AeroSlate-EFB/${packageVersion} flight-planner` }; }
async function awcJson(pathname) {
  const response = await fetch(`${AWC_BASE}${pathname}`, { signal: AbortSignal.timeout(12000), headers: awcHeaders() });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`AviationWeather.gov returned HTTP ${response.status}`);
  return response.json();
}
function rawWeatherText(row, kind) {
  if (!row || typeof row !== 'object') return '';
  const fields = kind === 'metar' ? ['rawOb','raw_text','raw','metar','text'] : ['rawTAF','raw_text','raw','taf','text'];
  for (const key of fields) if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim();
  return '';
}
function stationId(row) { return String(row?.icaoId || row?.station_id || row?.stationId || row?.id || '').toUpperCase(); }
function decodeFdGroup(group, altitudeFt) {
  const value = String(group || '').trim().toUpperCase();
  if (!/^\d{4}/.test(value) || value.startsWith('////')) return { altitudeFt, direction: null, speedKt: null, tempC: null };
  let dd = Number(value.slice(0,2)); let ff = Number(value.slice(2,4));
  if (dd === 99 && ff === 0) { dd = 0; ff = 0; }
  else if (dd >= 51 && dd <= 86) { dd -= 50; ff += 100; }
  const direction = dd === 0 ? 0 : dd * 10;
  let tempC = null;
  const tail = value.slice(4);
  if (tail) {
    if (/^[+-]\d{2}$/.test(tail)) tempC = Number(tail);
    else if (/^\d{2}$/.test(tail)) tempC = altitudeFt >= 24000 ? -Number(tail) : Number(tail);
    else if (/^[+-]?\d{2}/.test(tail)) tempC = Number(tail.slice(0,3));
  }
  return { altitudeFt, direction, speedKt: ff, tempC: Number.isFinite(tempC) ? tempC : null };
}
function parseFdTable(text, wantedStations) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trimEnd());
  const headerIndex = lines.findIndex(line => /3000\s+6000\s+9000\s+12000/i.test(line));
  if (headerIndex < 0) return {};
  const levels = [...lines[headerIndex].matchAll(/\b(3000|6000|9000|12000|18000|24000|30000|34000|39000|45000|53000)\b/g)].map(match => Number(match[1]));
  const result = {};
  for (const line of lines.slice(headerIndex + 1)) {
    const parts = line.trim().split(/\s+/); if (parts.length < 2) continue;
    const station = parts[0].toUpperCase(); if (!wantedStations.has(station)) continue;
    const groups = parts.slice(1, levels.length + 1);
    result[station] = { station, valid: (text.match(/DATA BASED ON\s+([^\n]+)/i)?.[1] || '').trim(), levels: levels.map((alt, index) => decodeFdGroup(groups[index], alt)), source: 'NWS Aviation Weather Center FD winds/temps' };
  }
  return result;
}
async function fetchFdStations(stations, requestedAltitudes = []) {
  const wanted = new Set(stations.map(value => String(value || '').toUpperCase()).filter(value => /^[A-Z0-9]{3}$/.test(value)));
  const found = {}; if (!wanted.size) return found;
  const levels = requestedAltitudes.some(value => Number(value) > 39000) ? ['low','high'] : ['low'];
  for (const level of levels) for (const region of FD_REGIONS) {
    try {
      const response = await fetch(`https://aviationweather.gov/api/data/windtemp?level=${level}&region=${encodeURIComponent(region)}`, { signal: AbortSignal.timeout(9000), headers: awcHeaders() });
      if (!response.ok) continue;
      const parsed = parseFdTable(await response.text(), wanted);
      for (const [station, row] of Object.entries(parsed)) {
        if (!found[station]) found[station] = row;
        else { const merged = [...found[station].levels, ...row.levels]; const unique = new Map(merged.map(item => [item.altitudeFt, item])); found[station] = { ...found[station], levels:[...unique.values()].sort((a,b)=>a.altitudeFt-b.altitudeFt) }; }
      }
    } catch { /* continue through official regional products */ }
  }
  return found;
}
app.get('/api/planner/weather', async (req, res) => {
  const ids = String(req.query.ids || '').toUpperCase().split(',').map(value => value.trim()).filter(value => /^[A-Z0-9]{4}$/.test(value)).slice(0, 4);
  const windStations = String(req.query.windStations || '').toUpperCase().split(',').map(value => value.trim()).filter(value => /^[A-Z0-9]{3}$/.test(value)).slice(0, 4);
  const requestedAltitudes = String(req.query.altitudes || '').split(',').map(Number).filter(Number.isFinite);
  if (ids.length < 2) return res.status(400).json({ error: 'Departure and destination ICAO identifiers are required.' });
  try {
    const query = encodeURIComponent(ids.join(','));
    const [metars, tafs, winds] = await Promise.all([
      awcJson(`/metar?ids=${query}&format=json`),
      awcJson(`/taf?ids=${query}&format=json`),
      fetchFdStations(windStations, requestedAltitudes)
    ]);
    const stations = {};
    ids.forEach(icao => { stations[icao] = { icao, metar:'', taf:'', source:'NWS Aviation Weather Center' }; });
    for (const row of Array.isArray(metars) ? metars : []) { const id = stationId(row); if (stations[id]) { stations[id].metar = rawWeatherText(row,'metar'); stations[id].observedAt = row.reportTime || row.obsTime || row.receiptTime || ''; } }
    for (const row of Array.isArray(tafs) ? tafs : []) { const id = stationId(row); if (stations[id]) stations[id].taf = rawWeatherText(row,'taf'); }
    const warnings = [];
    for (const icao of ids) { if (!stations[icao].metar) warnings.push(`No current METAR returned for ${icao}.`); if (!stations[icao].taf) warnings.push(`No current TAF returned for ${icao}.`); }
    for (const station of windStations) if (!winds[station]) warnings.push(`No official FD winds/temps row was found for ${station}; the planner will use still-air cruise performance for that station.`);
    res.set('cache-control','no-store').json({ fetchedAt:new Date().toISOString(), source:'NOAA/NWS Aviation Weather Center', stations, winds, warnings });
  } catch (error) { res.status(502).json({ error:`Unable to retrieve current AviationWeather.gov planning data: ${error.message}` }); }
});

app.use('/api/records', (_req, res) => res.status(410).json({
  error: 'Server-side record storage is disabled on the free plan. AeroSlate saves locally and can synchronize an encrypted private GitHub Gist.'
}));

app.get('/api/simbrief', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const userid = typeof req.query.userid === 'string' ? req.query.userid.trim() : '';
  if (!username && !userid) return res.status(400).json({ error: 'Enter a SimBrief username or Pilot ID.' });
  if (username && !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return res.status(400).json({ error: 'Invalid SimBrief username.' });
  if (userid && !/^\d{1,12}$/.test(userid)) return res.status(400).json({ error: 'Invalid SimBrief Pilot ID.' });
  const staticId = typeof req.query.static_id === 'string' ? req.query.static_id.trim() : '';
  if (staticId && !/^[A-Za-z0-9_]{1,96}$/.test(staticId)) return res.status(400).json({ error: 'Invalid SimBrief static flight ID.' });
  const key = userid ? `userid=${encodeURIComponent(userid)}` : `username=${encodeURIComponent(username)}`;
  const staticQuery = staticId ? `&static_id=${encodeURIComponent(staticId)}` : '';
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${key}${staticQuery}&json=1`, { signal: controller.signal, headers: { 'user-agent': 'AeroSlate-EFB/0.8.0' } });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: 'SimBrief did not return an OFP.', details: text.slice(0, 300) });
    res.set('cache-control', 'no-store').json(JSON.parse(text));
  } catch (error) { res.status(502).json({ error: error?.name === 'AbortError' ? 'SimBrief request timed out.' : 'Unable to retrieve SimBrief OFP.' }); }
  finally { clearTimeout(timer); }
});



let vatsimCache = { time: 0, data: null };
async function getVatsimData() {
  if (vatsimCache.data && Date.now() - vatsimCache.time < 12000) return vatsimCache.data;
  const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json', { headers: { 'user-agent': 'AeroSlate-EFB/0.12.0' } });
  if (!response.ok) throw new Error(`VATSIM data returned ${response.status}`);
  const data = await response.json();
  vatsimCache = { time: Date.now(), data };
  return data;
}

function normalizeAtisPayload(payload, airport) {
  const records = Array.isArray(payload) ? payload : (payload?.data || payload?.atis || payload?.messages || payload?.results || [payload]);
  const list = Array.isArray(records) ? records : [records];
  return list.filter(Boolean).map((item, index) => {
    if (typeof item === 'string') return { id: `${airport}-${index}`, type: '', text: item, timestamp: '', source: 'Real-world D-ATIS' };
    const text = item.text || item.datis || item.atis || item.message || item.contents || item.raw || item.body || '';
    return {
      id: String(item.id || item.uuid || `${airport}-${index}`),
      type: String(item.type || item.kind || item.atis_type || item.category || ''),
      text: Array.isArray(text) ? text.join(' ') : String(text || ''),
      timestamp: String(item.timestamp || item.time || item.created_at || item.updated_at || item.received || ''),
      source: String(item.source || 'Real-world D-ATIS')
    };
  }).filter(item => item.text);
}

app.get('/api/atis', async (req, res) => {
  const airport = String(req.query.airport || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(airport)) return res.status(400).json({ error: 'A four-letter ICAO airport code is required.' });
  const result = { airport, realWorld: [], vatsim: [], warnings: [] };
  try {
    const data = await getVatsimData();
    result.vatsim = (data.atis || []).filter(item => String(item.callsign || '').toUpperCase().startsWith(airport)).map(item => ({
      callsign: item.callsign,
      frequency: item.frequency,
      code: item.atis_code || '',
      text: Array.isArray(item.text_atis) ? item.text_atis.join(' ') : String(item.text_atis || ''),
      updatedAt: item.last_updated || ''
    }));
  } catch (error) { result.warnings.push(`VATSIM ATIS unavailable: ${error.message}`); }
  const providers = [
    `https://atis.info/api/${airport}`,
    `https://datis.clowd.io/api/${airport.toLowerCase()}`
  ];
  for (const url of providers) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json', 'user-agent': 'AeroSlate-EFB/0.12.0' } });
      if (!response.ok) continue;
      const payload = await response.json();
      result.realWorld = normalizeAtisPayload(payload, airport);
      if (result.realWorld.length) break;
    } catch { /* try next public provider */ }
  }
  if (!result.realWorld.length) result.warnings.push('No current public real-world D-ATIS message was returned. Public ACARS-derived coverage can be delayed or unavailable.');
  res.set('cache-control', 'no-store');
  res.json(result);
});

app.get('/api/vatsim/flightplan', async (req, res) => {
  const callsign = String(req.query.callsign || '').trim().toUpperCase();
  const origin = String(req.query.origin || '').trim().toUpperCase();
  const destination = String(req.query.destination || '').trim().toUpperCase();
  if (!callsign) return res.status(400).json({ error: 'A callsign is required.' });
  try {
    const data = await getVatsimData();
    const candidates = [...(data.pilots || []).map(item => ({ ...item, source: 'online' })), ...(data.prefiles || []).map(item => ({ ...item, source: 'prefile' }))];
    const exact = candidates.find(item => String(item.callsign || '').toUpperCase() === callsign);
    const plan = exact?.flight_plan || null;
    const routeMatch = Boolean(plan && (!origin || String(plan.departure || '').toUpperCase() === origin) && (!destination || String(plan.arrival || '').toUpperCase() === destination));
    res.set('cache-control', 'no-store');
    res.json({ filed: Boolean(plan), routeMatch, source: exact?.source || null, callsign, flightPlan: plan, checkedAt: new Date().toISOString(), prefileUrl: 'https://my.vatsim.net/pilots/flightplan' });
  } catch (error) { res.status(502).json({ error: `Unable to verify the VATSIM flight plan: ${error.message}` }); }
});

app.get('/api/gates', async (req, res) => {
  const flight = String(req.query.flight || '').trim().toUpperCase();
  const origin = String(req.query.origin || '').trim().toUpperCase();
  const destination = String(req.query.destination || '').trim().toUpperCase();
  const date = String(req.query.date || '').trim();
  if (!/^[A-Z0-9]{2,8}$/.test(flight)) return res.status(400).json({ error: 'A valid flight number is required.' });
  const key = process.env.AERODATABOX_RAPIDAPI_KEY || '';
  if (!key) return res.json({ source: 'No live provider configured', message: 'No live gate provider is configured. Add AERODATABOX_RAPIDAPI_KEY in Render to enable live gate lookup.', departureGate: '', arrivalGate: '', updatedAt: new Date().toISOString() });
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0,10);
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flight)}/${day}`;
    const response = await fetch(url, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'aerodatabox.p.rapidapi.com', 'user-agent': 'AeroSlate-EFB/0.8.0' } });
    if (!response.ok) return res.status(response.status).json({ error: `Live gate provider returned HTTP ${response.status}.` });
    const rows = await response.json(); const list = Array.isArray(rows) ? rows : [rows];
    const row = list.find(item => String(item?.departure?.airport?.icao || '').toUpperCase() === origin && String(item?.arrival?.airport?.icao || '').toUpperCase() === destination) || list[0] || {};
    res.json({ departureGate: row?.departure?.gate || '', departureTerminal: row?.departure?.terminal || '', arrivalGate: row?.arrival?.gate || '', arrivalTerminal: row?.arrival?.terminal || '', source: 'AeroDataBox live flight status', updatedAt: new Date().toISOString(), message: 'Live gate data refreshed.' });
  } catch { res.status(502).json({ error: 'Unable to retrieve live gate data.' }); }
});

app.get('/api/document', async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    if (!(url.protocol === 'https:' && (url.hostname === 'www.simbrief.com' || url.hostname.endsWith('.simbrief.com')))) return res.status(400).json({ error: 'Only SimBrief documents can be proxied.' });
    const response = await fetch(url, { redirect: 'follow' }); if (!response.ok) return res.status(response.status).end();
    res.set('content-type', response.headers.get('content-type') || 'application/octet-stream').set('cache-control', 'private, max-age=300').send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(400).json({ error: 'Invalid document URL.' }); }
});



app.get('/sw.js', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(rootDir, 'dist', 'sw.js'));
});
app.use(express.static(path.join(rootDir, 'dist'), {
  maxAge: '1h',
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(port, () => console.log(`AeroSlate EFB listening on ${port}`));
