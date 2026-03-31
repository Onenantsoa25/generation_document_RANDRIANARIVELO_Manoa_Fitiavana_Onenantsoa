import { Request, Response } from 'express';
import { IDocument } from '../models/Document';
import { getGridFSBucket } from '../config/database';
import { ObjectId } from 'mongodb';

export const getDocument = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    
    const document = await IDocument.findOne({ documentId });
    if (!document) {
      return res.status(404).json({ error: 'Document non trouve' });
    }
    
    if (document.status !== 'completed') {
      return res.status(400).json({ 
        error: `Document non encore genere (status: ${document.status})` 
      });
    }
    
    if (!document.pdfFileId) {
      return res.status(404).json({ error: 'Fichier PDF non trouve' });
    }
    
    const bucket = getGridFSBucket();
    const downloadStream = bucket.openDownloadStream(new ObjectId(document.pdfFileId));
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=document_${documentId}.pdf`);
    
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error: Error) => {
      console.error('Erreur lors du telechargement:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur lors du telechargement du PDF' });
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la recuperation du document:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};