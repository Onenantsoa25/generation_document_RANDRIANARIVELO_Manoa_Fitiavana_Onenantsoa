import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Batch } from '../models/Batch';
import { IDocument } from '../models/Document';
import { addPdfJob } from '../services/queueService';
import { logger, createContextLogger } from '../services/logger';
import { documentsGeneratedTotal, batchProcessingDuration } from '../services/metrics';
import { updateQueueMetrics } from '../services/metrics';
import { pdfQueue } from '../services/queueService';

export const createBatch = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { userIds, templateName = 'cerfa' } = req.body;
  
  const contextLogger = createContextLogger({});
  
  try {
    contextLogger.info('Creating batch', { userIdsCount: userIds?.length, templateName });
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      contextLogger.warn('Invalid batch creation request', { error: 'userIds is required' });
      return res.status(400).json({ error: 'userIds est requis et doit être un tableau non vide' });
    }
    
    if (userIds.length > 1000) {
      contextLogger.warn('Batch size exceeds limit', { userIdsCount: userIds.length });
      return res.status(400).json({ error: 'Le nombre maximum de documents par batch est 1000' });
    }
    
    if (!['cerfa', 'convention'].includes(templateName)) {
      contextLogger.warn('Invalid template', { templateName });
      return res.status(400).json({ error: 'templateName doit être "cerfa" ou "convention"' });
    }
    
    const batchId = `batch_${uuidv4()}`;
    
    const batch = new Batch({
      batchId,
      status: 'pending',
      totalDocuments: userIds.length,
      processedDocuments: 0,
      failedDocuments: 0
    });
    await batch.save();
    
    contextLogger.info('Batch created', { batchId, totalDocuments: userIds.length });
    
    for (const userId of userIds) {
      const document = new IDocument({
        documentId: null,
        userId,
        batchId,
        status: 'pending',
        attempts: 0
      });
      await document.save();
      
      await addPdfJob(document._id.toString(), userId, batchId, templateName);
      
      createContextLogger({ batchId, userId }).debug('Job added to queue');
    }
    
    await updateQueueMetrics(pdfQueue);
    
    documentsGeneratedTotal.inc({ status: 'pending', template: templateName }, userIds.length);
    
    const duration = (Date.now() - startTime) / 1000;
    contextLogger.info('Batch creation completed', { batchId, duration, totalDocuments: userIds.length });
    
    res.status(202).json({
      batchId,
      status: 'pending',
      templateName,
      message: `Batch créé avec ${userIds.length} documents en attente de traitement`
    });
    
  } catch (error: any) {
    contextLogger.error('Failed to create batch', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getBatchStatus = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const contextLogger = createContextLogger({ batchId });
    
    contextLogger.debug('Fetching batch status');
    
    const batch = await Batch.findOne({ batchId });
    if (!batch) {
      contextLogger.warn('Batch not found');
      return res.status(404).json({ error: 'Batch non trouvé' });
    }
    
    const documents = await IDocument.find({ batchId })
      .select('documentId userId status error')
      .sort({ createdAt: 1 });
    
    contextLogger.debug('Batch status retrieved', { 
      status: batch.status, 
      processed: batch.processedDocuments,
      total: batch.totalDocuments 
    });
    
    res.json({
      batchId: batch.batchId,
      status: batch.status,
      totalDocuments: batch.totalDocuments,
      processedDocuments: batch.processedDocuments,
      failedDocuments: batch.failedDocuments,
      documents: documents.map(doc => ({
        documentId: doc.documentId,
        userId: doc.userId,
        status: doc.status,
        error: doc.error
      }))
    });
    
  } catch (error: any) {
    logger.error('Error fetching batch status', { batchId: req.params.batchId, error: error.message });
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};