import app from './app';
import { connectDB } from './config/database';

import { pdfQueue } from './services/queueService';
import mongoose from 'mongoose';

const PORT = process.env.PORT || 3000;

let httpServer: any;
let isShuttingDown = false;

connectDB();

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log('Already shutting down, ignoring signal');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Received ${signal}, starting graceful shutdown...`);
  console.log(`${'='.repeat(60)}`);

  if (httpServer) {
    console.log('Stopping HTTP server...');
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
  }

  console.log('Waiting for active jobs to complete...');
  
  try {
    const activeJobs = await pdfQueue.getActive();
    const waitingJobs = await pdfQueue.getWaiting();
    
    console.log(`Active jobs: ${activeJobs.length}`);
    console.log(`Waiting jobs: ${waitingJobs.length}`);
    
    if (activeJobs.length > 0) {
      console.log(`Waiting for ${activeJobs.length} jobs to complete...`);
      
      const maxWaitTime = 30000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const remainingActive = await pdfQueue.getActive();
        if (remainingActive.length === 0) {
          console.log('All active jobs completed');
          break;
        }
        console.log(`Still waiting for ${remainingActive.length} jobs...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (waitingJobs.length > 0) {
      console.log(`Cancelling ${waitingJobs.length} waiting jobs...`);
      for (const job of waitingJobs) {
        await job.discard();
      }
      console.log('Waiting jobs cancelled');
    }
    
  } catch (error) {
    console.error('Error during queue cleanup:', error);
  }

  console.log('Closing Redis connection...');
  try {
    await pdfQueue.close();
    console.log('Redis connection closed');
  } catch (error) {
    console.error('Error closing Redis:', error);
  }

  console.log('Closing MongoDB connection...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB:', error);
  }

  console.log('Graceful shutdown completed');
  console.log(`${'='.repeat(60)}`);
  
  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 5000);
  
  process.exit(0);
}


const server = app.listen(PORT, () => {
  console.log(`API demarree sur http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Documentation: http://localhost:${PORT}/`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arret du serveur...');
  server.close(() => {
    console.log('Serveur arrete');
    process.exit(0);
  });
});