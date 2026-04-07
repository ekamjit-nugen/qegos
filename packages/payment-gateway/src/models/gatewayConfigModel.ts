import { Schema, type Model, type Connection } from 'mongoose';
import type {
  IGatewayConfigDocument,
  PaymentGateway,
  RoutingRule,
} from '../types';

const gatewayConfigSchema = new Schema<IGatewayConfigDocument>(
  {
    primaryGateway: {
      type: String,
      required: true,
      enum: ['stripe', 'payzoo'] as PaymentGateway[],
      default: 'stripe',
    },
    routingRule: {
      type: String,
      required: true,
      enum: ['primary_only', 'fallback', 'round_robin', 'amount_based'] as RoutingRule[],
      default: 'primary_only',
    },
    amountThreshold: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'Amount threshold must be a non-negative integer (cents)',
      },
    },
    stripeEnabled: { type: Boolean, default: true },
    stripePublishableKey: { type: String, default: '' },
    payzooEnabled: { type: Boolean, default: false },
    payzooPublicKey: { type: String, default: '' },
    fallbackTimeoutMs: {
      type: Number,
      default: 10000,
      min: [1000, 'Fallback timeout must be at least 1000ms'],
      max: [60000, 'Fallback timeout must be at most 60000ms'],
    },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: 'Payment processing is temporarily unavailable. Please try again later.',
      trim: true,
    },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

/**
 * Factory function to create the GatewayConfig model.
 * Singleton pattern — only one config document should exist.
 */
export function createGatewayConfigModel(connection: Connection): Model<IGatewayConfigDocument> {
  return connection.model<IGatewayConfigDocument>('PaymentGatewayConfig', gatewayConfigSchema);
}
