import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 3000);
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
const redirectUri = process.env.NAVIGRAPH_REDIRECT_URI || `${appBaseUrl}/api/navigraph/callback`;
const chartsApproved = String(process.env.NAVIGRAPH_CHARTS_APPROVED).toLowerCase() === 'true';
const simLinkToken = process.env.SIM_LINK_TOKEN || 'development-sim-link';
const dataDir = process.env.DATA_DIR || path.join(rootDir, '.dispatchlink-data');
const tokenStore = new Map();
let lastSimHeartbeat = 0;
let latestTelemetry = null;
fs.mkdirSync(dataDir, { recursive: true });

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, frameguard: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'dispatchlink.sid',
  keys: [process.env.SESSION_SECRET || 'development-only-secret'],
  httpOnly: true,
  sameSite: appBaseUrl.startsWith('https://') ? 'none' : 'lax',
  secure: appBaseUrl.startsWith('https://'),
  maxAge: 30 * 24 * 60 * 60 * 1000
}));

function base64Url(buffer) { return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function ensureSession(req) { if (!req.session.sid) req.session.sid = crypto.randomUUID(); return req.session.sid; }
function simLinked() { return Date.now() - lastSimHeartbeat < 20_000; }
function navigraphConfigured() { return Boolean(process.env.NAVIGRAPH_CLIENT_ID && process.env.NAVIGRAPH_CLIENT_SECRET); }
function secureEqual(supplied, expected) {
  const a = Buffer.from(String(supplied || '')); const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function refreshTokensIfNeeded(sid) {
  const record = tokenStore.get(sid);
  if (!record) return null;
  if (record.expiresAt - Date.now() > 60_000) return record;
  if (!record.refreshToken) return null;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refreshToken, client_id: process.env.NAVIGRAPH_CLIENT_ID, client_secret: process.env.NAVIGRAPH_CLIENT_SECRET });
  const response = await fetch('https://identity.api.navigraph.com/connect/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) { tokenStore.delete(sid); return null; }
  const data = await response.json();
  const next = { accessToken: data.access_token, refreshToken: data.refresh_token || record.refreshToken, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, username: record.username };
  tokenStore.set(sid, next); return next;
}

async function requireNavigraph(req, res, next) {
  if (!chartsApproved) return res.status(403).json({ error: 'Navigraph chart API access is disabled until this application is approved by Navigraph.' });
  // Navigraph currently licenses Charts API use only within a virtual-environment context.
  if (!simLinked()) return res.status(403).json({ error: 'The approved Charts API mode requires an active simulator/virtual-environment link. Use the standalone Navigraph Charts portal handoff when the simulator is not connected.' });
  const sid = ensureSession(req);
  try {
    const tokens = await refreshTokensIfNeeded(sid);
    if (!tokens) return res.status(401).json({ error: 'Navigraph sign-in required.' });
    req.navigraph = tokens; next();
  } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Navigraph authentication failed.' }); }
}

function workspaceKey(req) {
  const key = String(req.get('x-workspace-key') || '');
  if (key.length < 12 || key.length > 256) throw new Error('Workspace key must contain 12–256 characters.');
  return key;
}
function workspacePath(key) { return path.join(dataDir, `${crypto.createHash('sha256').update(key).digest('hex')}.vault`); }
function encryptionKey(key) { return crypto.createHash('sha256').update(`dispatchlink-records:${key}`).digest(); }
function emptyWorkspace() { return { version: 1, logbook: [], duty: [], audit: [] }; }
function decryptWorkspace(key) {
  const file = workspacePath(key);
  if (!fs.existsSync(file)) return emptyWorkspace();
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
  const data = JSON.parse(plaintext.toString('utf8'));
  return { ...emptyWorkspace(), ...data };
}
function encryptWorkspace(key, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const payload = { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  const file = workspacePath(key); const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(payload), { mode: 0o600 }); fs.renameSync(temp, file);
}
function appendRecord(key, kind, data) {
  const workspace = decryptWorkspace(key);
  const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
  const previousHash = workspace.audit.at(-1)?.hash || 'GENESIS';
  const canonical = JSON.stringify({ id, kind, createdAt, data, previousHash });
  const auditHash = crypto.createHash('sha256').update(canonical).digest('hex');
  const record = { id, createdAt, data, previousHash, auditHash };
  workspace[kind].push(record);
  workspace.audit.push({ id, kind, createdAt, previousHash, hash: auditHash });
  encryptWorkspace(key, workspace);
  return record;
}
function csvEscape(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function recordsToCsv(records) {
  const keys = [...new Set(records.flatMap(record => Object.keys(record.data || {})))];
  const header = ['id', 'createdAt', ...keys, 'previousHash', 'auditHash'];
  return [header, ...records.map(record => [record.id, record.createdAt, ...keys.map(key => record.data?.[key] ?? ''), record.previousHash, record.auditHash])].map(row => row.map(csvEscape).join(',')).join('\r\n');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'dispatchlink-efb', time: new Date().toISOString() }));
