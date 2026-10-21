import dotenv from 'dotenv';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(serverDir, '../..');

dotenv.config({ path: path.join(repoRoot, '.env') });

const app = express();
const port = Number(process.env.PORT) || 3000;
const clientDist = path.join(repoRoot, 'client', 'dist');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Pathfinder listening on 0.0.0.0:${port}`);
});
