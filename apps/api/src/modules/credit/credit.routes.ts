import { Router, type Request, type Response, type RequestHandler } from 'express';
import { param, query } from 'express-validator';
import { validationResult } from 'express-validator';
import type { Model } from 'mongoose';
import type { ICreditTransactionDocument } from './credit.types';
import { createCreditService } from './credit.service';

interface CreditRouteDeps {
  CreditTransactionModel: Model<ICreditTransactionDocument>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
}

interface AuthRequest extends Request {
  user?: { _id: string; userId?: string; userType?: number };
}

export function createCreditRoutes(deps: CreditRouteDeps): Router {
  const router = Router();
  const service = createCreditService({
    CreditTransactionModel: deps.CreditTransactionModel,
  });

  // GET /credits/balance — Get current user's credit balance
  router.get(
    '/balance',
    deps.authenticate(),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId ?? authReq.user?._id ?? '';
        const balance = await service.getBalance(userId);
        res.status(200).json({ status: 200, data: { balance } });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // GET /credits/transactions — Get current user's credit transactions
  router.get(
    '/transactions',
    deps.authenticate(),
    ...[
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 }),
    ],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId ?? authReq.user?._id ?? '';
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const result = await service.getTransactions(userId, page, limit);
        res.status(200).json({
          status: 200,
          data: result.transactions,
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // GET /credits/balance/:userId — Get a specific user's credit balance (admin)
  router.get(
    '/balance/:userId',
    deps.authenticate(),
    deps.checkPermission('credits', 'read'),
    ...[param('userId').isMongoId().withMessage('Valid user ID required')],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const balance = await service.getBalance(req.params.userId);
        res.status(200).json({ status: 200, data: { userId: req.params.userId, balance } });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // GET /credits/transactions/:userId — Get a specific user's transactions (admin)
  router.get(
    '/transactions/:userId',
    deps.authenticate(),
    deps.checkPermission('credits', 'read'),
    ...[
      param('userId').isMongoId().withMessage('Valid user ID required'),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 }),
    ],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const result = await service.getTransactions(req.params.userId, page, limit);
        res.status(200).json({
          status: 200,
          data: result.transactions,
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  return router;
}
