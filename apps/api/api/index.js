// Vercel serverless entry — wraps dist/main.serverless.js
// Keep as CommonJS for NodeNext compat; handle both CJS and ESM exports
let handler;
try {
  const mod = require('../dist/main.serverless.js');
  handler = mod.default || mod;
} catch (e) {
  // Surface import error as JSON instead of opaque 500
  const msg = e && e.message ? e.message : String(e);
  const stack = e && e.stack ? e.stack.slice(0, 4000) : '';
  console.error('[api/index] failed to load dist/main.serverless.js:', msg, stack);
  handler = (req, res) => res.status(500).json({ error: 'API_BUNDLE_LOAD_FAILED', message: msg, stack: stack.slice(0, 2000) });
}
module.exports = handler;
