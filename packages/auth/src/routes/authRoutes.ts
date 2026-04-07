import { Router, type Request, type Response, type RequestHandler } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as jwtService from '../services/jwtService';
import * as passwordService from '../services/passwordService';
import * as otpService from '../services/otpService';
import * as mfaService from '../services/mfaService';
import { authenticate } from '../middleware/authMiddleware';
import {
  sendOtpValidation,
  verifyOtpValidation,
  signupValidation,
  signinValidation,
  refreshTokenValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  checkUserValidation,
  mfaVerifyValidation,
  mfaEnrollValidation,
  mfaBackupValidation,
  mfaDisableValidation,
} from '../validators/authValidators';
import type { AuthenticatedRequest, IAuthDocument, AuthConfig } from '../types';

export interface AuthRouteDeps {
  UserModel: Model<IAuthDocument>;
  config: AuthConfig;
  authLimiters?: {
    otpSend?: RequestHandler;
    otpVerify?: RequestHandler;
    signin?: RequestHandler;
    forgotPassword?: RequestHandler;
    mfaVerify?: RequestHandler;
  };
}

/**
 * Create auth routes with injected dependencies.
 * Returns an Express Router with 14 auth endpoints.
 */
export function createAuthRoutes(deps: AuthRouteDeps): Router {
  const router = Router();
  const { UserModel, config } = deps;
  const limiters = deps.authLimiters ?? {};

  // --- POST /send-otp ---
  const sendOtpMiddleware: RequestHandler[] = [];
  if (limiters.otpSend) {
    sendOtpMiddleware.push(limiters.otpSend);
  }
  router.post(
    '/send-otp',
    ...sendOtpMiddleware,
    ...validate(sendOtpValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { mobile } = req.body as { mobile: string };
      const result = await otpService.sendOtp(mobile);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- POST /verify-otp ---
  const verifyOtpMiddleware: RequestHandler[] = [];
  if (limiters.otpVerify) {
    verifyOtpMiddleware.push(limiters.otpVerify);
  }
  router.post(
    '/verify-otp',
    ...verifyOtpMiddleware,
    ...validate(verifyOtpValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { mobile, otp } = req.body as { mobile: string; otp: string };
      const isValid = await otpService.verifyOtp(mobile, otp);
      if (!isValid) {
        throw AppError.invalidCredentials('Invalid or expired OTP');
      }

      // Find or signal that user needs registration
      const user = await UserModel.findOne({ mobile, isDeleted: { $ne: true } })
        .select('+refreshTokens');
      if (!user) {
        res.status(200).json({
          status: 200,
          data: { verified: true, userExists: false },
        });
        return;
      }

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };
      const tokens = await jwtService.issueTokenPair(
        user,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      user.lastLoginAt = new Date();
      user.lastLoginIp = req.ip || null;
      await user.resetFailedAttempts();

      res.status(200).json({
        status: 200,
        data: { ...tokens, userExists: true },
      });
    }),
  );

  // --- POST /signup ---
  router.post(
    '/signup',
    ...validate(signupValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { firstName, lastName, mobile, otp } = req.body as {
        firstName: string; lastName: string; mobile: string; otp: string;
      };

      const isValid = await otpService.verifyOtp(mobile, otp);
      if (!isValid) {
        throw AppError.invalidCredentials('Invalid or expired OTP');
      }

      const existing = await UserModel.findOne({ mobile, isDeleted: { $ne: true } });
      if (existing) {
        throw AppError.conflict('User with this mobile already exists');
      }

      const user = await UserModel.create({
        firstName,
        lastName,
        mobile,
        userType: 2, // Client
        status: true,
      }) as IAuthDocument;

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };
      const freshUser = await UserModel.findById(user._id).select('+refreshTokens') as IAuthDocument;
      const tokens = await jwtService.issueTokenPair(
        freshUser,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      res.status(201).json({ status: 201, data: { user, ...tokens } });
    }),
  );

  // --- POST /signin ---
  const signinMiddleware: RequestHandler[] = [];
  if (limiters.signin) {
    signinMiddleware.push(limiters.signin);
  }
  router.post(
    '/signin',
    ...signinMiddleware,
    ...validate(signinValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { email, password } = req.body as { email: string; password: string };

      const user = await UserModel.findOne({ email, isDeleted: { $ne: true } })
        .select('+password +refreshTokens +mfaEnabled +mfaSecret');
      if (!user) {
        throw AppError.invalidCredentials('Invalid email or password');
      }

      if (user.isAccountLocked()) {
        throw AppError.unauthorized('Account is temporarily locked due to too many failed attempts');
      }

      const isCorrect = await user.isCorrectPassword(password);
      if (!isCorrect) {
        await user.incrementFailedAttempts();
        throw AppError.invalidCredentials('Invalid email or password');
      }

      await user.resetFailedAttempts();

      // If MFA is enabled, return challenge token instead of access token
      // FIX for Vegeta S-1: Issue challenge token, not raw userId
      if (user.mfaEnabled) {
        const challengeToken = jwtService.generateMfaChallengeToken(user._id.toString());
        res.status(200).json({
          status: 200,
          data: { mfaRequired: true, challengeToken },
        });
        return;
      }

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };
      const tokens = await jwtService.issueTokenPair(
        user,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      user.lastLoginAt = new Date();
      user.lastLoginIp = req.ip || null;
      await user.save();

      res.status(200).json({ status: 200, data: tokens });
    }),
  );

  // --- POST /mfa-verify ---
  // FIX for Vegeta S-1: Requires challenge token (not raw userId) + rate limiting
  const mfaVerifyMiddleware: RequestHandler[] = [];
  if (limiters.mfaVerify) {
    mfaVerifyMiddleware.push(limiters.mfaVerify);
  }
  router.post(
    '/mfa-verify',
    ...mfaVerifyMiddleware,
    ...validate(mfaVerifyValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { challengeToken, token: mfaToken } = req.body as {
        challengeToken: string; token: string;
      };

      // Verify the time-limited MFA challenge token
      let challenge;
      try {
        challenge = jwtService.verifyMfaChallengeToken(challengeToken);
      } catch {
        throw AppError.unauthorized('Invalid or expired MFA challenge. Please sign in again.');
      }

      const user = await UserModel.findById(challenge.userId)
        .select('+mfaSecret +refreshTokens');
      if (!user || !user.mfaSecret) {
        throw AppError.unauthorized('MFA not configured');
      }

      const isValid = mfaService.verifyToken(user.mfaSecret, mfaToken);
      if (!isValid) {
        throw AppError.invalidCredentials('Invalid MFA token');
      }

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };
      const tokens = await jwtService.issueTokenPair(
        user,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      user.lastLoginAt = new Date();
      user.lastLoginIp = req.ip || null;
      await user.save();

      res.status(200).json({ status: 200, data: tokens });
    }),
  );

  // --- POST /mfa-backup ---
  // FIX for Vegeta S-1: Uses challenge token, not raw userId
  router.post(
    '/mfa-backup',
    ...validate(mfaBackupValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { challengeToken, backupCode } = req.body as {
        challengeToken: string; backupCode: string;
      };

      let challenge;
      try {
        challenge = jwtService.verifyMfaChallengeToken(challengeToken);
      } catch {
        throw AppError.unauthorized('Invalid or expired MFA challenge. Please sign in again.');
      }

      const user = await UserModel.findById(challenge.userId)
        .select('+mfaBackupCodes +refreshTokens');
      if (!user) {
        throw AppError.unauthorized('User not found');
      }

      const isValid = await mfaService.verifyBackupCode(user, backupCode);
      if (!isValid) {
        throw AppError.invalidCredentials('Invalid backup code');
      }

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };
      const tokens = await jwtService.issueTokenPair(
        user,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      res.status(200).json({ status: 200, data: tokens });
    }),
  );

  // --- POST /refresh ---
  router.post(
    '/refresh',
    ...validate(refreshTokenValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // Accept refresh token from cookie or body
      const refreshToken =
        (req.cookies as Record<string, string>)?.refreshToken ||
        (req.body as Record<string, string>).refreshToken;

      if (!refreshToken) {
        throw AppError.unauthorized('Refresh token is required');
      }

      let decoded;
      try {
        decoded = jwtService.verifyRefreshToken(refreshToken);
      } catch {
        throw AppError.tokenExpired('Refresh token is invalid or expired');
      }

      const user = await UserModel.findById(decoded.userId)
        .select('+refreshTokens');
      if (!user || user.isDeleted || !user.status) {
        throw AppError.unauthorized('User not found or inactive');
      }

      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = decoded.deviceId } = req.body as { deviceId?: string };
      const tokens = await jwtService.rotateRefreshToken(
        user,
        refreshToken,
        deviceId,
        req.headers['user-agent'] || '',
        req.ip || '',
      );

      if (!tokens) {
        // Replay attack detected — all tokens revoked
        throw AppError.unauthorized('Refresh token reuse detected. All sessions have been terminated.');
      }

      res.status(200).json({ status: 200, data: tokens });
    }),
  );

  // --- POST /logout ---
  router.post(
    '/logout',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId = 'default' } = req.body as { deviceId?: string };

      const user = await UserModel.findById(userId).select('+refreshTokens');
      if (user) {
        await jwtService.revokeToken(user, deviceId);
      }

      res.status(200).json({ status: 200, data: { message: 'Logged out successfully' } });
    }),
  );

  // --- POST /logout-all ---
  router.post(
    '/logout-all',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;

      const user = await UserModel.findById(userId).select('+refreshTokens');
      if (user) {
        await jwtService.revokeAllTokens(user);
      }

      res.status(200).json({
        status: 200,
        data: { message: 'All sessions terminated' },
      });
    }),
  );

  // --- POST /forgot-password ---
  const forgotPwdMiddleware: RequestHandler[] = [];
  if (limiters.forgotPassword) {
    forgotPwdMiddleware.push(limiters.forgotPassword);
  }
  router.post(
    '/forgot-password',
    ...forgotPwdMiddleware,
    ...validate(forgotPasswordValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { email } = req.body as { email: string };

      // Always return success to prevent email enumeration
      const user = await UserModel.findOne({ email, isDeleted: { $ne: true } })
        .select('+passwordResetToken');

      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        // Fix for S-3.16: Use bcrypt instead of SHA-256 for password reset tokens
        const hashedToken = await bcrypt.hash(resetToken, 10);

        user.set('passwordResetToken', hashedToken);
        user.set('passwordResetExpires', new Date(Date.now() + 60 * 60 * 1000)); // 1 hour
        await user.save();

        if (config.sendPasswordResetEmail) {
          await config.sendPasswordResetEmail(email, resetToken);
        }
      }

      res.status(200).json({
        status: 200,
        data: { message: 'If the email exists, a reset link has been sent' },
      });
    }),
  );

  // --- POST /reset-password ---
  router.post(
    '/reset-password',
    ...validate(resetPasswordValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { token, password } = req.body as { token: string; password: string };

      // Validate password policy
      const policyErrors = passwordService.validatePolicy(password);
      if (policyErrors.length > 0) {
        throw AppError.badRequest('Password does not meet requirements', policyErrors.map((msg) => ({
          field: 'password',
          message: msg,
        })));
      }

      // Fix for S-3.16: Find users with unexpired reset tokens, then bcrypt compare
      const candidateUsers = await UserModel.find({
        passwordResetToken: { $ne: null },
        passwordResetExpires: { $gt: new Date() },
        isDeleted: { $ne: true },
      }).select('+password +refreshTokens +passwordResetToken');

      let user: typeof candidateUsers[0] | null = null;
      for (const candidate of candidateUsers) {
        const storedToken = candidate.get('passwordResetToken') as string | null;
        if (storedToken && await bcrypt.compare(token, storedToken)) {
          user = candidate;
          break;
        }
      }

      if (!user) {
        throw AppError.badRequest('Invalid or expired reset token');
      }

      user.set('password', password); // Pre-save hook will hash it
      user.set('passwordResetToken', null);
      user.set('passwordResetExpires', null);
      user.refreshTokens = []; // Invalidate all sessions
      await user.save();

      res.status(200).json({
        status: 200,
        data: { message: 'Password reset successful. Please log in again.' },
      });
    }),
  );

  // --- POST /change-password ---
  router.post(
    '/change-password',
    authenticate() as RequestHandler,
    ...validate(changePasswordValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string; newPassword: string;
      };

      const policyErrors = passwordService.validatePolicy(newPassword);
      if (policyErrors.length > 0) {
        throw AppError.badRequest('Password does not meet requirements', policyErrors.map((msg) => ({
          field: 'newPassword',
          message: msg,
        })));
      }

      const user = await UserModel.findById(userId).select('+password +refreshTokens');
      if (!user) {
        throw AppError.notFound('User');
      }

      const isCorrect = await user.isCorrectPassword(currentPassword);
      if (!isCorrect) {
        throw AppError.invalidCredentials('Current password is incorrect');
      }

      user.set('password', newPassword);
      // Keep only the current session, revoke others
      // Fix for S-3.17: Read validated deviceId from body
      const { deviceId: currentDeviceId = 'default' } = req.body as { deviceId?: string };
      user.refreshTokens = user.refreshTokens.filter((t) => t.deviceId === currentDeviceId);
      await user.save();

      res.status(200).json({
        status: 200,
        data: { message: 'Password changed. Other sessions have been terminated.' },
      });
    }),
  );

  // --- POST /check-user ---
  router.post(
    '/check-user',
    ...validate(checkUserValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { mobile, email } = req.body as { mobile?: string; email?: string };

      const query: Record<string, unknown> = { isDeleted: { $ne: true } };
      if (mobile) {
        query.mobile = mobile;
      }
      if (email) {
        query.email = email;
      }

      const exists = await UserModel.exists(query);
      res.status(200).json({
        status: 200,
        data: { exists: !!exists },
      });
    }),
  );

  // --- POST /mfa-enroll --- (FIX B-27: requires authenticated user)
  router.post(
    '/mfa-enroll',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;

      const user = await UserModel.findById(userId).select('+mfaSecret +mfaBackupCodes');
      if (!user) {
        throw AppError.notFound('User');
      }

      if (user.mfaEnabled) {
        throw AppError.conflict('MFA is already enabled');
      }

      const accountName = user.email || user.mobile || userId;
      const result = await mfaService.enroll(user, accountName);

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- POST /mfa-enroll/verify --- (Complete enrollment with TOTP verification)
  router.post(
    '/mfa-enroll/verify',
    authenticate() as RequestHandler,
    ...validate(mfaEnrollValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const { token: totpToken } = req.body as { token: string };

      const user = await UserModel.findById(userId).select('+mfaSecret');
      if (!user) {
        throw AppError.notFound('User');
      }

      const success = await mfaService.completeEnrollment(user, totpToken);
      if (!success) {
        throw AppError.badRequest('Invalid TOTP token. Please try again.');
      }

      res.status(200).json({
        status: 200,
        data: { message: 'MFA enabled successfully' },
      });
    }),
  );

  // --- POST /mfa-disable --- (FIX G-4: MFA disable with password re-verification)
  router.post(
    '/mfa-disable',
    authenticate() as RequestHandler,
    ...validate(mfaDisableValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const { password } = req.body as { password: string };

      const user = await UserModel.findById(userId)
        .select('+password +mfaSecret +mfaBackupCodes');
      if (!user) {
        throw AppError.notFound('User');
      }

      const isCorrect = await user.isCorrectPassword(password);
      if (!isCorrect) {
        throw AppError.invalidCredentials('Incorrect password');
      }

      await mfaService.disable(user);

      res.status(200).json({
        status: 200,
        data: { message: 'MFA disabled successfully' },
      });
    }),
  );

  return router;
}
