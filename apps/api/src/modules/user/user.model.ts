import { Schema, type Model, type Connection } from 'mongoose';
import crypto from 'crypto';
import { authPlugin } from '@nugen/auth';
import { rbacPlugin } from '@nugen/rbac';
import { getConfig } from '../../config/env';
import type { IUserDocument } from './user.types';

const consentSchema = new Schema(
  {
    consented: { type: Boolean, default: false },
    date: { type: Date },
    source: { type: String },
  },
  { _id: false },
);

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },
    mobile: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    status: { type: Boolean, default: true },
    profileImage: { type: String },
    dateOfBirth: { type: Date },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    address: {
      type: {
        street: String,
        suburb: String,
        state: {
          type: String,
          enum: ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'],
        },
        postcode: {
          type: String,
          match: /^\d{4}$/,
        },
        country: { type: String, default: 'AU' },
      },
    },
    tfnLastThree: { type: String },
    tfnEncrypted: { type: String, select: false },
    abnNumber: { type: String },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'de_facto', 'separated', 'divorced', 'widowed'],
    },
    preferredLanguage: { type: String, default: 'en', enum: ['en', 'zh', 'hi', 'pa', 'vi', 'ar', 'other'] },
    preferredContact: { type: String, default: 'sms', enum: ['call', 'sms', 'email', 'whatsapp'] },
    timezone: { type: String, default: 'Australia/Sydney' },
    referralCode: { type: String, unique: true, sparse: true },
    creditBalance: { type: Number, default: 0 },
    storageUsed: { type: Number, default: 0 },
    storageQuota: { type: Number, default: 524288000 }, // 500MB
    fcmTokens: [
      {
        token: String,
        deviceId: String,
        platform: { type: String, enum: ['ios', 'android', 'web'] },
        lastUsed: { type: Date, default: Date.now },
      },
    ],
    consentRecord: {
      marketingSms: consentSchema,
      marketingEmail: consentSchema,
      marketingWhatsapp: consentSchema,
      marketingPush: consentSchema,
    },
    college: { type: String },
    discount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Apply auth and RBAC plugins
userSchema.plugin(authPlugin);
userSchema.plugin(rbacPlugin);

// Indexes
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ userType: 1, status: 1 });
userSchema.index({ isDeleted: 1, status: 1 });

// Soft-delete default filter
userSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

userSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

userSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

/**
 * TFN Encryption: AES-256-GCM (SEC-INV-09).
 * FIX for Vegeta S-8: Uses config module, not direct process.env.
 */
export function encryptTfn(tfn: string): string {
  const config = getConfig();
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(tfn, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptTfn(encryptedTfn: string): string {
  const config = getConfig();
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encrypted] = encryptedTfn.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Factory function to create the User model.
 */
export function createUserModel(connection: Connection): Model<IUserDocument> {
  return connection.model<IUserDocument>('User', userSchema);
}
