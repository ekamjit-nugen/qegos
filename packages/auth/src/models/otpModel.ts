import { Schema, type Model, type Connection } from 'mongoose';
import type { IOtpDocument } from '../types';

const otpSchema = new Schema<IOtpDocument>(
  {
    mobile: { type: String, required: true, index: true },
    otpHash: { type: String, required: true }, // FIX S-2: stored as hash
    expiresAt: { type: Date, required: true, index: true },
    isUsed: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// TTL index for auto-expiry (SEC-INV-08: 5-min expiry)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Factory function to create the OTP model on a given connection.
 * Packages don't connect to DB — consuming app provides the connection.
 */
export function createOtpModel(connection: Connection): Model<IOtpDocument> {
  return connection.model<IOtpDocument>('Otp', otpSchema);
}
