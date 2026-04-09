import { body } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function signupValidation(): ValidationChain[] {
  return [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile is required')
      .matches(/^\+61\d{9}$/)
      .withMessage('Must be a valid Australian mobile (+61XXXXXXXXX)'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    // Fix for S-3.17: Validate deviceId
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function signinValidation(): ValidationChain[] {
  return [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Must be a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
    // Fix for S-3.17: Validate deviceId
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function sendOtpValidation(): ValidationChain[] {
  return [
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile is required')
      .matches(/^\+61\d{9}$/)
      .withMessage('Must be a valid Australian mobile (+61XXXXXXXXX)'),
  ];
}

export function verifyOtpValidation(): ValidationChain[] {
  return [
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile is required')
      .matches(/^\+61\d{9}$/)
      .withMessage('Must be a valid Australian mobile (+61XXXXXXXXX)'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    // Fix for S-3.17: Validate deviceId
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function refreshTokenValidation(): ValidationChain[] {
  return [
    body('refreshToken')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Refresh token is required'),
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function forgotPasswordValidation(): ValidationChain[] {
  return [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Must be a valid email'),
  ];
}

export function resetPasswordValidation(): ValidationChain[] {
  return [
    body('token').trim().notEmpty().withMessage('Reset token is required'),
    body('password').notEmpty().withMessage('New password is required'),
  ];
}

export function changePasswordValidation(): ValidationChain[] {
  return [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').notEmpty().withMessage('New password is required'),
  ];
}

export function checkUserValidation(): ValidationChain[] {
  return [
    body('mobile')
      .optional()
      .trim()
      .matches(/^\+61\d{9}$/)
      .withMessage('Must be a valid Australian mobile (+61XXXXXXXXX)'),
    body('email').optional().trim().isEmail().withMessage('Must be a valid email'),
  ];
}

export function mfaVerifyValidation(): ValidationChain[] {
  return [
    body('challengeToken').trim().notEmpty().withMessage('MFA challenge token is required'),
    body('token').trim().notEmpty().withMessage('MFA token is required'),
    // Fix for S-3.17: Validate deviceId
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function mfaEnrollValidation(): ValidationChain[] {
  return [
    body('token').trim().notEmpty().withMessage('TOTP token is required for verification'),
  ];
}

export function mfaBackupValidation(): ValidationChain[] {
  return [
    body('challengeToken').trim().notEmpty().withMessage('MFA challenge token is required'),
    body('backupCode').trim().notEmpty().withMessage('Backup code is required'),
    // Fix for S-3.17: Validate deviceId
    body('deviceId').optional().isString().isLength({ max: 128 }).trim(),
  ];
}

export function mfaDisableValidation(): ValidationChain[] {
  return [
    body('password').notEmpty().withMessage('Password is required to disable MFA'),
  ];
}
