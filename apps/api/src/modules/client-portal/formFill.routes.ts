/**
 * Client-facing Form Fill Routes
 *
 * These routes allow authenticated clients to:
 * 1. Browse available form mappings (published defaults)
 * 2. Fetch a specific form schema for rendering
 * 3. Submit a filled form → creates an Order
 */

import { Router, type Request, type Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import type { Model, Types } from 'mongoose';
import type { IFormMappingDocument, IFormMappingVersionDocument } from '../form-mapping/formMapping.types';
import type { IOrderDocument2, ISalesDocument } from '../order-management/order.types';
import { OrderStatus } from '../order-management/order.types';
import type { ICounterDocument } from '../../database/counter.model';
import type { PromoCodeServiceResult } from '../promo-code/promoCode.service';
import type { CreditServiceResult } from '../credit/credit.service';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: { _id: string; userId: string; userType?: number; firstName?: string; lastName?: string; email?: string; mobile?: string };
}

export interface FormFillRouteDeps {
  FormMappingModel: Model<IFormMappingDocument>;
  FormMappingVersionModel: Model<IFormMappingVersionDocument>;
  OrderModel: Model<IOrderDocument2>;
  SalesModel: Model<ISalesDocument>;
  CounterModel: Model<ICounterDocument>;
  authenticate: () => import('express').RequestHandler;
  promoCodeService?: PromoCodeServiceResult;
  creditService?: CreditServiceResult;
}

// ─── Validators ────────────────────────────────────────────────────────────

const submitFormValidation = [
  body('mappingId').isMongoId().withMessage('Valid mapping ID is required'),
  body('versionNumber').isInt({ min: 1 }).withMessage('Version number is required'),
  body('financialYear')
    .isString()
    .matches(/^\d{4}-\d{4}$/)
    .withMessage('Financial year must be YYYY-YYYY format'),
  body('personalDetails').isObject().withMessage('Personal details are required'),
  body('personalDetails.firstName').isString().trim().notEmpty().withMessage('First name is required'),
  body('personalDetails.lastName').isString().trim().notEmpty().withMessage('Last name is required'),
  body('personalDetails.email').optional().isEmail().withMessage('Valid email required'),
  body('personalDetails.mobile').optional().isString(),
  body('answers').isObject().withMessage('Form answers are required'),
  body('promoCode').optional().isString().trim(),
  body('useCredits').optional().isBoolean(),
];

const validatePromoValidation = [
  body('code').isString().trim().notEmpty().withMessage('Promo code is required'),
  body('orderAmount').isInt({ min: 0 }).withMessage('Order amount must be non-negative integer (cents)'),
  body('salesItemId').optional().isMongoId(),
];

// ─── Route Factory ─────────────────────────────────────────────────────────

