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

// Proxy /api/members to User Service (Port 4001)
app.use('/api/members', createProxyMiddleware({ target: 'http://localhost:4001', changeOrigin: true, pathRewrite: {'^/api': ''} }));

// Proxy /api/jobs to Job Service (Port 4002)
app.use('/api/jobs', createProxyMiddleware({ target: 'http://localhost:4002', changeOrigin: true, pathRewrite: {'^/api': ''} }));

// Proxy /api/applications to Application Service (Port 4003)
app.use('/api/applications', createProxyMiddleware({ target: 'http://localhost:4003', changeOrigin: true, pathRewrite: {'^/api': ''} }));

// Proxy /api/threads and /api/messages to Messaging Service (Port 4004)
app.use('/api/threads', createProxyMiddleware({ target: 'http://localhost:4004', changeOrigin: true, pathRewrite: {'^/api': ''} }));
app.use('/api/messages', createProxyMiddleware({ target: 'http://localhost:4004', changeOrigin: true, pathRewrite: {'^/api': ''} }));

// Proxy /api/events and /api/analytics to Analytics Service (Port 4005)
app.use('/api/events', createProxyMiddleware({ target: 'http://localhost:4005', changeOrigin: true, pathRewrite: {'^/api': ''} }));
app.use('/api/analytics', createProxyMiddleware({ target: 'http://localhost:4005', changeOrigin: true, pathRewrite: {'^/api': ''} }));

// Proxy /api/ai to Agentic AI Service (Port 8001)
app.use('/api/ai', createProxyMiddleware({ target: 'http://localhost:8001', changeOrigin: true, pathRewrite: {'^/api/ai': '/ai'} }));


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/docs`);
});
