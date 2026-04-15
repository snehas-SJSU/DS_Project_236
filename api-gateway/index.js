const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Load the Swagger Document
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

// Set up the Swagger UI /docs endpoint
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Use 127.0.0.1 for upstreams (avoids macOS localhost → IPv6 issues with Node ↔ Docker)
const local = (port) => `http://127.0.0.1:${port}`;

const proxy = (port, extra = {}) =>
  createProxyMiddleware({
    target: local(port),
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    proxyTimeout: 60_000,
    timeout: 60_000,
    onError(err, req, res) {
      console.error('[gateway proxy]', req.method, req.url, err.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: err.message }));
    },
    ...extra
  });

app.use('/api/members', proxy(4001));
app.use('/api/auth', proxy(4001));
app.use('/api/jobs', proxy(4002));
app.use('/api/recruiters', proxy(4002));
app.use('/api/applications', proxy(4003));
app.use('/api/connections', proxy(4006));
app.use('/api/threads', proxy(4004));
app.use('/api/messages', proxy(4004));
app.use('/api/events', proxy(4005));
app.use('/api/analytics', proxy(4005));

const aiWsProxy = createProxyMiddleware({
  target: local(8001),
  changeOrigin: true,
  pathRewrite: { '^/api/ai/ws': '/ws' },
  ws: true,
  proxyTimeout: 60_000,
  timeout: 60_000
});
app.use('/api/ai/ws', aiWsProxy);
app.use(
  '/api/ai',
  createProxyMiddleware({
    target: local(8001),
    changeOrigin: true,
    pathRewrite: { '^/api/ai': '/ai' },
    proxyTimeout: 60_000,
    timeout: 60_000,
    onError(err, req, res) {
      console.error('[gateway ai]', req.method, req.url, err.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: err.message }));
    }
  })
);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/docs`);
});
server.on('upgrade', aiWsProxy.upgrade);
