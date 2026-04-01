import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

interface CircuitBreakerOptions {
  failureThreshold: number;      
  timeout: number;               
  resetTimeout: number;          
  halfOpenMaxAttempts: number;   
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',      
  OPEN = 'OPEN',          
  HALF_OPEN = 'HALF_OPEN' 
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = {
      failureThreshold: 5,
      timeout: 5000,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 3,
      ...options
    };
  }

  async execute<T>(request: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.options.resetTimeout) {
        console.log(`[CircuitBreaker] Transition OPEN -> HALF_OPEN after ${this.options.resetTimeout}ms`);
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        const waitTime = ((this.options.resetTimeout - (now - this.lastFailureTime)) / 1000).toFixed(1);
        throw new Error(`CircuitBreaker OPEN - Service unavailable. Try again in ${waitTime}s`);
      }
    }

    try {
      const result = await this.executeWithTimeout(request, this.options.timeout);
      
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        console.log(`[CircuitBreaker] HALF_OPEN -> CLOSED - Request successful`);
        this.reset();
      } else {
        this.onSuccess();
      }
      
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(request: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      request(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        console.log(`[CircuitBreaker] HALF_OPEN -> OPEN after ${this.halfOpenAttempts} failures`);
        this.state = CircuitBreakerState.OPEN;
      }
    } else if (this.failureCount >= this.options.failureThreshold) {
      console.log(`[CircuitBreaker] CLOSED -> OPEN after ${this.failureCount} failures`);
      this.state = CircuitBreakerState.OPEN;
    }
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    console.log(`[CircuitBreaker] Reset to CLOSED state`);
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts
    };
  }
}

export class DocuSignSimulator {
  private circuitBreaker: CircuitBreaker;
  private failureRate: number; 
  private responseDelay: number; 

  constructor(failureRate: number = 0.3, responseDelay: number = 1000) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 5000,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 2
    });
    this.failureRate = failureRate;
    this.responseDelay = responseDelay;
  }

  async sendDocument(userId: string, documentId: string, pdfContent: Buffer): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      console.log(`[DocuSign] Sending document ${documentId} for user ${userId}...`);
      
      await this.sleep(this.responseDelay);
      
      if (Math.random() < this.failureRate) {
        console.log(`[DocuSign] Failed to send document ${documentId}`);
        throw new Error(`DocuSign API error: Service temporarily unavailable`);
      }
      
      const envelopeId = `ENV_${Date.now()}_${userId}`;
      console.log(`[DocuSign] Successfully sent document ${documentId}, envelope: ${envelopeId}`);
      
      return {
        success: true,
        envelopeId,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  setFailureRate(rate: number) {
    this.failureRate = Math.max(0, Math.min(1, rate));
    console.log(`[DocuSign] Failure rate set to ${this.failureRate * 100}%`);
  }

  reset() {
    this.circuitBreaker.reset();
  }
}

export const docuSignClient = new DocuSignSimulator();