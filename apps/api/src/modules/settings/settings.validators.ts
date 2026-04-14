import { param, body } from 'express-validator';

export function getSettingValidation(): ReturnType<typeof param>[] {
  return [
    param('key').isString().trim().notEmpty().withMessage('Setting key is required'),
  ];
}

export function updateSettingValidation(): ReturnType<typeof param | typeof body>[] {
  return [
    param('key').isString().trim().notEmpty().withMessage('Setting key is required'),
    body('value').exists({ values: 'undefined' }).withMessage('Value is required'),
  ];
}
