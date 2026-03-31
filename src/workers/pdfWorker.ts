import { connectDB } from '../config/database';
import { pdfQueue } from '../services/queueService';
import { 
  generatePDF, 
  savePDFToGridFS, 
  updateDocumentStatus, 
  updateDocumentFailed 
} from '../services/pdfGeneratorService';
import { IDocument } from '../models/Document';
import { Batch } from '../models/Batch';

connectDB();

pdfQueue.process(async (job) => {
  const { documentMongoId, userId, batchId } = job.data;
  const documentId = `doc_${Date.now()}_${userId}`;
  
  console.log(`Traitement du document ${documentId} pour l'utilisateur ${userId}`);
  
  try {
    await IDocument.findByIdAndUpdate(documentMongoId, {
      status: 'processing',
      updatedAt: new Date()
    });
    
    const pdfBuffer = await generatePDF(userId, documentId);
    
    const pdfFileId = await savePDFToGridFS(pdfBuffer, userId, documentId);
    
    await updateDocumentStatus(documentMongoId, documentId, pdfFileId, batchId);
    
    console.log(`Document ${documentId} genere avec succes`);
    
    const batch = await Batch.findOne({ batchId });
    const totalDocs = await IDocument.countDocuments({ batchId });
    const completedDocs = await IDocument.countDocuments({ batchId, status: 'completed' });
    const failedDocs = await IDocument.countDocuments({ batchId, status: 'failed' });
    
    if (completedDocs + failedDocs === totalDocs) {
      await Batch.findOneAndUpdate(
        { batchId },
        { status: completedDocs === totalDocs ? 'completed' : 'failed' }
      );
      console.log(`Batch ${batchId} termine: ${completedDocs}/${totalDocs} succes, ${failedDocs} echecs`);
    } else {
      await Batch.findOneAndUpdate(
        { batchId },
        { status: 'processing' }
      );
    }
    
  } catch (error: any) {
    console.error(`Erreur lors de la generation du document ${documentMongoId}:`, error.message);
    await updateDocumentFailed(documentMongoId, error.message);
    throw error; 
  }
});

pdfQueue.on('completed', (job) => {
  console.log(`Job ${job.id} termine avec succes`);
});

pdfQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} a echoue:`, err.message);
});

pdfQueue.on('error', (error) => {
  console.error('Erreur de queue:', error);
});

console.log('Worker PDF demarre et en attente de jobs...');