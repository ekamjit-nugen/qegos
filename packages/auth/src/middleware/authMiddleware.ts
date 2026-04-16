import type { Response, NextFunction, RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import { verifyAccessToken } from '../services/jwtService';
import type { AuthenticatedRequest, IAuthDocument, TokenPayload } from '../types';

let _UserModel: Model<IAuthDocument> | null = null;

export function initAuthMiddleware(UserModel: Model<IAuthDocument>): void {
  _UserModel = UserModel;
}

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header, verifies it,
 * checks passwordChangedAt (SEC-INV-05), account lockout, and status.
 */
export function authenticate(): RequestHandler {
  return async (req, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!_UserModel) {
        throw new Error(
          'Auth middleware not initialized. Call initAuthMiddleware(UserModel) first.',
        );
      }

      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw AppError.unauthorized('Access token is required');
      }

      const token = authHeader.split(' ')[1];
      let decoded: TokenPayload;

      try {
        decoded = verifyAccessToken(token);
      } catch {
        throw AppError.unauthorized('Invalid or expired access token');
      }

      // Fetch user to verify current state
      const user = await _UserModel.findById(decoded.userId).select('+passwordChangedAt').lean<{
        _id: string;
        passwordChangedAt?: Date;
        accountLockedUntil?: Date;
        status: boolean;
        isDeleted: boolean;
      }>();

      if (!user) {
        throw AppError.unauthorized('User no longer exists');
      }

      if (user.isDeleted) {
        throw AppError.unauthorized('Account has been deleted');
      }

      if (!user.status) {
        throw AppError.unauthorized('Account is deactivated');
      }

      // Check account lockout (SEC-INV-02)
      if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        throw AppError.unauthorized('Account is temporarily locked');
      }

      // Check if password was changed after token was issued (SEC-INV-05)
      if (user.passwordChangedAt && decoded.iat) {
        const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (decoded.iat < changedTimestamp) {
          throw AppError.unauthorized('Password was changed. Please log in again.');
        }
      }

      // Attach user info to request
      (req as AuthenticatedRequest).user = {
        userId: decoded.userId,
        userType: decoded.userType,
        roleId: decoded.roleId,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
