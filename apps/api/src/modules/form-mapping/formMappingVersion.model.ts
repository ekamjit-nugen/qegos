/**
 * FormMappingVersion — immutable snapshots + active drafts for a parent
 * FormMapping. Every edit to a published version requires forking a new
 * draft via the service layer. The partial unique index below enforces
 * "at most one default version per mapping" at the storage layer.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { IFormMappingVersionDocument } from './formMapping.types';

const formMappingVersionSchema = new Schema<IFormMappingVersionDocument>(
  {
    mappingId: {
      type: Schema.Types.ObjectId,
      ref: 'FormMapping',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      required: true,
      index: true,
    },
    lifecycleStatus: {
      type: String,
      enum: ['active', 'disabled', null],
      default: null,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    jsonSchema: {
      type: Schema.Types.Mixed,
      required: true,
    },
    uiOrder: {
      type: [String],
      default: [],
    },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    disabledAt: { type: Date, default: null },
    disabledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true, minimize: false },
);

// Version numbers are unique per parent mapping
formMappingVersionSchema.index(
  { mappingId: 1, version: 1 },
  { unique: true },
);

// Fast lookup of the (single) draft per parent
formMappingVersionSchema.index({ mappingId: 1, status: 1 });

// CRITICAL INVARIANT: at most one default per parent mapping.
// Enforced at the storage layer so bugs in the service layer cannot
// silently produce two defaults.
formMappingVersionSchema.index(
  { mappingId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: 'uniq_default_per_mapping',
  },
);

/**
 * Pre-save guard: once a version is published, its `jsonSchema` and `uiOrder`
 * MUST NOT change. The only lifecycle mutations permitted after publish
 * are: lifecycleStatus, isDefault, disabled*, notes.
 */
formMappingVersionSchema.pre('save', function (next) {
  if (!this.isNew && this.status === 'published') {
    if (
      this.isModified('jsonSchema') ||
      this.isModified('uiOrder') ||
      this.isModified('version')
    ) {
      const err = new Error(
        'Cannot modify jsonSchema/uiOrder/version of a published form mapping version. Fork a new draft instead.',
      );
      (err as Error & { code?: string }).code = 'VERSION_PUBLISHED';
      return next(err);
    }
  }
  next();
});

export function createFormMappingVersionModel(
  connection: Connection,
): Model<IFormMappingVersionDocument> {
  return connection.model<IFormMappingVersionDocument>(
    'FormMappingVersion',
    formMappingVersionSchema,
  );
}
