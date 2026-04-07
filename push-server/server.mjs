import express from 'express';
import cors from 'cors';
import webpush from 'web-push';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN || '';
const ADMIN_PAGE_PASSWORD = process.env.ADMIN_PAGE_PASSWORD || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const STORE_PATH = process.env.PUSH_SUBSCRIPTIONS_FILE
  || path.resolve(process.cwd(), 'subscriptions.json');
const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SUBSCRIPTIONS = Number(process.env.MAX_SUBSCRIPTIONS || 5000);
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_REQUESTS = Number(process.env.AUTH_MAX_REQUESTS || 10);
const SEND_WINDOW_MS = 60 * 1000;
const SEND_MAX_REQUESTS = Number(process.env.SEND_MAX_REQUESTS || 20);
const adminSessions = new Map();
const authAttemptBuckets = new Map();
const sendAttemptBuckets = new Map();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();

const allowedOrigins = CORS_ORIGIN
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const isWildcardCors = allowedOrigins.includes('*');
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !allowedOrigins.length) {
  throw new Error('CORS_ORIGIN must be explicitly configured in production.');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const getIp = req => (req.ip || req.socket?.remoteAddress || 'unknown').toString();

const isRateLimited = (bucket, key, windowMs, maxRequests) => {
  const now = Date.now();
  const previous = bucket.get(key);

  if (!previous || previous.expiresAt <= now) {
    bucket.set(key, { count: 1, expiresAt: now + windowMs });
    return false;
  }

  previous.count += 1;
  if (previous.count > maxRequests) {
    return true;
  }

  return false;
};

const normalizeNotificationUrl = value => {
  if (typeof value !== 'string' || !value.trim()) {
    return './index.html';
  }

  const candidate = value.trim();
  if (candidate.startsWith('/')) {
    return candidate;
  }

  if (candidate.startsWith('./')) {
    return candidate;
  }

  return './index.html';
};

const isValidSubscription = subscription => {
  if (!subscription || typeof subscription !== 'object') {
    return false;
  }

  const endpoint = subscription.endpoint;
  const keys = subscription.keys;

  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    return false;
  }

  if (!endpoint.startsWith('https://')) {
    return false;
  }

  if (!keys || typeof keys !== 'object') {
    return false;
  }

  if (typeof keys.auth !== 'string' || typeof keys.p256dh !== 'string') {
    return false;
  }

  return keys.auth.length <= 256 && keys.p256dh.length <= 256;
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin or non-browser requests without Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    // Keep wildcard permissive behavior available for local development only.
    if (!isProduction && isWildcardCors) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
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

const createSessionToken = () => randomBytes(24).toString('base64url');

const passwordMatches = provided => {
  if (!ADMIN_PAGE_PASSWORD) {
    return false;
  }

  const left = Buffer.from(provided || '', 'utf8');
  const right = Buffer.from(ADMIN_PAGE_PASSWORD, 'utf8');
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

const requireAdminSession = (req, res, next) => {
  const token = (req.headers['x-admin-session'] || '').toString();
  if (!token) {
    res.status(401).json({ error: 'Missing admin session' });
    return;
  }

  const expiresAt = adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    adminSessions.delete(token);
    res.status(401).json({ error: 'Admin session expired' });
    return;
  }

  next();
};

const authRateLimit = (req, res, next) => {
  const ip = getIp(req);
  if (isRateLimited(authAttemptBuckets, ip, AUTH_WINDOW_MS, AUTH_MAX_REQUESTS)) {
    res.status(429).json({ error: 'Too many auth attempts. Try again later.' });
    return;
  }

  next();
};

const sendRateLimit = (req, res, next) => {
  const sessionToken = (req.headers['x-admin-session'] || '').toString();
  const key = sessionToken || getIp(req);
  if (isRateLimited(sendAttemptBuckets, key, SEND_WINDOW_MS, SEND_MAX_REQUESTS)) {
    res.status(429).json({ error: 'Too many send attempts. Slow down and retry.' });
    return;
  }

  next();
};

const sendToAllSubscriptions = async payload => {
  const subs = await readSubscriptions();
  if (!subs.length) {
    return { sent: 0, failed: 0, removed: 0 };
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

  return { sent, failed, removed: staleEndpoints.size };
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
  if (!isValidSubscription(subscription)) {
    res.status(400).json({ error: 'Invalid subscription payload' });
    return;
  }

  const subs = await readSubscriptions();
  const deduped = subs.filter(item => item.endpoint !== subscription.endpoint);

  if (deduped.length >= MAX_SUBSCRIPTIONS) {
    res.status(429).json({ error: 'Subscription limit reached' });
    return;
  }

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

app.post('/api/admin/auth', authRateLimit, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!passwordMatches(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = createSessionToken();
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  res.json({ ok: true, sessionToken: token, expiresInMs: ADMIN_SESSION_TTL_MS });
});

app.post('/api/admin/send-system', requireAdminSession, sendRateLimit, async (req, res) => {
  const payload = {
    title: 'Dallas Bulls System Notification',
    body: typeof req.body?.body === 'string' ? req.body.body : 'System update from Dallas Bulls Stats.',
    url: normalizeNotificationUrl(req.body?.url),
    tag: 'system-notification',
  };

  const result = await sendToAllSubscriptions(payload);
  res.json({ ok: true, ...result });
});

app.post('/api/admin/send-push', requireAdminSession, sendRateLimit, async (req, res) => {
  const payload = {
    title: 'Dallas Bulls Push Notification',
    body: typeof req.body?.body === 'string' ? req.body.body : 'Push update from Dallas Bulls Stats.',
    url: normalizeNotificationUrl(req.body?.url),
    tag: 'push-notification',
  };

  const result = await sendToAllSubscriptions(payload);
  res.json({ ok: true, ...result });
});

app.post('/api/push/send', requireAdminToken, async (req, res) => {
  const payload = {
    title: typeof req.body?.title === 'string' ? req.body.title : 'Dallas Bulls Stats',
    body: typeof req.body?.body === 'string' ? req.body.body : 'A new app update is available.',
    url: normalizeNotificationUrl(req.body?.url),
    tag: typeof req.body?.tag === 'string' ? req.body.tag : 'dallas-bulls-push',
  };

  const result = await sendToAllSubscriptions(payload);
  res.json({ ok: true, ...result });
});

app.listen(PORT, () => {
  console.log(`Push server listening on port ${PORT}`);
});
