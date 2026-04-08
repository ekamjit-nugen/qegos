import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import type { AuthConfig, IOtpDocument } from '../types';

let _config: AuthConfig | null = null;
let _OtpModel: Model<IOtpDocument> | null = null;

export function initOtpService(config: AuthConfig, OtpModel: Model<IOtpDocument>): void {
  _config = config;
  _OtpModel = OtpModel;
}

function getConfig(): AuthConfig {
  if (!_config) {
    throw new Error('OTP service not initialized. Call initOtpService(config, OtpModel) first.');
  }
  return _config;
}

function getModel(): Model<IOtpDocument> {
  if (!_OtpModel) {
    throw new Error('OTP model not initialized. Call initOtpService(config, OtpModel) first.');
  }
  return _OtpModel;
}

/**
 * Generate a numeric OTP of configured length.
 */
function generateOtp(length: number): string {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const num = crypto.randomInt(min, max);
  return num.toString();
}

/**
 * Send a new OTP for the given mobile number.
 * FIX for Vegeta S-2: OTP is hashed (bcrypt) before storage.
 */
export async function sendOtp(mobile: string): Promise<{ message: string }> {
  const config = getConfig();
  const OtpModel = getModel();

  // Invalidate existing OTPs for this mobile
  await OtpModel.deleteMany({ mobile });

  const otpCode = generateOtp(config.otpLength);

  // Hash OTP before storage (FIX S-2)
  const otpHash = await bcrypt.hash(otpCode, 10);

  const expiresAt = new Date(Date.now() + config.otpExpiry * 1000);

  await OtpModel.create({
    mobile,
    otpHash,
    expiresAt,
    isUsed: false,
    attempts: 0,
  });

  // Delegate actual sending to configured provider
  if (config.sendOtp) {
    await config.sendOtp(mobile, otpCode);
  }

  return { message: 'OTP sent successfully' };
}

/**
 * Verify an OTP for the given mobile number.
 * FIX for Vegeta S-2: Compares by hashing input against stored hash.
 * OTP is single-use and deleted after successful verification (SEC-INV-08).
 */
export async function verifyOtp(mobile: string, otpCode: string): Promise<boolean> {
  const OtpModel = getModel();

  const otpRecord = await OtpModel.findOne({
    mobile,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return false;
  }

  // Fix for S-3.15: Check max attempts before comparing
  const config = getConfig();
  const maxAttempts = config.otpMaxAttempts ?? 5;
  if (otpRecord.attempts >= maxAttempts) {
    await OtpModel.deleteOne({ _id: otpRecord._id });
    return false;
  }

  // Increment attempts
  otpRecord.attempts += 1;

  // Compare hashed OTP (FIX S-2)
  const isMatch = await bcrypt.compare(otpCode, otpRecord.otpHash);

  if (!isMatch) {
    await otpRecord.save();
    return false;
  }

  // Mark as used and delete (single use — SEC-INV-08)
  await OtpModel.deleteOne({ _id: otpRecord._id });

  return true;
}