export function createFormFillRoutes(deps: FormFillRouteDeps): Router {
  const router = Router();
  const {
    FormMappingModel,
    FormMappingVersionModel,
    OrderModel,
    SalesModel,
    CounterModel,
    promoCodeService,
    creditService,
  } = deps;

  // All routes require authentication
  const authMiddleware = typeof deps.authenticate === 'function' && deps.authenticate.length === 0
    ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
    : deps.authenticate;
  router.use(authMiddleware);

  // ── GET /form-mappings/available ──────────────────────────────────────
  // List published default form mappings clients can fill

  router.get('/form-mappings/available', async (_req: Request, res: Response): Promise<void> => {
    try {
      // Find all default + published + active versions
      const versions = await FormMappingVersionModel.find({
        isDefault: true,
        status: 'published',
        lifecycleStatus: 'active',
      }).lean();

      if (versions.length === 0) {
        res.status(200).json({ status: 200, data: { mappings: [] } });
        return;
      }

      // Get parent mappings
      const mappingIds = versions.map((v) => v.mappingId);
      const mappings = await FormMappingModel.find({
        _id: { $in: mappingIds },
        isDeleted: { $ne: true },
      }).lean();

      // Get sales items for titles/prices
      const salesItemIds = mappings.map((m) => m.salesItemId);
      const salesItems = await SalesModel.find({
        _id: { $in: salesItemIds },
        isActive: true,
      }).lean();

      const salesMap = new Map(salesItems.map((s) => [String(s._id), s]));
      const versionMap = new Map(versions.map((v) => [String(v.mappingId), v]));

      const result = mappings
        .map((m) => {
          const version = versionMap.get(String(m._id));
          const salesItem = salesMap.get(String(m.salesItemId));
          if (!version || !salesItem) return null;
          return {
            mappingId: String(m._id),
            salesItemId: String(m.salesItemId),
            financialYear: m.financialYear,
            title: m.title,
            description: m.description,
            version: version.version,
            schema: version.jsonSchema,
            uiOrder: version.uiOrder,
            serviceTitle: salesItem.title,
            servicePrice: salesItem.price,
            serviceCategory: salesItem.category,
          };
        })
        .filter(Boolean);

      res.status(200).json({ status: 200, data: { mappings: result } });
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      res.status(error.statusCode ?? 500).json({
        status: error.statusCode ?? 500,
        message: error.message,
      });
    }
  });

  // ── GET /form-mappings/:mappingId/version/:version ────────────────────
  // Get a specific form mapping version schema

  router.get(
    '/form-mappings/:mappingId/version/:version',
    param('mappingId').isMongoId(),
    param('version').isInt({ min: 1 }),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      try {
        const mapping = await FormMappingModel.findById(req.params.mappingId).lean();
        if (!mapping || mapping.isDeleted) {
          res.status(404).json({ status: 404, message: 'Form mapping not found' });
          return;
        }

        const version = await FormMappingVersionModel.findOne({
          mappingId: mapping._id,
          version: Number(req.params.version),
          status: 'published',
          lifecycleStatus: 'active',
        }).lean();

        if (!version) {
          res.status(404).json({ status: 404, message: 'Form version not found or not published' });
          return;
        }

        res.status(200).json({
          status: 200,
          data: {
            mappingId: String(mapping._id),
            financialYear: mapping.financialYear,
            title: mapping.title,
            description: mapping.description,
            version: version.version,
            schema: version.jsonSchema,
            uiOrder: version.uiOrder,
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // ── POST /form-fill/submit ────────────────────────────────────────────
  // Submit filled form → creates an Order

  router.post(
    '/form-fill/submit',
    ...submitFormValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const {
          mappingId, versionNumber, financialYear, personalDetails, answers,
          promoCode: promoCodeInput, useCredits,
        } = req.body as {
          mappingId: string;
          versionNumber: number;
          financialYear: string;
          personalDetails: {
            firstName: string;
            lastName: string;
            email?: string;
            mobile?: string;
            dateOfBirth?: string;
          };
          answers: Record<string, unknown>;
          promoCode?: string;
          useCredits?: boolean;
        };

        // 1. Validate form mapping exists and is published
        const mapping = await FormMappingModel.findById(mappingId).lean();
        if (!mapping || mapping.isDeleted) {
          res.status(404).json({ status: 404, message: 'Form mapping not found' });
          return;
        }

        const version = await FormMappingVersionModel.findOne({
          mappingId: mapping._id,
          version: versionNumber,
          status: 'published',
          lifecycleStatus: 'active',
        }).lean();

        if (!version) {
          res.status(404).json({ status: 404, message: 'Form version not found or not published' });
          return;
        }

        // 2. Get sales item for line item creation
        const salesItem = await SalesModel.findById(mapping.salesItemId).lean();
        if (!salesItem) {
          res.status(404).json({ status: 404, message: 'Service not found' });
          return;
        }

        // 3. Generate order number
        const { generateOrderNumber } = await import('../order-management/order.model');
        const orderNumber = await generateOrderNumber(OrderModel, CounterModel);

        // 4. Create line items
        const lineItems = [{
          salesId: salesItem._id as Types.ObjectId,
          title: salesItem.title,
          price: salesItem.price,
          quantity: 1,
          priceAtCreation: salesItem.price,
          completionStatus: 'not_started' as const,
        }];

        const totalAmount = salesItem.price;
        let discountAmount = 0;
        let discountPercent = 0;
        let discountSource: string | undefined;
        let promoCodeId: Types.ObjectId | undefined;
        let promoCodeStr: string | undefined;

        // 5. Apply promo code discount if provided
        if (promoCodeInput && promoCodeService) {
          const validation = await promoCodeService.validatePromoCode(
            promoCodeInput,
            userId,
            totalAmount,
            String(salesItem._id),
          );
          if (validation.valid) {
            discountAmount = validation.calculatedDiscount;
            discountSource = 'promo_code';
            promoCodeId = validation.promoCodeId as unknown as Types.ObjectId;
            promoCodeStr = promoCodeInput.toUpperCase();
          }
        }

        const afterDiscount = totalAmount - discountAmount;

        // 6. Apply credit balance if requested
        let creditApplied = 0;
        if (useCredits && creditService && afterDiscount > 0) {
          const creditBalance = await creditService.getBalance(userId);
          creditApplied = Math.min(creditBalance, afterDiscount);
        }

        const finalAmount = afterDiscount - creditApplied;

        // 7. Create the order
        const order = await OrderModel.create({
          orderNumber,
          userId,
          financialYear,
          status: OrderStatus.Pending,
          personalDetails: {
            firstName: personalDetails.firstName,
            lastName: personalDetails.lastName,
            email: personalDetails.email,
            mobile: personalDetails.mobile,
            ...(personalDetails.dateOfBirth ? { dateOfBirth: new Date(personalDetails.dateOfBirth) } : {}),
          },
          lineItems,
          totalAmount,
          discountPercent,
          discountAmount,
          finalAmount,
          discountSource,
          promoCodeId,
          promoCode: promoCodeStr,
          creditApplied,
          formMappingId: mapping._id,
          formVersionNumber: versionNumber,
          formAnswers: answers,
          completionPercent: 0,
          noaReceived: false,
          orderType: 'standard',
          amendmentCount: 0,
          isDeleted: false,
        });

        // 8. Record promo code usage
        if (promoCodeStr && promoCodeService && discountAmount > 0) {
          await promoCodeService.applyPromoCode(promoCodeStr, userId, String(order._id), totalAmount);
        }

        // 9. Deduct credits if applied
        if (creditApplied > 0 && creditService) {
          await creditService.useCredit(userId, creditApplied, String(order._id));
        }

        res.status(201).json({
          status: 201,
          data: {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            financialYear: order.financialYear,
            status: order.status,
            totalAmount: order.totalAmount,
            discountAmount: order.discountAmount,
            creditApplied: order.creditApplied,
            finalAmount: order.finalAmount,
            promoCode: promoCodeStr,
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── POST /validate-promo ──────────────────────────────────────────────
  // Validate a promo code before submitting the order

  router.post(
    '/validate-promo',
    ...validatePromoValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      if (!promoCodeService) {
        res.status(501).json({ status: 501, message: 'Promo codes not enabled' });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id ?? '';

      try {
        const { code, orderAmount, salesItemId } = req.body as {
          code: string;
          orderAmount: number;
          salesItemId?: string;
        };

        const result = await promoCodeService.validatePromoCode(code, userId, orderAmount, salesItemId);
        res.status(200).json({ status: 200, data: result });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  return router;
}
