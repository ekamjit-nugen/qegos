import type { Connection, Model } from 'mongoose';
import { initJwtService } from './services/jwtService';
import { initPasswordService } from './services/passwordService';
import { initOtpService } from './services/otpService';
import { initMfaService } from './services/mfaService';
import { initAuthPlugin } from './models/authPlugin';
import { initAuthMiddleware } from './middleware/authMiddleware';
import { createOtpModel } from './models/otpModel';
import type { AuthConfig, IAuthDocument, IOtpDocument } from './types';

export interface AuthInitResult {
  OtpModel: Model<IOtpDocument>;
}

/**
 * Initialize the auth package with configuration and database connection.
 * Must be called before using any auth services, middleware, or routes.
 */
export function init(
  config: AuthConfig,
  connection: Connection,
  UserModel: Model<IAuthDocument>,
): AuthInitResult {
  initJwtService(config);
  initPasswordService(config);
  initAuthPlugin(config);
  initMfaService(config);

  const OtpModel = createOtpModel(connection);
  initOtpService(config, OtpModel);
  initAuthMiddleware(UserModel);

  return { OtpModel };
}

// Re-export everything
export * from './types';
export { authPlugin } from './models/authPlugin';
export { createOtpModel } from './models/otpModel';
export { authenticate, initAuthMiddleware } from './middleware/authMiddleware';
export { createAuthRoutes, type AuthRouteDeps } from './routes/authRoutes';
export * as jwtService from './services/jwtService';
export * as passwordService from './services/passwordService';
export * as otpService from './services/otpService';
export * as mfaService from './services/mfaService';
export {
  signupValidation,
  signinValidation,
  sendOtpValidation,
  verifyOtpValidation,
  refreshTokenValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  checkUserValidation,
  mfaVerifyValidation,
  mfaEnrollValidation,
  mfaBackupValidation,
  mfaDisableValidation,
} from './validators/authValidators';
