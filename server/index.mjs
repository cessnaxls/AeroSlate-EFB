import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
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

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'aeroslate-efb', version: '0.10.0', time: new Date().toISOString() }));
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
  const allowed = ['simulator','simZulu','latitude','longitude','headingTrue','altitudeMslFt','altitudeAglFt','groundAltitudeM','groundSpeedKt','indicatedAirspeedKt','verticalSpeedFpm','onGround','parkingBrake','enginesRunning','surfaceType','surfaceCondition','aircraftTitle','registration','totalFuelLb','totalFuelKg','totalWeightLb','totalWeightKg'];
  const telemetry = {};
  for (const key of allowed) if (Object.hasOwn(req.body || {}, key)) telemetry[key] = req.body[key];
  latestTelemetry = { ...telemetry, receivedAt: new Date().toISOString() }; lastSimHeartbeat = Date.now();
  res.json({ ok: true, receivedAt: latestTelemetry.receivedAt });
});
app.get('/api/sim/telemetry', (_req, res) => { res.set('cache-control', 'no-store'); res.json({ linked: simLinked(), telemetry: latestTelemetry }); });

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



function decodeHtml(value = '') {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function stripHtml(value = '') { return decodeHtml(String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function chartType(title = '') {
  const text = title.toUpperCase();
  if (text.includes('AIRPORT DIAGRAM')) return 'Airport diagram';
  if (text.includes('DEPARTURE') || text.includes('DP') || text.includes('SID')) return 'Departure';
  if (text.includes('ARRIVAL') || text.includes('STAR')) return 'Arrival';
  if (text.includes('MINIMUM')) return 'Minimums';
  if (text.includes('TAKEOFF')) return 'Takeoff minimums';
  return 'Approach';
}
app.get('/api/charts/faa', async (req, res) => {
  const airport = String(req.query.airport || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(airport)) return res.status(400).json({ error: 'Enter a valid US airport identifier.' });
  const ident = airport.length === 4 && airport.startsWith('K') ? airport.slice(1) : airport;
  try {
    const url = `https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?ident=${encodeURIComponent(ident)}`;
    const response = await fetch(url, { headers: { 'user-agent': 'AeroSlate-EFB/0.10.0' } });
    if (!response.ok) return res.status(response.status).json({ error: `FAA chart catalog returned HTTP ${response.status}.` });
    const html = await response.text();
    const charts = [];
    const seen = new Set();
    const rx = /<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = rx.exec(html))) {
      let href = decodeHtml(match[1]);
      if (href.startsWith('/')) href = `https://www.faa.gov${href}`;
      if (!href.startsWith('http')) href = new URL(href, url).toString();
      if (!/\.(pdf)(?:\?|$)/i.test(href) || seen.has(href)) continue;
      const title = stripHtml(match[2]) || 'FAA terminal procedure';
      if (!title || /legend|general information/i.test(title)) continue;
      seen.add(href);
      charts.push({ id: crypto.createHash('sha1').update(href).digest('hex').slice(0, 16), airport: airport.length === 3 ? `K${airport}` : airport, title, type: chartType(title), url: href });
    }
    charts.sort((a, b) => ({'Airport diagram':0,'Departure':1,'Arrival':2,'Approach':3,'Minimums':4,'Takeoff minimums':5}[a.type] ?? 9) - ({'Airport diagram':0,'Departure':1,'Arrival':2,'Approach':3,'Minimums':4,'Takeoff minimums':5}[b.type] ?? 9) || a.title.localeCompare(b.title));
    res.set('cache-control', 'public, max-age=21600').json({ airport: airport.length === 3 ? `K${airport}` : airport, source: 'FAA d-TPP', charts });
  } catch (error) { res.status(502).json({ error: 'Unable to retrieve the FAA chart catalog.' }); }
});
app.get('/api/charts/pdf', async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    const allowed = url.protocol === 'https:' && (url.hostname === 'aeronav.faa.gov' || url.hostname === 'www.faa.gov' || url.hostname.endsWith('.faa.gov'));
    if (!allowed || !/\.pdf(?:$|\?)/i.test(url.href)) return res.status(400).json({ error: 'Only official FAA chart PDFs can be proxied.' });
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'AeroSlate-EFB/0.10.0' } });
    if (!response.ok) return res.status(response.status).end();
    res.set('content-type', 'application/pdf').set('cache-control', 'public, max-age=21600').set('content-disposition', 'inline').send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(400).json({ error: 'Invalid FAA chart URL.' }); }
});

app.use(express.static(path.join(rootDir, 'dist'), { maxAge: '1h', index: false }));
app.use((req, res, next) => { if (req.method !== 'GET' || req.path.startsWith('/api/')) return next(); res.sendFile(path.join(rootDir, 'dist', 'index.html')); });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(port, () => console.log(`AeroSlate EFB listening on ${port}`));
