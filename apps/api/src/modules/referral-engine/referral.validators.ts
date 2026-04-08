import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import { REFERRAL_CHANNELS, REFERRAL_REWARD_TYPES } from './referral.types';

export function validateShare(): ValidationChain[] {
  return [
    body('channel')
      .trim().notEmpty().withMessage('Channel is required')
      .isIn(REFERRAL_CHANNELS)
      .withMessage('Invalid referral channel'),
  ];
}

export function validateApply(): ValidationChain[] {
  return [
    body('referralCode')
      .trim().notEmpty().withMessage('Referral code is required')
      .matches(/^QGS-REF-\d{4,}$/i).withMessage('Invalid referral code format'),
    body('refereeUserId')
      .trim().notEmpty().withMessage('Referee user ID is required')
      .isMongoId().withMessage('Referee user ID must be a valid ID'),
    body('refereeLeadId')
      .optional().trim().isMongoId().withMessage('Referee lead ID must be a valid ID'),
  ];
}

export function validateCode(): ValidationChain[] {
  return [
    param('code')
      .trim().notEmpty().withMessage('Code is required'),
  ];
}

export function validateConfigUpdate(): ValidationChain[] {
  return [
    body('isEnabled').optional().isBoolean().withMessage('isEnabled must be a boolean'),
    body('rewardType')
      .optional()
      .isIn(REFERRAL_REWARD_TYPES)
      .withMessage('Invalid reward type'),
    body('referrerRewardValue')
      .optional().isInt({ min: 0 }).withMessage('Referrer reward must be a non-negative integer (cents)')
      .toInt(),
    body('refereeRewardValue')
      .optional().isInt({ min: 0 }).withMessage('Referee reward must be a non-negative integer (cents)')
      .toInt(),
    body('maxReferralsPerClient')
      .optional().isInt({ min: 1 }).withMessage('Max referrals must be a positive integer')
      .toInt(),
    body('referralExpiryDays')
      .optional().isInt({ min: 1 }).withMessage('Expiry days must be a positive integer')
      .toInt(),
    body('minimumOrderValueForReward')
      .optional().isInt({ min: 0 }).withMessage('Minimum order value must be a non-negative integer (cents)')
      .toInt(),
  ];
}

export function validateListParams(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}
