import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { checkOrigin } from './middleware/origin.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';

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
