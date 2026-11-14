import { config } from './config.js';
import { db } from './db.js';
import app, { hasClientBuild } from './app.js';

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  if (hasClientBuild) {
    console.log(`Serving client build from ${config.clientDistPath}`);
  }
});

async function shutdown() {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
