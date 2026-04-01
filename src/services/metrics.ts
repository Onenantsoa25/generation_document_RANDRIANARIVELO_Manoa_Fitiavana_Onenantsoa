import client from 'prom-client';
import { logger } from './logger';

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const documentsGeneratedTotal = new client.Counter({
  name: 'documents_generated_total',
  help: 'Total number of documents generated',
  labelNames: ['status', 'template'] as const,
  registers: [register]
});

export const batchProcessingDuration = new client.Histogram({
  name: 'batch_processing_duration_seconds',
  help: 'Batch processing duration in seconds',
  labelNames: ['status'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register]
});

export const queueSize = new client.Gauge({
  name: 'queue_size',
  help: 'Current size of the job queue',
  labelNames: ['type'] as const,
  registers: [register]
});

export const pdfGenerationDuration = new client.Histogram({
  name: 'pdf_generation_duration_seconds',
  help: 'PDF generation duration in seconds',
  labelNames: ['template'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const activeWorkers = new client.Gauge({
  name: 'active_workers',
  help: 'Number of active worker threads',
  registers: [register]
});

export const mongodbConnectionStatus = new client.Gauge({
  name: 'mongodb_connection_status',
  help: 'MongoDB connection status (1=up, 0=down)',
  registers: [register]
});

export const redisConnectionStatus = new client.Gauge({
  name: 'redis_connection_status',
  help: 'Redis connection status (1=up, 0=down)',
  registers: [register]
});

export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
  registers: [register]
});

export const updateQueueMetrics = async (pdfQueue: any) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      pdfQueue.getWaitingCount(),
      pdfQueue.getActiveCount(),
      pdfQueue.getCompletedCount(),
      pdfQueue.getFailedCount()
    ]);
    
    queueSize.set({ type: 'waiting' }, waiting);
    queueSize.set({ type: 'active' }, active);
    queueSize.set({ type: 'completed' }, completed);
    queueSize.set({ type: 'failed' }, failed);
    queueSize.set({ type: 'total' }, waiting + active + completed + failed);
  } catch (error) {
    logger.error('Failed to update queue metrics', { error });
  }
};

export const updateConnectionMetrics = (mongodbUp: boolean, redisUp: boolean) => {
  mongodbConnectionStatus.set(mongodbUp ? 1 : 0);
  redisConnectionStatus.set(redisUp ? 1 : 0);
};

export const updateCircuitBreakerMetrics = (state: string) => {
  let stateValue = 0;
  if (state === 'CLOSED') stateValue = 0;
  else if (state === 'OPEN') stateValue = 1;
  else if (state === 'HALF_OPEN') stateValue = 2;
  circuitBreakerState.set(stateValue);
};

export { register as metricsRegister };