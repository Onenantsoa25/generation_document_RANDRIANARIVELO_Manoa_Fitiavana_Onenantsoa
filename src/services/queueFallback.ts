import { EventEmitter } from 'events';

interface Job {
  id: string;
  data: any;
  attempts: number;
  timestamp: Date;
}

class MemoryQueue extends EventEmitter {
  private waitingJobs: Job[] = [];
  private activeJobs: Job[] = [];
  private completedJobs: Job[] = [];
  private failedJobs: Job[] = [];
  private processing: boolean = false;
  private maxConcurrency: number = 4;
  private activeCount: number = 0;

  constructor(maxConcurrency: number = 4) {
    super();
    this.maxConcurrency = maxConcurrency;
    this.startProcessing();
  }

  add(data: any): Promise<void> {
    return new Promise((resolve) => {
      const job: Job = {
        id: `job_${Date.now()}_${Math.random()}`,
        data,
        attempts: 0,
        timestamp: new Date()
      };
      this.waitingJobs.push(job);
      console.log(`[MemoryQueue] Job ${job.id} added to queue (waiting: ${this.waitingJobs.length})`);
      resolve();
      this.emit('waiting');
    });
  }

  private async startProcessing() {
    setInterval(async () => {
      if (this.activeCount < this.maxConcurrency && this.waitingJobs.length > 0) {
        const job = this.waitingJobs.shift();
        if (job) {
          this.activeJobs.push(job);
          this.activeCount++;
          this.processJob(job);
        }
      }
    }, 100);
  }

  private async processJob(job: Job) {
    console.log(`[MemoryQueue] Processing job ${job.id}`);
    this.emit('active', job);
    
    try {
      await this.executeWithRetry(job);
      
      this.activeJobs = this.activeJobs.filter(j => j.id !== job.id);
      this.completedJobs.push(job);
      console.log(`[MemoryQueue] Job ${job.id} completed successfully`);
      this.emit('completed', job);
      
    } catch (error) {
      this.activeJobs = this.activeJobs.filter(j => j.id !== job.id);
      this.failedJobs.push(job);
      console.error(`[MemoryQueue] Job ${job.id} failed:`, error);
      this.emit('failed', job, error);
    } finally {
      this.activeCount--;
    }
  }

  private async executeWithRetry(job: Job): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.executeJob(job.data);
        return;
      } catch (error) {
        lastError = error as Error;
        console.log(`[MemoryQueue] Job ${job.id} attempt ${attempt} failed, retrying...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError || new Error('Job failed after retries');
  }

  private async executeJob(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.1) { 
          reject(new Error('Simulated job failure'));
        } else {
          resolve();
        }
      }, 1000);
    });
  }

  async getWaitingCount(): Promise<number> {
    return this.waitingJobs.length;
  }

  async getActiveCount(): Promise<number> {
    return this.activeCount;
  }

  async getCompletedCount(): Promise<number> {
    return this.completedJobs.length;
  }

  async getFailedCount(): Promise<number> {
    return this.failedJobs.length;
  }

  async close(): Promise<void> {
    console.log('[MemoryQueue] Closing memory queue...');
    while (this.activeCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[MemoryQueue] All jobs completed');
  }
}

class QueueFallback {
  private redisAvailable: boolean = true;
  private memoryQueue: MemoryQueue | null = null;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.memoryQueue = new MemoryQueue(4);
    this.startReconnectionAttempts();
  }

  private startReconnectionAttempts() {
    this.retryInterval = setInterval(async () => {
      if (!this.redisAvailable) {
        console.log('[QueueFallback] Attempting to reconnect to Redis...');
        try {
          const { pdfQueue } = require('./queueService');
          await pdfQueue.client.ping();
          this.redisAvailable = true;
          console.log('[QueueFallback] Redis reconnected successfully');
          await this.syncMemoryQueueToRedis();
        } catch (error) {
          console.log('[QueueFallback] Redis still unavailable');
        }
      }
    }, 5000);
  }

  private async syncMemoryQueueToRedis() {
    if (!this.memoryQueue) return;
    
    console.log('[QueueFallback] Syncing memory queue to Redis...');
    
    const waitingCount = await this.memoryQueue.getWaitingCount();
    const activeCount = await this.memoryQueue.getActiveCount();
    
    console.log(`[QueueFallback] Memory queue has ${waitingCount} waiting, ${activeCount} active jobs`);
    
  }

  isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  async addJob(data: any): Promise<void> {
    if (this.redisAvailable) {
      try {
        const { pdfQueue } = require('./queueService');
        await pdfQueue.add(data);
        console.log('[QueueFallback] Job added to Redis queue');
      } catch (error) {
        console.error('[QueueFallback] Redis add failed, using memory queue:', error);
        this.redisAvailable = false;
        await this.addToMemoryQueue(data);
      }
    } else {
      await this.addToMemoryQueue(data);
    }
  }

  private async addToMemoryQueue(data: any): Promise<void> {
    if (this.memoryQueue) {
      await this.memoryQueue.add(data);
      console.log('[QueueFallback] Job added to memory queue');
    } else {
      throw new Error('Memory queue not available');
    }
  }

  async getQueueStats(): Promise<any> {
    if (this.redisAvailable) {
      try {
        const { pdfQueue } = require('./queueService');
        const [waiting, active, completed, failed] = await Promise.all([
          pdfQueue.getWaitingCount(),
          pdfQueue.getActiveCount(),
          pdfQueue.getCompletedCount(),
          pdfQueue.getFailedCount()
        ]);
        return { waiting, active, completed, failed, source: 'redis' };
      } catch (error) {
        this.redisAvailable = false;
        return this.getMemoryQueueStats();
      }
    } else {
      return this.getMemoryQueueStats();
    }
  }

  private async getMemoryQueueStats(): Promise<any> {
    if (this.memoryQueue) {
      return {
        waiting: await this.memoryQueue.getWaitingCount(),
        active: await this.memoryQueue.getActiveCount(),
        completed: await this.memoryQueue.getCompletedCount(),
        failed: await this.memoryQueue.getFailedCount(),
        source: 'memory'
      };
    }
    return { waiting: 0, active: 0, completed: 0, failed: 0, source: 'none' };
  }

  async close(): Promise<void> {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    if (this.memoryQueue) {
      await this.memoryQueue.close();
    }
  }
}

export const queueFallback = new QueueFallback();