app.get('/api/runtime', (req, res) => {
  const sid = ensureSession(req); const tokens = tokenStore.get(sid);
  res.json({ simLinked: simLinked(), chartsApproved, navigraphConfigured: navigraphConfigured(), navigraphSignedIn: Boolean(tokens), navigraphUsername: tokens?.username, mode: chartsApproved && simLinked() ? 'sim-linked' : 'standalone' });
});

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
  const allowed = ['simulator','simZulu','latitude','longitude','headingTrue','altitudeMslFt','altitudeAglFt','groundAltitudeM','groundSpeedKt','indicatedAirspeedKt','verticalSpeedFpm','onGround','parkingBrake','enginesRunning','surfaceType','surfaceCondition','tcalcDirectory','tcalcFile','aircraftTitle','registration','totalFuelLb','totalFuelKg','totalWeightLb','totalWeightKg'];
  const telemetry = {};
  for (const key of allowed) if (Object.hasOwn(req.body || {}, key)) telemetry[key] = req.body[key];
  latestTelemetry = { ...telemetry, receivedAt: new Date().toISOString() }; lastSimHeartbeat = Date.now();
  res.json({ ok: true, receivedAt: latestTelemetry.receivedAt });
});
app.get('/api/sim/telemetry', (_req, res) => { res.set('cache-control', 'no-store'); res.json({ linked: simLinked(), telemetry: simLinked() ? latestTelemetry : latestTelemetry }); });

