import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

interface LocalDocument {
  id: string;
  userId: string;
  batchId: string;
  status: string;
  pdfPath?: string;
  error?: string;
  createdAt: Date;
}

interface LocalBatch {
  id: string;
  status: string;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  createdAt: Date;
  updatedAt: Date;
}

class DatabaseFallback {
  private isMongoConnected: boolean = true;
  private localBatches: Map<string, LocalBatch> = new Map();
  private localDocuments: Map<string, LocalDocument[]> = new Map();
  private fallbackDir: string;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.fallbackDir = path.join(__dirname, '../data/fallback');
    this.ensureFallbackDir();
    this.startReconnectionAttempts();
  }

  private ensureFallbackDir() {
    if (!fs.existsSync(this.fallbackDir)) {
      fs.mkdirSync(this.fallbackDir, { recursive: true });
    }
  }

  private startReconnectionAttempts() {
    this.retryInterval = setInterval(async () => {
      if (!this.isMongoConnected) {
        console.log('[Fallback] Attempting to reconnect to MongoDB...');
        try {
          await mongoose.connection.db.admin().ping();
          this.isMongoConnected = true;
          console.log('[Fallback] MongoDB reconnected successfully');
          await this.syncLocalDataToMongo();
        } catch (error) {
          console.log('[Fallback] MongoDB still unavailable');
        }
      }
    }, 5000); 
  }

  async syncLocalDataToMongo() {
    if (!this.isMongoConnected) return;

    console.log('[Fallback] Syncing local data to MongoDB...');
    
    for (const [batchId, batch] of this.localBatches) {
      try {
        const existing = await mongoose.connection.db.collection('batches').findOne({ batchId });
        if (!existing) {
          await mongoose.connection.db.collection('batches').insertOne(batch);
          console.log(`[Fallback] Synced batch ${batchId}`);
        }
      } catch (error) {
        console.error(`[Fallback] Failed to sync batch ${batchId}:`, error);
      }
    }

    for (const [batchId, documents] of this.localDocuments) {
      for (const doc of documents) {
        try {
          const existing = await mongoose.connection.db.collection('documents').findOne({ documentId: doc.id });
          if (!existing) {
            await mongoose.connection.db.collection('documents').insertOne(doc);
            console.log(`[Fallback] Synced document ${doc.id}`);
          }
        } catch (error) {
          console.error(`[Fallback] Failed to sync document ${doc.id}:`, error);
        }
      }
    }

    this.localBatches.clear();
    this.localDocuments.clear();
  }

  isMongoAvailable(): boolean {
    return this.isMongoConnected;
  }

  async saveBatch(batchData: any): Promise<any> {
    if (this.isMongoConnected) {
      try {
        return await batchData.save();
      } catch (error) {
        console.error('[Fallback] MongoDB save failed, using local storage:', error);
        this.isMongoConnected = false;
        return this.saveBatchLocally(batchData);
      }
    } else {
      return this.saveBatchLocally(batchData);
    }
  }

  private saveBatchLocally(batchData: any): any {
    const localBatch: LocalBatch = {
      id: batchData.batchId,
      status: batchData.status,
      totalDocuments: batchData.totalDocuments,
      processedDocuments: batchData.processedDocuments,
      failedDocuments: batchData.failedDocuments,
      createdAt: batchData.createdAt || new Date(),
      updatedAt: batchData.updatedAt || new Date()
    };
    
    this.localBatches.set(batchData.batchId, localBatch);
    
    const filePath = path.join(this.fallbackDir, `batch_${batchData.batchId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(localBatch, null, 2));
    
    console.log(`[Fallback] Batch ${batchData.batchId} saved locally`);
    
    return {
      ...batchData,
      save: async () => batchData,
      toObject: () => localBatch
    };
  }

  async saveDocument(documentData: any): Promise<any> {
    if (this.isMongoConnected) {
      try {
        return await documentData.save();
      } catch (error) {
        console.error('[Fallback] MongoDB save failed, using local storage:', error);
        this.isMongoConnected = false;
        return this.saveDocumentLocally(documentData);
      }
    } else {
      return this.saveDocumentLocally(documentData);
    }
  }

  private saveDocumentLocally(documentData: any): any {
    const localDoc: LocalDocument = {
      id: documentData.documentId || `local_${Date.now()}_${documentData.userId}`,
      userId: documentData.userId,
      batchId: documentData.batchId,
      status: documentData.status,
      pdfPath: documentData.pdfFileId ? `pdf_${documentData.documentId}.pdf` : undefined,
      error: documentData.error,
      createdAt: documentData.createdAt || new Date()
    };
    
    if (!this.localDocuments.has(documentData.batchId)) {
      this.localDocuments.set(documentData.batchId, []);
    }
    this.localDocuments.get(documentData.batchId)!.push(localDoc);
    
    const filePath = path.join(this.fallbackDir, `batch_${documentData.batchId}_docs.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.localDocuments.get(documentData.batchId), null, 2));
    
    console.log(`[Fallback] Document for user ${documentData.userId} saved locally`);
    
    return {
      ...documentData,
      save: async () => documentData,
      toObject: () => localDoc
    };
  }

  async findBatch(batchId: string): Promise<any> {
    if (this.isMongoConnected) {
      try {
        return await mongoose.connection.db.collection('batches').findOne({ batchId });
      } catch (error) {
        console.error('[Fallback] MongoDB find failed, using local storage:', error);
        this.isMongoConnected = false;
        return this.findBatchLocally(batchId);
      }
    } else {
      return this.findBatchLocally(batchId);
    }
  }

  private findBatchLocally(batchId: string): any {
    const batch = this.localBatches.get(batchId);
    if (batch) return batch;
    
    const filePath = path.join(this.fallbackDir, `batch_${batchId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
    
    return null;
  }

  async findDocuments(batchId: string): Promise<any[]> {
    if (this.isMongoConnected) {
      try {
        return await mongoose.connection.db.collection('documents').find({ batchId }).toArray();
      } catch (error) {
        console.error('[Fallback] MongoDB find failed, using local storage:', error);
        this.isMongoConnected = false;
        return this.findDocumentsLocally(batchId);
      }
    } else {
      return this.findDocumentsLocally(batchId);
    }
  }

  private findDocumentsLocally(batchId: string): any[] {
    const docs = this.localDocuments.get(batchId);
    if (docs) return docs;
    
    const filePath = path.join(this.fallbackDir, `batch_${batchId}_docs.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
    
    return [];
  }

  async updateBatch(batchId: string, update: any): Promise<void> {
    if (this.isMongoConnected) {
      try {
        await mongoose.connection.db.collection('batches').updateOne(
          { batchId },
          { $set: update }
        );
      } catch (error) {
        console.error('[Fallback] MongoDB update failed, using local storage:', error);
        this.isMongoConnected = false;
        this.updateBatchLocally(batchId, update);
      }
    } else {
      this.updateBatchLocally(batchId, update);
    }
  }

  private updateBatchLocally(batchId: string, update: any): void {
    const batch = this.localBatches.get(batchId);
    if (batch) {
      Object.assign(batch, update);
      batch.updatedAt = new Date();
      
      const filePath = path.join(this.fallbackDir, `batch_${batchId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
    }
  }

  async updateDocument(documentId: string, update: any): Promise<void> {
    if (this.isMongoConnected) {
      try {
        await mongoose.connection.db.collection('documents').updateOne(
          { documentId },
          { $set: update }
        );
      } catch (error) {
        console.error('[Fallback] MongoDB update failed, using local storage:', error);
        this.isMongoConnected = false;
        this.updateDocumentLocally(documentId, update);
      }
    } else {
      this.updateDocumentLocally(documentId, update);
    }
  }

  private updateDocumentLocally(documentId: string, update: any): void {
    for (const [batchId, docs] of this.localDocuments) {
      const doc = docs.find(d => d.id === documentId);
      if (doc) {
        Object.assign(doc, update);
        const filePath = path.join(this.fallbackDir, `batch_${batchId}_docs.json`);
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
        break;
      }
    }
  }

  stopRetry() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

    async getLocalDataCount(): Promise<number> {
    let count = 0;
    
    count += this.localBatches.size;
    
    for (const docs of this.localDocuments.values()) {
        count += docs.length;
    }
    
    try {
        const files = fs.readdirSync(this.fallbackDir);
        count += files.length;
    } catch (error) {
    }
    
    return count;
    }

}

export const dbFallback = new DatabaseFallback();