import { Schema, type Model, type Connection } from 'mongoose';
import type { ICreditTransactionDocument } from './credit.types';
import { CREDIT_TYPES } from './credit.types';

const creditTransactionSchema = new Schema<ICreditTransactionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: CREDIT_TYPES, required: true },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    referenceId: { type: String },
    description: { type: String, required: true },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });
creditTransactionSchema.index({ userId: 1, type: 1 });
creditTransactionSchema.index({ expiresAt: 1 }, { sparse: true });

export function createCreditTransactionModel(
  connection: Connection,
): Model<ICreditTransactionDocument> {
  return connection.model<ICreditTransactionDocument>('CreditTransaction', creditTransactionSchema);
}
