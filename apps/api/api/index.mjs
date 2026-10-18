// Vercel serverless entry — wraps dist/main.serverless.js.
//
// This file MUST stay ESM (.mjs with `export default`). dist/*.js is ESM
// (tsc + NodeNext) and @nestjs/core@12 is ESM-only; when the entry is CJS,
// Vercel's builder transpiles the traced graph to CJS and every `import`
// becomes `require()`, which fails with ERR_REQUIRE_ESM
// (FUNCTION_INVOCATION_FAILED / API_BUNDLE_LOAD_FAILED).
//
// Load errors are surfaced as JSON instead of the opaque Vercel 500 page.
export default async function handler(req, res) {
  try {
    const mod = await import('../dist/main.serverless.js');
    return (mod.default || mod)(req, res);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const stack = e && e.stack ? e.stack.slice(0, 4000) : '';
    console.error('[api/index] failed to load dist/main.serverless.js:', msg, stack);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'API_BUNDLE_LOAD_FAILED',
        message: msg,
        stack: stack.slice(0, 2000),
      });
    }
  }
}
