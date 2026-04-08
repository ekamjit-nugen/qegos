import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import type { AuthConfig, MfaEnrollmentResult, IAuthDocument } from '../types';

let _config: AuthConfig | null = null;

export function initMfaService(config: AuthConfig): void {
  _config = config;
}

function getConfig(): AuthConfig {
  if (!_config) {
    throw new Error('MFA service not initialized. Call initMfaService(config) first.');
  }
  return _config;
}

/**
 * Generate backup codes for MFA recovery.
 * Returns plaintext codes (shown to user once) and hashed codes (stored).
 * FIX for Vegeta S-3: Backup codes are hashed before storage.
 */
// Fix for S-3.20: Use configurable backup code count
async function generateBackupCodes(count?: number): Promise<{ plaintext: string[]; hashed: string[] }> {
  const config = getConfig();
  const codeCount = count ?? config.mfaBackupCodeCount ?? 10;
  const codes: string[] = [];
  for (let i = 0; i < codeCount; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  const hashed = await Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
  return { plaintext: codes, hashed };
}

/**
 * Enroll a user in MFA. Generates TOTP secret, QR code, and backup codes.
 * The secret is stored on the user document but mfaEnabled remains false
 * until verification is completed.
 * FIX for Vegeta B-10: Issuer comes from config, not hardcoded.
 */
export async function enroll(
  user: IAuthDocument,
  accountName: string,
): Promise<MfaEnrollmentResult> {
  const config = getConfig();

  const totp = new OTPAuth.TOTP({
    issuer: config.mfaIssuer,
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  const secret = totp.secret.base32;
  const uri = totp.toString();
  const qrCodeUrl = await QRCode.toDataURL(uri);

  const { plaintext, hashed } = await generateBackupCodes();

  // Store secret (pending verification) and hashed backup codes
  user.mfaSecret = secret;
  user.mfaBackupCodes = hashed; // FIX S-3: stored as hashes
  // mfaEnabled stays false until verify is called
  await user.save();

  return {
    secret,
    qrCodeUrl,
    backupCodes: plaintext, // Shown to user once
  };
}

/**
 * Verify a TOTP token for MFA enrollment completion or login.
 */
export function verifyToken(secret: string, token: string): boolean {
  const config = getConfig();

  const totp = new OTPAuth.TOTP({
    issuer: config.mfaIssuer,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Allow 1 period window in each direction
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Verify a backup code for MFA recovery.
 * FIX for Vegeta S-3: Compares against hashed backup codes.
 * Removes the used code after successful verification.
 */
export async function verifyBackupCode(
  user: IAuthDocument,
  code: string,
): Promise<boolean> {
  for (let i = 0; i < user.mfaBackupCodes.length; i++) {
    const isMatch = await bcrypt.compare(code, user.mfaBackupCodes[i]);
    if (isMatch) {
      // Remove used backup code
      user.mfaBackupCodes.splice(i, 1);
      await user.save();
      return true;
    }
  }
  return false;
}

/**
 * Complete MFA enrollment by verifying a TOTP token.
 */
export async function completeEnrollment(
  user: IAuthDocument,
  token: string,
): Promise<boolean> {
  if (!user.mfaSecret) {
    return false;
  }

  const isValid = verifyToken(user.mfaSecret, token);
  if (!isValid) {
    return false;
  }

  user.mfaEnabled = true;
  await user.save();
  return true;
}

/**
 * Disable MFA for a user.
 */
export async function disable(user: IAuthDocument): Promise<void> {
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaBackupCodes = [];
  await user.save();
}
