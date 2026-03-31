import mongoose, { Schema, Document } from 'mongoose';

export interface IDocument extends Document {
  documentId: string | null;
  userId: string;
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  pdfFileId: mongoose.Types.ObjectId | null;
  attempts: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema({
  documentId: { type: String, default: null },
  userId: { type: String, required: true },
  batchId: { type: String, required: true, index: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  pdfFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  attempts: { type: Number, default: 0 },
  error: { type: String }
}, { 
  timestamps: true 
});

export const IDocument = mongoose.model<IDocument>('Document', DocumentSchema);