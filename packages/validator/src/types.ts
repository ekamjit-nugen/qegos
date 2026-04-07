import type { ValidationChain } from 'express-validator';
import type { RequestHandler } from 'express';

export type ValidatorFactory = (...args: never[]) => ValidationChain | ValidationChain[];

export type ValidateMiddleware = RequestHandler;

export interface SanitizeOptions {
  sanitizeBody?: boolean;
  sanitizeQuery?: boolean;
  sanitizeParams?: boolean;
}

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export const AUSTRALIAN_STATES: AustralianState[] = [
  'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT',
];
