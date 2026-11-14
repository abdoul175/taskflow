import app from '../server/dist/app.js';

// Vercel's Node runtime mounts this file at /api. The Express app receives the
// original request path (/api/health, /api/auth/login, ...), so its routers work
// unchanged. The rewrite in vercel.json sends every /api/* request here.
export default app;
