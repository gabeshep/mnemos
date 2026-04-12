/**
 * Mnemos — application entry point.
 *
 * Boots the Express server, wires up global middleware, and mounts the API
 * router. Tenant context is established per-request before routes run.
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import apiRouter from '../api/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(cookieParser());

// Request logging (lightweight — swap for a structured logger in production)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start — only when executed directly (not imported by tests or other modules)
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'url';
import { argv } from 'process';

const isMain = argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(PORT, () => {
    console.log(`[mnemos] Server listening on port ${PORT}`);
  });
}

export default app;
