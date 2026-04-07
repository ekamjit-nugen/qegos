import { Schema, type Model, type Connection } from 'mongoose';
import type { IRoleDocument } from '../types';

const permissionSchema = new Schema(
  {
    resource: { type: String, required: true },
    actions: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]): boolean => v.length > 0,
        message: 'At least one action is required',
      },
    },
    scope: {
      type: String,
      required: true,
      enum: ['all', 'assigned', 'own', 'none'],
    },
  },
  { _id: false },
);

const roleSchema = new Schema<IRoleDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: { type: String, required: true, trim: true },
    permissions: {
      type: [permissionSchema],
      required: true,
      validate: {
        validator: (v: unknown[]): boolean => v.length > 0,
        message: 'At least one permission is required',
      },
    },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

roleSchema.index({ name: 1 }, { unique: true });
roleSchema.index({ isSystem: 1 });
roleSchema.index({ isActive: 1 });

/**
 * Factory function to create the Role model on a given connection.
 */
export function createRoleModel(connection: Connection): Model<IRoleDocument> {
  return connection.model<IRoleDocument>('Role', roleSchema);
}
