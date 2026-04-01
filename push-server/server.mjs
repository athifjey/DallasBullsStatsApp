import express from 'express';
import cors from 'cors';
import webpush from 'web-push';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const STORE_PATH = process.env.PUSH_SUBSCRIPTIONS_FILE
  || path.resolve(process.cwd(), 'subscriptions.json');

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '256kb' }));

const readSubscriptions = async () => {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSubscriptions = async subs => {
  await fs.writeFile(STORE_PATH, JSON.stringify(subs, null, 2), 'utf8');
};

const requireAdminToken = (req, res, next) => {
  if (!ADMIN_TOKEN) {
    res.status(500).json({ error: 'Server misconfigured: missing PUSH_ADMIN_TOKEN' });
    return;
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};

app.get('/api/push/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/push/public-config', (_req, res) => {
  res.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: 'Invalid subscription payload' });
    return;
  }

  const subs = await readSubscriptions();
  const deduped = subs.filter(item => item.endpoint !== subscription.endpoint);
  deduped.push(subscription);
  await writeSubscriptions(deduped);

  res.json({ ok: true, count: deduped.length });
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Missing endpoint' });
    return;
  }

  const subs = await readSubscriptions();
  const updated = subs.filter(item => item.endpoint !== endpoint);
  await writeSubscriptions(updated);
  res.json({ ok: true, count: updated.length });
});

app.post('/api/push/send', requireAdminToken, async (req, res) => {
  const payload = {
    title: typeof req.body?.title === 'string' ? req.body.title : 'Dallas Bulls Stats',
    body: typeof req.body?.body === 'string' ? req.body.body : 'A new app update is available.',
    url: typeof req.body?.url === 'string' ? req.body.url : './index.html',
    tag: typeof req.body?.tag === 'string' ? req.body.tag : 'dallas-bulls-push',
  };

  const subs = await readSubscriptions();
  if (!subs.length) {
    res.json({ ok: true, sent: 0, failed: 0, removed: 0 });
    return;
  }

  let sent = 0;
  let failed = 0;
  const staleEndpoints = new Set();

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.add(sub.endpoint);
      }
    }
  }));

  if (staleEndpoints.size) {
    const cleaned = subs.filter(sub => !staleEndpoints.has(sub.endpoint));
    await writeSubscriptions(cleaned);
  }

  res.json({ ok: true, sent, failed, removed: staleEndpoints.size });
});

app.listen(PORT, () => {
  console.log(`Push server listening on port ${PORT}`);
});
