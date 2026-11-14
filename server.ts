import express from 'express';
import app from './server/dist/app.js';

// The explicit `express` import lets Vercel's zero-configuration Express
// detection recognize this entrypoint. `app` is the fully configured
// application exported from the server workspace.
void express;

export default app;
