#!/usr/bin/env node
/**
 * scripts/generate-api-docs.js
 *
 * Zero-dependency documentation generator.
 * Parses api/routes/*.js and db/schema.js to produce:
 *   - docs/api.md   (REST API reference)
 *   - docs/spec.md  (database schema reference)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'GET /api/flags',
  'GET /api/metrics',
  'GET /api/synthetic/onboarding',
]);

const MODULE_PATHS = {
  'auth.js':       '/api/auth',
  'users.js':      '/api/users',
  'entities.js':   '/api/entities',
  'assets.js':     '/api/assets',
  'captures.js':   '/api/captures',
  'sessions.js':   '/api/sessions',
  'onboarding.js': '/api/onboarding',
  'flags.js':      '/api/flags',
  'telemetry.js':  '/api/telemetry',
  'voc.js':        '/api/voc',
  'metrics.js':    '/api/metrics',
  'synthetic.js':  '/api/synthetic',
};

// ---------------------------------------------------------------------------
// generateApiDocs
// ---------------------------------------------------------------------------

function generateApiDocs() {
  const routesDir = path.join(ROOT, 'api', 'routes');
  const files = fs.readdirSync(routesDir)
    .filter(f => f.endsWith('.js'))
    .sort();

  const timestamp = new Date().toISOString();

  const lines = [
    '# Mnemos REST API Reference',
    '',
    `> Auto-generated — do not edit manually. Last updated: ${timestamp}.`,
    '',
    '## Overview',
    '',
    '**Base URL:** `/api`',
    '',
    '**Authentication:** JWT stored in an httpOnly cookie (`mnemos_auth`). All',
    'endpoints require this cookie unless marked **Public** in the Auth column.',
    '',
  ];

  for (const filename of files) {
    const basePath = MODULE_PATHS[filename];
    if (!basePath) continue;

    const filePath = path.join(routesDir, filename);
    const text = fs.readFileSync(filePath, 'utf8');

    // Extract top-level JSDoc block (first /** ... */ block)
    const jsdocMatch = text.match(/\/\*\*([\s\S]*?)\*\//);
    let moduleDescription = '';
    if (jsdocMatch) {
      moduleDescription = jsdocMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' ');
    }

    // Extract all router.METHOD('path') calls
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
    const routes = [];
    let match;
    while ((match = routeRegex.exec(text)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const fullPath = basePath + (routePath === '/' ? '' : routePath);
      const authKey = `${method} ${fullPath}`;
      const auth = PUBLIC_ROUTES.has(authKey) ? 'Public' : 'JWT cookie';
      routes.push({ method, path: fullPath, auth });
    }

    // Some route files (e.g. flags.js, metrics.js) export a plain handler
    // without using router.METHOD calls — synthesize from MODULE_PATHS context
    if (routes.length === 0) {
      // flags.js: GET, metrics.js: GET
      if (filename === 'flags.js') {
        const fullPath = basePath;
        const authKey = `GET ${fullPath}`;
        routes.push({ method: 'GET', path: fullPath, auth: PUBLIC_ROUTES.has(authKey) ? 'Public' : 'JWT cookie' });
      } else if (filename === 'metrics.js') {
        const fullPath = basePath;
        const authKey = `GET ${fullPath}`;
        routes.push({ method: 'GET', path: fullPath, auth: PUBLIC_ROUTES.has(authKey) ? 'Public' : 'JWT cookie' });
      }
    }

    // Module heading
    const moduleName = filename.replace('.js', '');
    const capitalized = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    lines.push(`## ${capitalized}`);
    lines.push('');
    if (moduleDescription) {
      lines.push(moduleDescription);
      lines.push('');
    }

    if (routes.length > 0) {
      lines.push('| Method | Path | Auth | Description |');
      lines.push('|--------|------|------|-------------|');
      for (const route of routes) {
        lines.push(`| \`${route.method}\` | \`${route.path}\` | ${route.auth} | — |`);
      }
      lines.push('');
    } else {
      lines.push('_No routes detected._');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// generateSpecDocs
// ---------------------------------------------------------------------------

function generateSpecDocs() {
  const schemaPath = path.join(ROOT, 'db', 'schema.js');
  const text = fs.readFileSync(schemaPath, 'utf8');
  const timestamp = new Date().toISOString();

  const lines = [
    '# Mnemos Database Schema Reference',
    '',
    `> Auto-generated — do not edit manually. Last updated: ${timestamp}.`,
    '',
  ];

  // -------------------------------------------------------------------------
  // Enums
  // -------------------------------------------------------------------------
  lines.push('## Enums');
  lines.push('');

  const enumRegex = /export const \w+ = pgEnum\('([^']+)',\s*\[([^\]]+)\]/g;
  let enumMatch;
  let foundEnums = false;

  while ((enumMatch = enumRegex.exec(text)) !== null) {
    foundEnums = true;
    const enumName = enumMatch[1];
    const valuesRaw = enumMatch[2];
    const values = valuesRaw
      .split(',')
      .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    lines.push(`### \`${enumName}\``);
    lines.push('');
    lines.push('| Value |');
    lines.push('|-------|');
    for (const v of values) {
      lines.push(`| \`${v}\` |`);
    }
    lines.push('');
  }

  if (!foundEnums) {
    lines.push('_No enums found._');
    lines.push('');
  }

  // -------------------------------------------------------------------------
  // Tables — line-by-line pass
  // -------------------------------------------------------------------------
  lines.push('## Tables');
  lines.push('');

  const schemaLines = text.split('\n');
  const tableStartRegex = /^export const (\w+) = pgTable\('([^']+)'/;

  let i = 0;
  while (i < schemaLines.length) {
    const startMatch = schemaLines[i].match(tableStartRegex);
    if (startMatch) {
      const varName = startMatch[1];
      const tableName = startMatch[2];

      // Collect lines until closing ');' of the pgTable call
      const tableLines = [];
      let depth = 0;
      let j = i;
      while (j < schemaLines.length) {
        const l = schemaLines[j];
        for (const ch of l) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
        }
        tableLines.push(l);
        j++;
        // After opening '(' on first line, we stop when depth returns to 0
        if (j > i && depth <= 0) break;
      }

      // Parse column definitions from the collected block
      const columnRegex = /^\s{2,}(\w+):\s+(.+?),?\s*$/;
      const columns = [];
      for (const tl of tableLines.slice(1)) {
        const cm = tl.match(columnRegex);
        if (cm) {
          const colName = cm[1];
          // Skip non-column helper keys (constraint objects)
          if (['pk', 'uniqTenantEmail', 'uniqAssetVersion'].includes(colName)) continue;
          const colDef = cm[2].trim().replace(/,+$/, '');
          columns.push({ name: colName, definition: colDef });
        }
      }

      lines.push(`### \`${tableName}\` (\`${varName}\`)`);
      lines.push('');
      if (columns.length > 0) {
        lines.push('| Column | Definition |');
        lines.push('|--------|------------|');
        for (const col of columns) {
          lines.push(`| \`${col.name}\` | \`${col.definition}\` |`);
        }
      } else {
        lines.push('_No columns parsed._');
      }
      lines.push('');

      i = j;
    } else {
      i++;
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const apiMd = generateApiDocs();
const specMd = generateSpecDocs();

const docsDir = path.join(ROOT, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const apiPath = path.join(docsDir, 'api.md');
const specPath = path.join(docsDir, 'spec.md');

fs.writeFileSync(apiPath, apiMd, 'utf8');
fs.writeFileSync(specPath, specMd, 'utf8');

const apiBytes = Buffer.byteLength(apiMd, 'utf8');
const specBytes = Buffer.byteLength(specMd, 'utf8');

console.log(`docs:generate completed — api.md: ${apiBytes} bytes, spec.md: ${specBytes} bytes`);
