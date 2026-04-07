import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { validationResult } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import { AppError } from '@nugen/error-handler';

/**
 * Validate middleware factory.
 * Accepts an array of express-validator ValidationChains, runs them,
 * and throws an AppError.badRequest if any fail.
 */
export function validate(validations: ValidationChain[]): RequestHandler[] {
  return [
    ...validations,
    (req: Request, _res: Response, next: NextFunction): void => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const fieldErrors = errors.array().map((err) => ({
          field: 'path' in err ? (err.path as string) : 'unknown',
          message: err.msg as string,
        }));
        throw AppError.badRequest('Validation failed', fieldErrors);
      }
      next();
    },
  ];
}
