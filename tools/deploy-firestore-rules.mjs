import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { JWT } from 'google-auth-library';

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Missing Firebase Admin credentials in .env.');
}

const client = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const token = await client.getAccessToken();
if (!token.token) throw new Error('Could not obtain a Google access token.');

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const headers = { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' };
const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;

const rulesetResponse = await fetch(`${base}/rulesets`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } })
});
if (!rulesetResponse.ok) throw new Error(`Ruleset creation failed: ${await rulesetResponse.text()}`);
const ruleset = await rulesetResponse.json();

const releaseResponse = await fetch(`${base}/releases/cloud.firestore`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    release: {
      name: `projects/${projectId}/releases/cloud.firestore`,
      rulesetName: ruleset.name
    },
    updateMask: 'rulesetName'
  })
});
if (!releaseResponse.ok) throw new Error(`Rules deployment failed: ${await releaseResponse.text()}`);

console.log(`Firestore rules deployed to ${projectId}.`);
