import crypto from 'node:crypto';
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
const tokenStore = new Map();
let lastSimHeartbeat = 0;

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'dispatchlink.sid',
  keys: [process.env.SESSION_SECRET || 'development-only-secret'],
  httpOnly: true,
  sameSite: appBaseUrl.startsWith('https://') ? 'none' : 'lax',
  secure: appBaseUrl.startsWith('https://'),
  maxAge: 30 * 24 * 60 * 60 * 1000
}));

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ensureSession(req) {
  if (!req.session.sid) req.session.sid = crypto.randomUUID();
  return req.session.sid;
}

function simLinked() {
  return Date.now() - lastSimHeartbeat < 20_000;
}

function navigraphConfigured() {
  return Boolean(process.env.NAVIGRAPH_CLIENT_ID && process.env.NAVIGRAPH_CLIENT_SECRET);
}

async function refreshTokensIfNeeded(sid) {
  const record = tokenStore.get(sid);
  if (!record) return null;
  if (record.expiresAt - Date.now() > 60_000) return record;
  if (!record.refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: record.refreshToken,
    client_id: process.env.NAVIGRAPH_CLIENT_ID,
    client_secret: process.env.NAVIGRAPH_CLIENT_SECRET
  });
  const response = await fetch('https://identity.api.navigraph.com/connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    tokenStore.delete(sid);
    return null;
  }
  const data = await response.json();
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || record.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    username: record.username
  };
  tokenStore.set(sid, next);
  return next;
}

async function requireNavigraph(req, res, next) {
  if (!chartsApproved) {
    return res.status(403).json({ error: 'Navigraph chart access is disabled until the application is approved by Navigraph.' });
  }
  if (!simLinked()) {
    return res.status(403).json({ error: 'Start the simulator link. Chart access is limited to an active flight-simulator context.' });
  }
  const sid = ensureSession(req);
  try {
    const tokens = await refreshTokensIfNeeded(sid);
    if (!tokens) return res.status(401).json({ error: 'Navigraph sign-in required.' });
    req.navigraph = tokens;
    next();
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Navigraph authentication failed.' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dispatchlink-efb', time: new Date().toISOString() });
});

app.get('/api/runtime', (req, res) => {
  const sid = ensureSession(req);
  const tokens = tokenStore.get(sid);
  res.json({
    simLinked: simLinked(),
    chartsApproved,
    navigraphConfigured: navigraphConfigured(),
    navigraphSignedIn: Boolean(tokens),
    navigraphUsername: tokens?.username,
    mode: chartsApproved && simLinked() ? 'sim-linked' : 'standalone'
  });
});


app.options('/api/sim/heartbeat', (_req, res) => {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-methods', 'POST, OPTIONS');
  res.set('access-control-allow-headers', 'content-type, x-sim-link-token');
  res.sendStatus(204);
});

app.post('/api/sim/heartbeat', (req, res) => {
  res.set('access-control-allow-origin', '*');
  const supplied = String(req.get('x-sim-link-token') || req.body?.token || '');
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(simLinkToken);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Invalid simulator link token.' });
  }
  lastSimHeartbeat = Date.now();
  res.json({ ok: true, linkedUntil: new Date(lastSimHeartbeat + 20_000).toISOString() });
});

app.get('/api/simbrief', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const userid = typeof req.query.userid === 'string' ? req.query.userid.trim() : '';
  if (!username && !userid) return res.status(400).json({ error: 'Enter a SimBrief username or Pilot ID.' });
  if (username && !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return res.status(400).json({ error: 'Invalid SimBrief username.' });
  if (userid && !/^\d{1,12}$/.test(userid)) return res.status(400).json({ error: 'Invalid SimBrief Pilot ID.' });

  const key = userid ? `userid=${encodeURIComponent(userid)}` : `username=${encodeURIComponent(username)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${key}&json=1`, {
      signal: controller.signal,
      headers: { 'user-agent': 'DispatchLink-EFB/0.1' }
    });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: 'SimBrief did not return an OFP.', details: text.slice(0, 300) });
    const data = JSON.parse(text);
    res.set('cache-control', 'no-store');
    res.json(data);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'SimBrief request timed out.' : 'Unable to retrieve SimBrief OFP.';
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timer);
  }
});