app.get('/api/records', (req, res) => {
  try { const key = workspaceKey(req); const workspace = decryptWorkspace(key); res.set('cache-control', 'no-store').json({ logbook: workspace.logbook, duty: workspace.duty, auditCount: workspace.audit.length }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to read records.' }); }
});
app.post('/api/records/:kind', (req, res) => {
  try {
    const kind = req.params.kind;
    if (!['logbook', 'duty'].includes(kind)) return res.status(404).json({ error: 'Unknown record type.' });
    if (!req.body?.data || typeof req.body.data !== 'object') return res.status(400).json({ error: 'Record data is required.' });
    if (req.body.data.attested !== true || !String(req.body.data.signerName || '').trim()) return res.status(400).json({ error: 'A typed signer name and attestation are required.' });
    const record = appendRecord(workspaceKey(req), kind, req.body.data); res.status(201).json(record);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save record.' }); }
});
app.get('/api/records/export', (req, res) => {
  try {
    const kind = req.query.type === 'duty' ? 'duty' : 'logbook'; const workspace = decryptWorkspace(workspaceKey(req));
    if (req.query.format === 'json') { res.set('content-disposition', `attachment; filename="dispatchlink-${kind}.json"`); return res.json(workspace[kind]); }
    res.type('text/csv').set('content-disposition', `attachment; filename="dispatchlink-${kind}.csv"`).send(recordsToCsv(workspace[kind]));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to export records.' }); }
});

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
    const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${key}${staticQuery}&json=1`, { signal: controller.signal, headers: { 'user-agent': 'DispatchLink-EFB/0.3' } });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: 'SimBrief did not return an OFP.', details: text.slice(0, 300) });
    res.set('cache-control', 'no-store').json(JSON.parse(text));
  } catch (error) { res.status(502).json({ error: error?.name === 'AbortError' ? 'SimBrief request timed out.' : 'Unable to retrieve SimBrief OFP.' }); }
  finally { clearTimeout(timer); }
});
app.get('/api/document', async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    if (!(url.protocol === 'https:' && (url.hostname === 'www.simbrief.com' || url.hostname.endsWith('.simbrief.com')))) return res.status(400).json({ error: 'Only SimBrief documents can be proxied.' });
    const response = await fetch(url, { redirect: 'follow' }); if (!response.ok) return res.status(response.status).end();
    res.set('content-type', response.headers.get('content-type') || 'application/octet-stream').set('cache-control', 'private, max-age=300').send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(400).json({ error: 'Invalid document URL.' }); }
});

app.get('/api/navigraph/login', (req, res) => {
  if (!chartsApproved) return res.status(403).send('Navigraph chart API access has not been approved for this application.');
  if (!simLinked()) return res.status(403).send('The approved Charts API mode requires an active simulator/virtual-environment link.');
  if (!navigraphConfigured()) return res.status(503).send('Navigraph developer credentials are not configured.');
  ensureSession(req);
  const verifier = base64Url(crypto.randomBytes(48)); const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest()); const state = base64Url(crypto.randomBytes(24));
  req.session.oauthState = state; req.session.pkceVerifier = verifier;
  const query = new URLSearchParams({ client_id: process.env.NAVIGRAPH_CLIENT_ID, response_type: 'code', state, scope: 'openid offline_access fmsdata charts', redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256' });
  res.redirect(`https://identity.api.navigraph.com/connect/authorize?${query}`);
});
app.get('/api/navigraph/callback', async (req, res) => {
  const sid = ensureSession(req);
  if (!req.query.code || req.query.state !== req.session.oauthState) return res.status(400).send('Invalid Navigraph OAuth response.');
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri, client_id: process.env.NAVIGRAPH_CLIENT_ID, client_secret: process.env.NAVIGRAPH_CLIENT_SECRET, code_verifier: req.session.pkceVerifier });
    const response = await fetch('https://identity.api.navigraph.com/connect/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) return res.status(502).send(`Navigraph token exchange failed (${response.status}).`);
    const data = await response.json(); const userResponse = await fetch('https://identity.api.navigraph.com/connect/userinfo', { headers: { authorization: `Bearer ${data.access_token}` } }); const user = userResponse.ok ? await userResponse.json() : {};
    tokenStore.set(sid, { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, username: user.preferred_username || 'Navigraph user' });
    delete req.session.oauthState; delete req.session.pkceVerifier; res.redirect('/?navigraph=connected');
  } catch { res.status(502).send('Navigraph sign-in failed.'); }
});
app.post('/api/navigraph/logout', (req, res) => { tokenStore.delete(ensureSession(req)); res.json({ ok: true }); });
app.get('/api/navigraph/airport/:icao', requireNavigraph, async (req, res) => {
  const icao = req.params.icao.toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(icao)) return res.status(400).json({ error: 'Invalid ICAO identifier.' });
  const response = await fetch(`https://api.navigraph.com/v2/airport/${icao}`, { headers: { authorization: `Bearer ${req.navigraph.accessToken}` } }); res.status(response.status).set('cache-control', 'no-store').send(await response.text());
});
app.get('/api/navigraph/charts/:icao', requireNavigraph, async (req, res) => {
  const icao = req.params.icao.toUpperCase(); const version = req.query.version === 'CAO' ? 'CAO' : 'STD'; const rules = ['IFR', 'VFR', 'ANY'].includes(String(req.query.rules)) ? String(req.query.rules) : 'IFR';
  if (!/^[A-Z0-9]{4}$/.test(icao)) return res.status(400).json({ error: 'Invalid ICAO identifier.' });
  const response = await fetch(`https://api.navigraph.com/v2/charts/${icao}?version=${version}&rules=${rules}`, { headers: { authorization: `Bearer ${req.navigraph.accessToken}` } }); res.status(response.status).set('cache-control', 'no-store').send(await response.text());
});
app.get('/api/navigraph/chart-image', requireNavigraph, async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'api.navigraph.com' || !url.pathname.startsWith('/v2/charts/')) return res.status(400).json({ error: 'Invalid Navigraph chart URL.' });
    const response = await fetch(url, { headers: { authorization: `Bearer ${req.navigraph.accessToken}` } }); if (!response.ok) return res.status(response.status).end();
    res.set('content-type', response.headers.get('content-type') || 'image/png').set('cache-control', 'no-store').set('pragma', 'no-cache').send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(400).json({ error: 'Invalid chart URL.' }); }
});

app.use(express.static(path.join(rootDir, 'dist'), { maxAge: '1h', index: false }));
app.use((req, res, next) => { if (req.method !== 'GET' || req.path.startsWith('/api/')) return next(); res.sendFile(path.join(rootDir, 'dist', 'index.html')); });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(port, () => console.log(`DispatchLink EFB listening on ${port}`));
