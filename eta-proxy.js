/**
 * ETA e-Invoice Proxy Server
 * ─────────────────────────
 * Handles CORS + optional digital signing for Egypt Tax Authority API.
 *
 * Install dependencies:
 *   npm install express node-fetch node-forge
 *
 * Run:
 *   node eta-proxy.js
 *
 * Optional: place your certificate file as eta-cert.pfx in this folder.
 * Set CERT_PASSWORD environment variable or enter it in app settings.
 *
 * Default port: 3030  (change with PORT env var)
 */

const express  = require('express');
const fetch    = require('node-fetch').default || require('node-fetch');
const forge    = require('node-forge');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');

const app  = express();
const PORT = process.env.PORT || 3030;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// CORS — allow only localhost origins
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.') || origin.startsWith('file://')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── ETA Endpoints ─────────────────────────────────────────────────────────
const ETA_ENDPOINTS = {
  preprod: {
    auth: 'https://id.preprod.eta.gov.eg/connect/token',
    api:  'https://api.preprod.eta.gov.eg/api/v1'
  },
  production: {
    auth: 'https://id.eta.gov.eg/connect/token',
    api:  'https://api.invoicing.eta.gov.eg/api/v1'
  }
};

// Token cache (per client_id)
const tokenCache = {};

// ── GET /ping ─────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', version: '1.0', service: 'ETA Proxy' });
});

// ── POST /eta/token ───────────────────────────────────────────────────────
app.post('/eta/token', async (req, res) => {
  const { env, clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'clientId و clientSecret مطلوبان' });
  }

  const cacheKey = `${env}:${clientId}`;
  const cached   = tokenCache[cacheKey];
  if (cached && Date.now() < cached.expiry) {
    return res.json({ access_token: cached.token, expires_in: Math.floor((cached.expiry - Date.now()) / 1000) });
  }

  try {
    const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).auth;
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      agent: new https.Agent({ rejectUnauthorized: true })
    });

    const data = await response.json();
    if (!response.ok) return res.status(401).json({ error: data.error_description || 'Authentication failed' });

    tokenCache[cacheKey] = {
      token:  data.access_token,
      expiry: Date.now() + (data.expires_in - 30) * 1000
    };

    res.json(data);
  } catch (err) {
    console.error('Token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /eta/submit ──────────────────────────────────────────────────────
app.post('/eta/submit', async (req, res) => {
  const { env, clientId, clientSecret, certPassword, document: doc, serialized } = req.body;
  if (!doc) return res.status(400).json({ error: 'الوثيقة مطلوبة' });

  try {
    // Get token
    const tokenRes = await getTokenInternal(env, clientId, clientSecret);

    // Sign document if certificate available
    let signature = '';
    const certPath = path.join(__dirname, 'eta-cert.pfx');
    if (fs.existsSync(certPath) && serialized) {
      try {
        signature = signDocument(certPath, certPassword || process.env.CERT_PASSWORD || '', serialized);
        console.log('✅ Document signed with certificate');
      } catch (signErr) {
        console.warn('⚠️  Signing skipped:', signErr.message);
      }
    } else {
      console.log('ℹ️  No certificate file found — submitting without signature (preprod testing)');
    }

    const finalDoc = {
      ...doc,
      signatures: signature ? [{ signatureType: 'I', value: signature }] : []
    };

    const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).api;
    const response = await fetch(`${endpoint}/documentsubmissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenRes}`
      },
      body: JSON.stringify({ documents: [finalDoc] })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);

  } catch (err) {
    console.error('Submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /eta/status/:submissionId ────────────────────────────────────────
app.post('/eta/status/:submissionId', async (req, res) => {
  const { env, clientId, clientSecret } = req.body;
  const { submissionId } = req.params;

  try {
    const token    = await getTokenInternal(env, clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).api;

    const response = await fetch(`${endpoint}/documentsubmissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /eta/document/:uuid ──────────────────────────────────────────────
app.post('/eta/document/:uuid', async (req, res) => {
  const { env, clientId, clientSecret } = req.body;
  const { uuid } = req.params;

  try {
    const token    = await getTokenInternal(env, clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).api;

    const response = await fetch(`${endpoint}/documents/${uuid}/raw`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /eta/cancel/:uuid ────────────────────────────────────────────────
app.post('/eta/cancel/:uuid', async (req, res) => {
  const { env, clientId, clientSecret, reason } = req.body;
  const { uuid } = req.params;

  try {
    const token    = await getTokenInternal(env, clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).api;

    const response = await fetch(`${endpoint}/documents/state/${uuid}/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'Cancelled', reason: reason || 'Cancelled by issuer' })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: internal token fetch ─────────────────────────────────────────
async function getTokenInternal(env, clientId, clientSecret) {
  const cacheKey = `${env}:${clientId}`;
  const cached   = tokenCache[cacheKey];
  if (cached && Date.now() < cached.expiry) return cached.token;

  const endpoint = (ETA_ENDPOINTS[env] || ETA_ENDPOINTS.preprod).auth;
  const body     = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error_description || 'Auth failed');
  }

  const data = await response.json();
  tokenCache[cacheKey] = { token: data.access_token, expiry: Date.now() + (data.expires_in - 30) * 1000 };
  return data.access_token;
}

// ── Helper: sign document with PKCS#12 certificate ───────────────────────
function signDocument(certPath, certPassword, serializedContent) {
  const pfxDer = fs.readFileSync(certPath).toString('binary');
  const pfxAsn = forge.asn1.fromDer(pfxDer);
  const pfx    = forge.pkcs12.pkcs12FromAsn1(pfxAsn, certPassword);

  // Extract private key and certificate
  let privateKey, certificate;
  for (const safeContent of pfx.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
        privateKey = safeBag.key;
      }
      if (safeBag.type === forge.pki.oids.certBag) {
        certificate = safeBag.cert;
      }
    }
  }

  if (!privateKey || !certificate) throw new Error('لم يتم العثور على المفتاح أو الشهادة في ملف PFX');

  // Create CMS signed data (detached)
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(serializedContent, 'utf8');
  p7.addCertificate(certificate);
  p7.addSigner({
    key:         privateKey,
    certificate: certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() }
    ]
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

// ── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, 'localhost', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   ETA e-Invoice Proxy — بوابة الفاتورة       ║
╠══════════════════════════════════════════════╣
║  Running on: http://localhost:${PORT}           ║
║  Status:     /ping                           ║
║                                              ║
║  Certificate file (optional):                ║
║    Place eta-cert.pfx in this folder         ║
║    Set CERT_PASSWORD env var                 ║
╚══════════════════════════════════════════════╝
  `);
});
