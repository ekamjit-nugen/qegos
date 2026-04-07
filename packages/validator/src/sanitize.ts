import type { Request, Response, NextFunction, RequestHandler } from 'express';
import mongoSanitize from 'mongo-sanitize';

/**
 * Middleware to sanitize req.body, req.query, and req.params against MongoDB
 * injection attacks. Uses mongo-sanitize to strip keys starting with '$' or
 * containing '.'.
 *
 * FIX for Vegeta / GAP-C14: Uses mongo-sanitize package properly, not just a regex.
 */
export function sanitize(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body) {
      req.body = mongoSanitize(req.body);
    }
    if (req.query) {
      // Cast needed because express Query type is complex
      req.query = mongoSanitize(req.query) as typeof req.query;
    }
    if (req.params) {
      req.params = mongoSanitize(req.params) as typeof req.params;
    }
    next();
  };
}
