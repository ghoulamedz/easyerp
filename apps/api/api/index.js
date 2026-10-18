// Vercel serverless entry — wraps dist/main.serverless.js
// dist is ESM (tsc + NodeNext), so we cannot `require()` it from CJS. Use a
// lazy dynamic import on every invocation and surface load/init errors as JSON
// instead of the opaque FUNCTION_INVOCATION_FAILED vercel page.
module.exports = async (req, res) => {
  try {
    const mod = await import('../dist/main.serverless.js');
    const handler = mod.default || mod;
    return handler(req, res);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const stack = e && e.stack ? e.stack.slice(0, 4000) : '';
    console.error('[api/index] failed to load dist/main.serverless.js:', msg, stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'API_BUNDLE_LOAD_FAILED', message: msg, stack: stack.slice(0, 2000) });
    }
  }
};
