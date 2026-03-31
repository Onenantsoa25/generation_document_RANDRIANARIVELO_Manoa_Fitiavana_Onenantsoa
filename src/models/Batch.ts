import mongoose, { Schema, Document } from 'mongoose';

export interface IBatch extends Document {
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema({
  batchId: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  totalDocuments: { type: Number, required: true },
  processedDocuments: { type: Number, default: 0 },
  failedDocuments: { type: Number, default: 0 }
}, { 
  timestamps: true 
});

export const Batch = mongoose.model<IBatch>('Batch', BatchSchema);