import { body, param, query } from 'express-validator';

export function createPromoCodeValidation(): ReturnType<typeof body>[] {
  return [
    body('code')
      .isString()
      .trim()
      .notEmpty()
      .isLength({ min: 3, max: 30 })
      .withMessage('Code must be 3-30 characters'),
    body('description').isString().trim().notEmpty().withMessage('Description is required'),
    body('discountType').isIn(['percent', 'flat']).withMessage('Must be percent or flat'),
    body('discountValue').isFloat({ gt: 0 }).withMessage('Discount value must be positive'),
    body('minOrderAmount')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Must be non-negative integer (cents)'),
    body('maxDiscountAmount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Must be positive integer (cents)'),
    body('maxUsageTotal').optional().isInt({ min: 1 }).withMessage('Must be positive integer'),
    body('maxUsagePerUser').optional().isInt({ min: 1 }).withMessage('Must be positive integer'),
    body('validFrom').isISO8601().withMessage('Valid ISO 8601 date required'),
    body('validUntil').isISO8601().withMessage('Valid ISO 8601 date required'),
    body('applicableSalesItemIds').optional().isArray(),
    body('applicableSalesItemIds.*').optional().isMongoId(),
  ];
}

export function updatePromoCodeValidation(): ReturnType<typeof body | typeof param>[] {
  return [
    param('id').isMongoId().withMessage('Valid promo code ID required'),
    body('description').optional().isString().trim().notEmpty(),
    body('discountType').optional().isIn(['percent', 'flat']),
    body('discountValue').optional().isFloat({ gt: 0 }),
    body('minOrderAmount').optional().isInt({ min: 0 }),
    body('maxDiscountAmount').optional().isInt({ min: 1 }),
    body('maxUsageTotal').optional().isInt({ min: 1 }),
    body('maxUsagePerUser').optional().isInt({ min: 1 }),
    body('validFrom').optional().isISO8601(),
    body('validUntil').optional().isISO8601(),
  ];
}

export function promoCodeIdValidation(): ReturnType<typeof param>[] {
  return [param('id').isMongoId().withMessage('Valid promo code ID required')];
}

export function listPromoCodesValidation(): ReturnType<typeof query>[] {
  return [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('isActive').optional().isBoolean(),
  ];
}

export function validatePromoCodeValidation(): ReturnType<typeof body>[] {
  return [
    body('code').isString().trim().notEmpty().withMessage('Promo code is required'),
    body('orderAmount')
      .isInt({ min: 0 })
      .withMessage('Order amount must be non-negative integer (cents)'),
    body('salesItemId').optional().isMongoId(),
  ];
}
