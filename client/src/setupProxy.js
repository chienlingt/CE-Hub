// Loaded automatically by react-scripts (no eject needed) — replaces the
// simple "proxy" field in package.json, which hardcodes changeOrigin:true
// and was rewriting the Origin header to match the proxy target
// (http://localhost:4000) instead of preserving the real request origin,
// causing the backend's CORS check to reject every proxied request.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:4000',
      changeOrigin: false,
    })
  );
};
