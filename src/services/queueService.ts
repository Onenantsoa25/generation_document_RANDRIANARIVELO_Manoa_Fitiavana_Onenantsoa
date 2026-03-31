import Queue from 'bull';

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
    }
  }
});

export const addPdfJob = async (documentMongoId: string, userId: string, batchId: string) => {
  await pdfQueue.add({
    documentMongoId,
    userId,
    batchId
  });
};