import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { getGridFSBucket } from '../config/database';
import { IDocument } from '../models/Document';
import { Batch } from '../models/Batch';

export const generatePDF = async (userId: string, documentId: string) => {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    
    doc.fontSize(20)
      .font('Helvetica-Bold')
      .text('CERFA N° 12345*01', { align: 'center' })
      .moveDown();
    
    doc.fontSize(14)
      .text('DEMANDE ADMINISTRATIVE', { align: 'center' })
      .moveDown(2);
    
    doc.fontSize(10)
      .text(`Identifiant du demandeur : ${userId}`)
      .text(`Numero de dossier : ${documentId}`)
      .text(`Date de depôt : ${new Date().toLocaleDateString()}`)
      .moveDown();
    
    doc.text('Le present document atteste que la demande a bien ete enregistree.')
      .moveDown();
    
    doc.text('Cachet de l\'administration : _________________________')
      .moveDown(3);
    
    doc.text('Signature : _________________________', { align: 'right' });
    
    doc.end();
  });
};

export const savePDFToGridFS = async (pdfBuffer: Buffer, userId: string, documentId: string) => {
  const bucket = getGridFSBucket();
  
  return new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    const readableStream = new Readable();
    readableStream.push(pdfBuffer);
    readableStream.push(null);
    
    const uploadStream = bucket.openUploadStream(`doc_${documentId}.pdf`, {
      metadata: { 
        userId, 
        documentId,
        generatedAt: new Date()
      }
    });
    
    readableStream.pipe(uploadStream);
    
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);
  });
};

export const updateDocumentStatus = async (
  documentMongoId: string,
  documentId: string,
  pdfFileId: mongoose.Types.ObjectId,
  batchId: string
) => {
  await IDocument.findByIdAndUpdate(documentMongoId, {
    documentId: documentId,
    status: 'completed',
    pdfFileId: pdfFileId,
    updatedAt: new Date()
  });
  
  await Batch.findOneAndUpdate(
    { batchId: batchId },
    { $inc: { processedDocuments: 1 } }
  );
};

export const updateDocumentFailed = async (documentMongoId: string, error: string) => {
  const doc = await IDocument.findByIdAndUpdate(
    documentMongoId,
    {
      status: 'failed',
      error: error,
      $inc: { attempts: 1 },
      updatedAt: new Date()
    },
    { new: true }
  );
  
  if (doc) {
    await Batch.findOneAndUpdate(
      { batchId: doc.batchId },
      { $inc: { failedDocuments: 1 } }
    );
  }
};