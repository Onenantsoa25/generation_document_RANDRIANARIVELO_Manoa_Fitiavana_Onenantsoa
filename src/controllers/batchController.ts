import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Batch } from '../models/Batch';
import { IDocument } from '../models/Document';
import { addPdfJob } from '../services/queueService';

export const createBatch = async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        error: 'userIds est requis et doit etre un tableau non vide' 
      });
    }
    
    if (userIds.length > 1000) {
      return res.status(400).json({ 
        error: 'Le nombre maximum de documents par batch est 1000' 
      });
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
    
    const documents = [];
    for (const userId of userIds) {
      const document = new IDocument({
        documentId: null,
        userId,
        batchId,
        status: 'pending',
        attempts: 0
      });
      await document.save();
      documents.push(document);
      
      await addPdfJob(document._id.toString(), userId, batchId);
    }
    
    console.log(`Batch ${batchId} cree avec ${userIds.length} documents`);
    
    res.status(202).json({
      batchId,
      status: 'pending',
      message: `Batch cree avec ${userIds.length} documents en attente de traitement`
    });
    
  } catch (error) {
    console.error('Erreur lors de la creation du batch:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getBatchStatus = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    
    const batch = await Batch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({ error: 'Batch non trouve' });
    }
    
    const documents = await IDocument.find({ batchId })
      .select('documentId userId status error')
      .sort({ createdAt: 1 });
    
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
    
  } catch (error) {
    console.error('Erreur lors de la recuperation du batch:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};