// Local preview server that behaves like Vercel does with our vercel.json:
//   - 301 redirects from the old site's URLs
//   - every other unknown path is rewritten to index.html (client-side routing)
//   - Cache-Control headers from the "headers" block
// No dependencies. Run with: node scripts/serve.js [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2'
};

// Vercel "source" patterns are path-to-regexp style. We only need literal paths
// and the "(.*)" wildcard, which is all vercel.json uses.
function sourceToRegExp(source) {
  const escaped = source
    .split('(.*)')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('(.*)');
  return new RegExp('^' + escaped + '$');
}
const redirects = config.redirects.map((r) => ({ ...r, re: sourceToRegExp(r.source) }));
const headerRules = config.headers.map((h) => ({ ...h, re: sourceToRegExp(h.source) }));

function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

async function fileAt(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const full = join(ROOT, safe);
  if (!full.startsWith(ROOT)) return null;
  try {
    const s = await stat(full);
    return s.isFile() ? full : null;
  } catch {
    return null;
  }
}

export function createSiteServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;

    if (config.trailingSlash === false && pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(308, { Location: pathname.slice(0, -1) + url.search });
      return res.end();
    }

    const redirect = redirects.find((r) => r.re.test(pathname));
    if (redirect) {
      res.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination + url.search });
      return res.end();
    }

    let file = await fileAt(pathname);
    if (!file) {
      // The rewrite rule: anything that is not a real file becomes index.html.
      file = join(ROOT, 'index.html');
      pathname = '/index.html';
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      ...headersFor(pathname)
    });
    res.end(body);
  });
}

export function listen(port = 0) {
  return new Promise((resolvePort) => {
    const server = createSiteServer();
    server.listen(port, '127.0.0.1', () => resolvePort({ server, port: server.address().port }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 4173);
  const { port: p } = await listen(port);
  console.log(`Knight Fitness Morayfield preview: http://localhost:${p}/`);
}
