import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './config/swagger';
import documentRoutes from './routes/documentRoutes';
import monitoringRoutes from './routes/monitoringRoutes';
import adminRoutes from './routes/adminRoutes';

import { register as metricsRegister } from './services/metrics';
import { updateConnectionMetrics, updateCircuitBreakerMetrics } from './services/metrics';

import { createBatch, getBatchStatus } from './controllers/batchController';
import { getDashboard } from './controllers/dashboardController';
import { getDocument } from './controllers/documentController';
import { pdfQueue } from './services/queueService';
import { docuSignClient } from './services/circuitBreaker';
import { dbFallback } from './services/databaseFallback';
import { queueFallback } from './services/queueFallback';

const app = express();

app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.use(documentRoutes);
app.use(monitoringRoutes);
app.use(adminRoutes);

app.get('/dashboard', getDashboard);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'PDF Generator API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  }
}));

app.get('/docs', (req, res) => {
  res.redirect('/api-docs');
});

app.post('/api/documents/batch', createBatch);
app.get('/api/documents/batch/:batchId', getBatchStatus);
app.get('/api/documents/:documentId', getDocument);

app.get('/health', async (req, res) => {
  const health: {
    status: string;
    timestamp: string;
    uptime: number;
    services: {
      mongodb: any;
      redis: any;
      queue: any;
      circuitBreaker: any;
      fallback: any;  
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: { status: 'unknown', latency: 0 },
      redis: { status: 'unknown', latency: 0 },
      queue: { status: 'unknown' },
      circuitBreaker: { status: 'ok' },
      fallback: {  
        mongodb: { available: true, localDataCount: 0 },
        redis: { available: true, queueSource: 'redis' }
      }
    }
  };

  const mongoStart = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    health.services.mongodb = {
      status: 'up',
      latency: Date.now() - mongoStart
    };
  } catch (err: any) {
    health.status = 'degraded';
    health.services.mongodb = {
      status: 'down',
      latency: Date.now() - mongoStart,
      error: err?.message || 'Unknown error'
    };
  }

  const redisStart = Date.now();
  try {
    const client = pdfQueue.client;
    const pingResult = await client.ping();
    
    const [waiting, active, completed, failed] = await Promise.all([
      pdfQueue.getWaitingCount(),
      pdfQueue.getActiveCount(),
      pdfQueue.getCompletedCount(),
      pdfQueue.getFailedCount()
    ]);
    
    health.services.redis = {
      status: pingResult === 'PONG' ? 'up' : 'down',
      latency: Date.now() - redisStart
    };
    
    health.services.queue = {
      status: 'up',
      waiting: waiting,
      active: active,
      completed: completed,
      failed: failed,
      total: waiting + active + completed + failed
    };
  } catch (err: any) {
    health.status = 'degraded';
    health.services.redis = {
      status: 'down',
      latency: Date.now() - redisStart,
      error: err?.message || 'Unknown error'
    };
    health.services.queue = {
      status: 'down',
      error: err?.message || 'Unknown error'
    };
  }

  try {
    const cbStats = docuSignClient.getCircuitBreakerStats();
    health.services.circuitBreaker = {
      status: 'ok',
      state: cbStats.state,
      failureCount: cbStats.failureCount,
      lastFailureTime: cbStats.lastFailureTime,
      halfOpenAttempts: cbStats.halfOpenAttempts
    };
  } catch (err: any) {
    health.services.circuitBreaker = {
      status: 'error',
      error: err?.message || 'Unknown error'
    };
  }

  try {
    const queueStats = await queueFallback.getQueueStats();
    const localDataCount = dbFallback.getLocalDataCount ? await dbFallback.getLocalDataCount() : 0;
    
    health.services.fallback = {
      mongodb: {
        available: dbFallback.isMongoAvailable(),
        localDataCount: localDataCount
      },
      redis: {
        available: queueFallback.isRedisAvailable(),
        queueSource: queueStats.source,
        queueStats: {
          waiting: queueStats.waiting,
          active: queueStats.active,
          completed: queueStats.completed,
          failed: queueStats.failed
        }
      }
    };
  } catch (err: any) {
    health.services.fallback = {
      error: err?.message || 'Unknown error'
    };
  }

  if (health.services.mongodb.status !== 'up' || 
      health.services.redis.status !== 'up') {
    health.status = 'degraded';
  }

  const httpStatus = health.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(health);
});

app.get('/health/simple', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/liveness', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/readiness', async (req, res) => {
  let ready = true;
  const checks: Array<{service: string; status: string; error?: string}> = [];

  try {
    await mongoose.connection.db.admin().ping();
    checks.push({ service: 'mongodb', status: 'ready' });
  } catch (err: any) {
    ready = false;
    checks.push({ service: 'mongodb', status: 'not ready', error: err?.message || 'Unknown error' });
  }

  try {
    const client = pdfQueue.client;
    await client.ping();
    checks.push({ service: 'redis', status: 'ready' });
  } catch (err: any) {
    ready = false;
    checks.push({ service: 'redis', status: 'not ready', error: err?.message || 'Unknown error' });
  }

  const httpStatus = ready ? 200 : 503;
  res.status(httpStatus).json({
    ready,
    checks,
    timestamp: new Date().toISOString()
  });
});

app.get('/admin/circuit-breaker/stats', (req, res) => {
  try {
    const stats = docuSignClient.getCircuitBreakerStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

app.post('/admin/circuit-breaker/failure-rate', (req, res) => {
  const { rate } = req.body;
  docuSignClient.setFailureRate(rate);
  res.json({ 
    message: `Failure rate set to ${rate * 100}%`,
    currentRate: rate 
  });
});

app.post('/admin/circuit-breaker/reset', (req, res) => {
  docuSignClient.reset();
  res.json({ message: 'Circuit breaker reset' });
});

app.get('/metrics', async (req, res) => {
  try {
    let mongodbUp = false;
    try {
      await mongoose.connection.db.admin().ping();
      mongodbUp = true;
    } catch (error) {
      mongodbUp = false;
    }
    
    let redisUp = false;
    try {
      await pdfQueue.client.ping();
      redisUp = true;
    } catch (error) {
      redisUp = false;
    }
    
    updateConnectionMetrics(mongodbUp, redisUp);
    
    const cbStats = docuSignClient.getCircuitBreakerStats();
    updateCircuitBreakerMetrics(cbStats.state);
    
    const [waiting, active] = await Promise.all([
      pdfQueue.getWaitingCount(),
      pdfQueue.getActiveCount()
    ]);
    
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Error generating metrics' });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'PDF Generator Service',
    version: '1.0.0',
    endpoints: {
      createBatch: 'POST /api/documents/batch',
      getBatchStatus: 'GET /api/documents/batch/:batchId',
      getDocument: 'GET /api/documents/:documentId',
      health: 'GET /health',
      healthLiveness: 'GET /health/liveness',
      healthReadiness: 'GET /health/readiness',
      circuitBreakerStats: 'GET /admin/circuit-breaker/stats',
      circuitBreakerFailureRate: 'POST /admin/circuit-breaker/failure-rate',
      circuitBreakerReset: 'POST /admin/circuit-breaker/reset'
    }
  });
});

export default app;