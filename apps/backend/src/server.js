const express = require('express');
const cors = require('cors');
const downloadsRouter = require('./routes/downloads');

const app = express();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:1420'],
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/downloads', downloadsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Erro interno no servidor.' });
});

module.exports = app;
