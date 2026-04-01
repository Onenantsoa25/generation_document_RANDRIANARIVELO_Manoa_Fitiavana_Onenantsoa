import { connectDB } from '../config/database';
import { pdfQueue } from '../services/queueService';
import { generatePDF, preloadTemplates } from '../services/pdfGeneratorService';
import { IDocument } from '../models/Document';
import { Batch } from '../models/Batch';
import { docuSignClient } from '../services/circuitBreaker';
import { dbFallback } from '../services/databaseFallback';
import { logger, createContextLogger } from '../services/logger';
import { documentsGeneratedTotal, pdfGenerationDuration, updateQueueMetrics, activeWorkers } from '../services/metrics';

connectDB().catch(error => {
  logger.error('MongoDB connection failed, using fallback storage', { error });
});

preloadTemplates();

activeWorkers.set(1);

pdfQueue.process(async (job) => {
  const { documentMongoId, userId, batchId, templateName = 'cerfa' } = job.data;
  const documentId = `doc_${Date.now()}_${userId}`;
  const startTime = Date.now();
  
  const contextLogger = createContextLogger({ batchId, documentId, userId });
  
  contextLogger.info('Starting document generation', { templateName });
  
  try {
    await IDocument.findByIdAndUpdate(documentMongoId, {
      status: 'processing',
      updatedAt: new Date()
    });
    
    contextLogger.debug('Document marked as processing');
    
    const pdfStartTime = Date.now();
    const pdfGenerationPromise = generatePDF(userId, documentId, templateName);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: génération PDF > 5s')), 5000);
    });
    
    const pdfFileId = await Promise.race([pdfGenerationPromise, timeoutPromise]);
    const pdfDuration = (Date.now() - pdfStartTime) / 1000;
    
    pdfGenerationDuration.observe({ template: templateName }, pdfDuration);
    
    contextLogger.info('PDF generated successfully', { duration: pdfDuration });
    
    try {
      const pdfBuffer = Buffer.from('Simulated PDF content');
      await docuSignClient.sendDocument(userId, documentId, pdfBuffer);
      contextLogger.info('Document sent to DocuSign');
    } catch (docusignError: any) {
      contextLogger.warn('DocuSign error (non-critical)', { error: docusignError?.message });
    }
    
    await IDocument.findByIdAndUpdate(documentMongoId, {
      documentId: documentId,
      status: 'completed',
      pdfFileId: pdfFileId,
      updatedAt: new Date()
    });
    
    await Batch.findOneAndUpdate(
      { batchId },
      { $inc: { processedDocuments: 1 } }
    );
    
    documentsGeneratedTotal.inc({ status: 'completed', template: templateName });
    
    const totalDuration = (Date.now() - startTime) / 1000;
    contextLogger.info('Document generation completed successfully', { duration: totalDuration });
    
    const batch = await Batch.findOne({ batchId });
    const totalDocs = await IDocument.countDocuments({ batchId });
    const completedDocs = await IDocument.countDocuments({ batchId, status: 'completed' });
    const failedDocs = await IDocument.countDocuments({ batchId, status: 'failed' });
    
    if (completedDocs + failedDocs === totalDocs) {
      const newStatus = completedDocs === totalDocs ? 'completed' : 'failed';
      await Batch.findOneAndUpdate({ batchId }, { status: newStatus });
      
      contextLogger.info('Batch completed', { 
        batchId, 
        status: newStatus, 
        total: totalDocs,
        completed: completedDocs,
        failed: failedDocs
      });
    }
    
    await updateQueueMetrics(pdfQueue);
    
  } catch (error: any) {
    const totalDuration = (Date.now() - startTime) / 1000;
    contextLogger.error('Document generation failed', { 
      error: error.message, 
      duration: totalDuration,
      stack: error.stack 
    });
    
    await IDocument.findByIdAndUpdate(documentMongoId, {
      status: 'failed',
      error: error.message,
      $inc: { attempts: 1 },
      updatedAt: new Date()
    });
    
    await Batch.findOneAndUpdate(
      { batchId },
      { $inc: { failedDocuments: 1 } }
    );
    
    documentsGeneratedTotal.inc({ status: 'failed', template: templateName });
    
    throw error;
  }
});

setInterval(async () => {
  await updateQueueMetrics(pdfQueue);
}, 5000);

logger.info('Worker started with metrics and structured logging');