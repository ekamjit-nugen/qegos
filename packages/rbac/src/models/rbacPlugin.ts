import type { Schema } from 'mongoose';

/**
 * Mongoose plugin that adds RBAC fields to any user schema.
 * Consuming models extend IRbacFields interface.
 */
export function rbacPlugin(schema: Schema): void {
  schema.add({
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    userType: {
      type: Number,
      required: true,
      enum: [0, 1, 2, 3, 4, 5, 6],
      index: true,
    },
  });
}
