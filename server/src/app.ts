import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, emailPreviewMode } from './config.js';
import { checkOrigin } from './middleware/origin.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { verifyMailTransport, sendDiagnosticMail } from './lib/mailer.js';

const app = express();

if (config.isProduction) {
  // Trust the first reverse proxy (Vercel, nginx, Fly, Render, etc.) for client
  // IPs and secure-cookie detection.
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api', checkOrigin);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// Temporary diagnostic: reports whether SMTP is configured and whether Resend
// accepts the credentials. It never sends an email and never exposes secrets.
let lastMailCheck = 0;
app.get('/api/health/mail', async (_req, res) => {
  if (emailPreviewMode) {
    res.json({ configured: false, ok: false, reason: 'SMTP_HOST is not set' });
    return;
  }
  if (Date.now() - lastMailCheck < 10_000) {
    res.status(429).json({ error: 'Try again in a few seconds.' });
    return;
  }
  lastMailCheck = Date.now();
  const result = await verifyMailTransport();
  res.json({ configured: true, ...result });
});

// Temporary diagnostic: sends one message to Resend's test inbox. Fixed
// recipient, no user input, so it cannot be used as a relay.
let lastMailTest = 0;
app.post('/api/health/mail/test', async (_req, res) => {
  if (emailPreviewMode) {
    res.status(400).json({ configured: false, reason: 'SMTP_HOST is not set' });
    return;
  }
  if (Date.now() - lastMailTest < 60_000) {
    res.status(429).json({ error: 'Try again in a minute.' });
    return;
  }
  lastMailTest = Date.now();
  const result = await sendDiagnosticMail();
  res.status(result.ok ? 200 : 502).json(result);
});

app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Outside Vercel the client build is served by Express. On Vercel, static
// files are served from public/** by the platform and express.static() is
// ignored, so this block is simply skipped when the build is absent.
const hasClientBuild = existsSync(path.join(config.clientDistPath, 'index.html'));

if (hasClientBuild) {
  app.use(express.static(config.clientDistPath, { index: false }));

  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    res.sendFile(path.join(config.clientDistPath, 'index.html'));
  });
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body.' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
};

app.use(errorHandler);

export { hasClientBuild };
export default app;
