import Queue from 'bull';

import { queueFallback } from './queueFallback';

export const pdfQueue = new Queue('pdf-generation', {
  redis: {
    host: 'redis',
    port: 6379
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    timeout: 5000 
  }
});

export const addPdfJob = async (
  documentMongoId: string, 
  userId: string, 
  batchId: string,
  templateName: string = 'cerfa'
) => {
  const jobData = { documentMongoId, userId, batchId, templateName };
  
  try {
    await pdfQueue.add(jobData);
    console.log(`[Queue] Job added to Redis for ${userId}`);
  } catch (error) {
    console.error(`[Queue] Redis unavailable, using memory fallback:`, error);
    await queueFallback.addJob(jobData);
  }
};