app.get('/api/document', async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    const allowed = url.protocol === 'https:' && (url.hostname === 'www.simbrief.com' || url.hostname.endsWith('.simbrief.com'));
    if (!allowed) return res.status(400).json({ error: 'Only SimBrief documents can be proxied.' });
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return res.status(response.status).end();
    const type = response.headers.get('content-type') || 'application/octet-stream';
    res.set('content-type', type);
    res.set('cache-control', 'private, max-age=300');
    const bytes = Buffer.from(await response.arrayBuffer());
    res.send(bytes);
  } catch {
    res.status(400).json({ error: 'Invalid document URL.' });
  }
});

app.get('/api/navigraph/login', (req, res) => {
  if (!chartsApproved) return res.status(403).send('Navigraph chart access has not been approved for this application.');
  if (!simLinked()) return res.status(403).send('Start the simulator link before signing in to Navigraph.');
  if (!navigraphConfigured()) return res.status(503).send('Navigraph developer credentials are not configured.');

  ensureSession(req);
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));
  req.session.oauthState = state;
  req.session.pkceVerifier = verifier;

  const query = new URLSearchParams({
    client_id: process.env.NAVIGRAPH_CLIENT_ID,
    response_type: 'code',
    state,
    scope: 'openid offline_access fmsdata charts',
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  res.redirect(`https://identity.api.navigraph.com/connect/authorize?${query}`);
});

app.get('/api/navigraph/callback', async (req, res) => {
  const sid = ensureSession(req);
  if (!req.query.code || req.query.state !== req.session.oauthState) return res.status(400).send('Invalid Navigraph OAuth response.');
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(req.query.code),
      redirect_uri: redirectUri,
      client_id: process.env.NAVIGRAPH_CLIENT_ID,
      client_secret: process.env.NAVIGRAPH_CLIENT_SECRET,
      code_verifier: req.session.pkceVerifier
    });
    const response = await fetch('https://identity.api.navigraph.com/connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) return res.status(502).send(`Navigraph token exchange failed (${response.status}).`);
    const data = await response.json();
    const userResponse = await fetch('https://identity.api.navigraph.com/connect/userinfo', {
      headers: { authorization: `Bearer ${data.access_token}` }
    });
    const user = userResponse.ok ? await userResponse.json() : {};
    tokenStore.set(sid, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      username: user.preferred_username || 'Navigraph user'
    });
    delete req.session.oauthState;
    delete req.session.pkceVerifier;
    res.redirect('/?navigraph=connected');
  } catch {
    res.status(502).send('Navigraph sign-in failed.');
  }
});

app.post('/api/navigraph/logout', (req, res) => {
  const sid = ensureSession(req);
  tokenStore.delete(sid);
  res.json({ ok: true });
});

app.get('/api/navigraph/airport/:icao', requireNavigraph, async (req, res) => {
  const icao = req.params.icao.toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) return res.status(400).json({ error: 'Invalid ICAO identifier.' });
  const response = await fetch(`https://api.navigraph.com/v2/airport/${icao}`, {
    headers: { authorization: `Bearer ${req.navigraph.accessToken}` }
  });
  res.status(response.status).set('cache-control', 'no-store').send(await response.text());
});

app.get('/api/navigraph/charts/:icao', requireNavigraph, async (req, res) => {
  const icao = req.params.icao.toUpperCase();
  const version = req.query.version === 'CAO' ? 'CAO' : 'STD';
  const rules = ['IFR', 'VFR', 'ANY'].includes(String(req.query.rules)) ? String(req.query.rules) : 'IFR';
  if (!/^[A-Z0-9]{4}$/.test(icao)) return res.status(400).json({ error: 'Invalid ICAO identifier.' });
  const response = await fetch(`https://api.navigraph.com/v2/charts/${icao}?version=${version}&rules=${rules}`, {
    headers: { authorization: `Bearer ${req.navigraph.accessToken}` }
  });
  res.status(response.status).set('cache-control', 'no-store').send(await response.text());
});

app.get('/api/navigraph/chart-image', requireNavigraph, async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'api.navigraph.com' || !url.pathname.startsWith('/v2/charts/')) {
      return res.status(400).json({ error: 'Invalid Navigraph chart URL.' });
    }
    const response = await fetch(url, { headers: { authorization: `Bearer ${req.navigraph.accessToken}` } });
    if (!response.ok) return res.status(response.status).end();
    res.set('content-type', response.headers.get('content-type') || 'image/png');
    res.set('cache-control', 'no-store');
    res.set('pragma', 'no-cache');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.status(400).json({ error: 'Invalid chart URL.' });
  }
});

app.use(express.static(path.join(rootDir, 'dist'), { maxAge: '1h', index: false }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => console.log(`DispatchLink EFB listening on ${port}`));
