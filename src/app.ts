import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createBatch, getBatchStatus } from './controllers/batchController';
import { getDocument } from './controllers/documentController';

const app = express();

app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.post('/api/documents/batch', createBatch);
app.get('/api/documents/batch/:batchId', getBatchStatus);
app.get('/api/documents/:documentId', getDocument);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'PDF Generator Service',
    version: '1.0.0',
    endpoints: {
      createBatch: 'POST /api/documents/batch',
      getBatchStatus: 'GET /api/documents/batch/:batchId',
      getDocument: 'GET /api/documents/:documentId',
      health: 'GET /health'
    }
  });
});

export default app;