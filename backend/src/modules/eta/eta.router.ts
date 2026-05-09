import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const router = Router();

const ETA_ENDPOINTS = {
  preprod: {
    auth: 'https://id.preprod.eta.gov.eg/connect/token',
    api: 'https://api.preprod.eta.gov.eg/api/v1',
  },
  production: {
    auth: 'https://id.eta.gov.eg/connect/token',
    api: 'https://api.invoicing.eta.gov.eg/api/v1',
  },
} as const;

type EtaEnv = keyof typeof ETA_ENDPOINTS;

const tokenCache = new Map<string, { token: string; expiry: number }>();

async function getToken(env: EtaEnv, clientId: string, clientSecret: string): Promise<string> {
  const key = `${env}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.token;

  const endpoint = ETA_ENDPOINTS[env]?.auth ?? ETA_ENDPOINTS.preprod.auth;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    agent: new https.Agent({ rejectUnauthorized: true }),
  });

  const data = (await response.json()) as any;
  if (!response.ok) throw Object.assign(new Error(data.error_description || 'Auth failed'), { statusCode: 401 });

  tokenCache.set(key, { token: data.access_token, expiry: Date.now() + (data.expires_in - 30) * 1000 });
  return data.access_token;
}

function signDocument(certPath: string, certPassword: string, serialized: string): string {
  const pfxDer = fs.readFileSync(certPath).toString('binary');
  const pfxAsn = forge.asn1.fromDer(pfxDer);
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn, certPassword);

  let privateKey: forge.pki.PrivateKey | undefined;
  let certificate: forge.pki.Certificate | undefined;

  for (const sc of pfx.safeContents) {
    for (const bag of sc.safeBags) {
      if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key as forge.pki.PrivateKey;
      if (bag.type === forge.pki.oids.certBag) certificate = bag.cert;
    }
  }

  if (!privateKey || !certificate) throw new Error('لم يتم العثور على المفتاح أو الشهادة');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(serialized, 'utf8');
  p7.addCertificate(certificate);
  p7.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  (p7 as any).sign({ detached: true });

  const der = forge.asn1.toDer((p7 as any).toAsn1()).getBytes();
  return forge.util.encode64(der);
}

router.get('/ping', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '2.0', service: 'ETA Proxy' });
});

router.post('/token', async (req: Request, res: Response) => {
  const { env, clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    res.status(400).json({ error: 'clientId و clientSecret مطلوبان' });
    return;
  }
  try {
    const token = await getToken(env || 'preprod', clientId, clientSecret);
    res.json({ access_token: token });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/submit', async (req: Request, res: Response) => {
  const { env, clientId, clientSecret, certPassword, document: doc, serialized } = req.body;
  if (!doc) { res.status(400).json({ error: 'الوثيقة مطلوبة' }); return; }

  try {
    const token = await getToken(env || 'preprod', clientId, clientSecret);

    let signature = '';
    const certPath = path.join(process.cwd(), '..', 'eta-cert.pfx');
    if (fs.existsSync(certPath) && serialized) {
      try { signature = signDocument(certPath, certPassword || '', serialized); } catch {}
    }

    const finalDoc = { ...doc, signatures: signature ? [{ signatureType: 'I', value: signature }] : [] };
    const endpoint = (ETA_ENDPOINTS[env as EtaEnv] ?? ETA_ENDPOINTS.preprod).api;
    const response = await fetch(`${endpoint}/documentsubmissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ documents: [finalDoc] }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/status/:submissionId', async (req: Request, res: Response) => {
  const { env, clientId, clientSecret } = req.body;
  try {
    const token = await getToken(env || 'preprod', clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env as EtaEnv] ?? ETA_ENDPOINTS.preprod).api;
    const response = await fetch(`${endpoint}/documentsubmissions/${req.params.submissionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.status(response.status).json(await response.json());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/document/:uuid', async (req: Request, res: Response) => {
  const { env, clientId, clientSecret } = req.body;
  try {
    const token = await getToken(env || 'preprod', clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env as EtaEnv] ?? ETA_ENDPOINTS.preprod).api;
    const response = await fetch(`${endpoint}/documents/${req.params.uuid}/raw`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.status(response.status).json(await response.json());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cancel/:uuid', async (req: Request, res: Response) => {
  const { env, clientId, clientSecret, reason } = req.body;
  try {
    const token = await getToken(env || 'preprod', clientId, clientSecret);
    const endpoint = (ETA_ENDPOINTS[env as EtaEnv] ?? ETA_ENDPOINTS.preprod).api;
    const response = await fetch(`${endpoint}/documents/state/${req.params.uuid}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'Cancelled', reason: reason || 'Cancelled by issuer' }),
    });
    res.status(response.status).json(await response.json());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
