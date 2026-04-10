/**
 * FormMapping — parent "document" that groups versions for a given
 * (salesItemId, financialYear) pair. One parent per product per FY.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { IFormMappingDocument } from './formMapping.types';

const formMappingSchema = new Schema<IFormMappingDocument>(
  {
    salesItemId: {
      type: Schema.Types.ObjectId,
      ref: 'Sales',
      required: true,
      index: true,
    },
    financialYear: {
      type: String,
      required: true,
      trim: true,
      // Exact format enforced by validator + service
      match: /^\d{4}-\d{4}$/,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// One parent per (salesItem, FY) pair (soft-deleted ones don't block new)
formMappingSchema.index(
  { salesItemId: 1, financialYear: 1 },
  { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } },
);

// Auto-filter soft-deleted on common reads
formMappingSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});
formMappingSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});
formMappingSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

export function createFormMappingModel(
  connection: Connection,
): Model<IFormMappingDocument> {
  return connection.model<IFormMappingDocument>('FormMapping', formMappingSchema);
}
