// App Store Connect API client for the store tools, with the key file the store-listing
// workflow writes ({ key_id, issuer_id, key }), given by ASC_KEY_JSON.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const BUNDLE_ID = 'app.pepperedapron.com';

const key = JSON.parse(fs.readFileSync(process.env.ASC_KEY_JSON, 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: key.key_id, typ: 'JWT' });
  const body = b64({ iss: key.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = crypto
    .sign('sha256', Buffer.from(`${head}.${body}`), { key: key.key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${head}.${body}.${sig}`;
}

export async function api(method, url, body) {
  const res = await fetch(
    url.startsWith('http') ? url : `https://api.appstoreconnect.apple.com${url}`,
    {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function findApp() {
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
  if (!app) throw new Error(`no app ${BUNDLE_ID}`);
  return app;
}
