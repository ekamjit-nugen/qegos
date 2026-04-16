/**
 * Client-facing Form Fill Routes
 *
 * These routes allow authenticated clients to:
 * 1. Browse available form mappings (published defaults)
 * 2. Fetch a specific form schema for rendering
 * 3. Save / resume form drafts (auto-save on each step)
 * 4. Submit a filled form → creates an Order
 */

import { Router, type Request, type Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import * as _auditLog from '@nugen/audit-log';
import { getRequestId } from '../../lib/requestContext';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};
import type { Model, Types } from 'mongoose';
import type {
  IFormMappingDocument,
  IFormMappingVersionDocument,
} from '../form-mapping/formMapping.types';
import { validateAnswers } from '../form-mapping/formMapping.schema';
import type { FormMappingSchema } from '../form-mapping/formMapping.types';
import type { IOrderDocument2, ISalesDocument } from '../order-management/order.types';
import { OrderStatus } from '../order-management/order.types';
import type { ICounterDocument } from '../../database/counter.model';
import type { PromoCodeServiceResult } from '../promo-code/promoCode.service';
import type { CreditServiceResult } from '../credit/credit.service';
import type { IFormDraftDocument } from './formDraft.model';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: {
    _id: string;
    userId: string;
    userType?: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
  };
}

export interface FormFillRouteDeps {
  FormMappingModel: Model<IFormMappingDocument>;
  FormMappingVersionModel: Model<IFormMappingVersionDocument>;
  OrderModel: Model<IOrderDocument2>;
  SalesModel: Model<ISalesDocument>;
  CounterModel: Model<ICounterDocument>;
  FormDraftModel: Model<IFormDraftDocument>;
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
  body('personalDetails.firstName')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('personalDetails.lastName')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('personalDetails.email').optional().isEmail().withMessage('Valid email required'),
  body('personalDetails.mobile').optional().isString(),
  body('answers').isObject().withMessage('Form answers are required'),
  body('promoCode').optional().isString().trim(),
  body('useCredits').optional().isBoolean(),
  body('draftId').optional().isMongoId().withMessage('Valid draft ID required'),
];

const validatePromoValidation = [
  body('code').isString().trim().notEmpty().withMessage('Promo code is required'),
  body('orderAmount')
    .isInt({ min: 0 })
    .withMessage('Order amount must be non-negative integer (cents)'),
  body('salesItemId').optional().isMongoId(),
];

const saveDraftValidation = [
  body('mappingId').isMongoId().withMessage('Valid mapping ID is required'),
  body('versionNumber').isInt({ min: 1 }).withMessage('Version number is required'),
  body('financialYear')
    .isString()
    .matches(/^\d{4}-\d{4}$/)
    .withMessage('Financial year must be YYYY-YYYY format'),
  body('currentStep').isInt({ min: 0, max: 10 }).withMessage('Step must be 0-10'),
  body('answers').optional().isObject(),
  body('personalDetails').optional().isObject(),
  body('serviceTitle').isString().trim().notEmpty(),
  body('servicePrice').isInt({ min: 0 }),
  body('formTitle').isString().trim().notEmpty(),
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
    FormDraftModel,
    promoCodeService,
    creditService,
  } = deps;

  // All routes require authentication
  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ══════════════════════════════════════════════════════════════════════════
  // FORM MAPPINGS (available for client)
  // ══════════════════════════════════════════════════════════════════════════

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
          if (!version || !salesItem) {
            return null;
          }
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

  // ══════════════════════════════════════════════════════════════════════════
  // DRAFT MANAGEMENT — save progress, resume later
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /form-fill/drafts — list user's drafts ────────────────────────

  router.get('/form-fill/drafts', async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId ?? authReq.user?._id;
    if (!userId) {
      res.status(401).json({ status: 401, message: 'Authentication required' });
      return;
    }

    try {
      const drafts = await FormDraftModel.find({
        userId,
        isDeleted: false,
      })
        .sort({ updatedAt: -1 })
        .lean();

      res.status(200).json({
        status: 200,
        data: {
          drafts: drafts.map((d) => ({
            _id: String(d._id),
            mappingId: String(d.mappingId),
            versionNumber: d.versionNumber,
            financialYear: d.financialYear,
            currentStep: d.currentStep,
            serviceTitle: d.serviceTitle,
            servicePrice: d.servicePrice,
            formTitle: d.formTitle,
            answers: d.answers,
            personalDetails: d.personalDetails,
            updatedAt: d.updatedAt,
            createdAt: d.createdAt,
          })),
        },
      });
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      res.status(error.statusCode ?? 500).json({
        status: error.statusCode ?? 500,
        message: error.message,
      });
    }
  });

  // ── PUT /form-fill/drafts — upsert a draft (save/auto-save) ──────────

  router.put(
    '/form-fill/drafts',
    ...saveDraftValidation,
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
          mappingId,
          versionNumber,
          financialYear,
          currentStep,
          answers,
          personalDetails,
          serviceTitle,
          servicePrice,
          formTitle,
        } = req.body as {
          mappingId: string;
          versionNumber: number;
          financialYear: string;
          currentStep: number;
          answers?: Record<string, unknown>;
          personalDetails?: Record<string, unknown>;
          serviceTitle: string;
          servicePrice: number;
          formTitle: string;
        };

        const draft = await FormDraftModel.findOneAndUpdate(
          {
            userId,
            mappingId,
            financialYear,
            isDeleted: false,
          },
          {
            $set: {
              versionNumber,
              currentStep,
              answers: answers ?? {},
              personalDetails: personalDetails ?? {},
              serviceTitle,
              servicePrice,
              formTitle,
            },
            $setOnInsert: {
              userId,
              mappingId,
              financialYear,
              isDeleted: false,
            },
          },
          {
            upsert: true,
            new: true,
            lean: true,
          },
        );

        if (!draft) {
          res.status(500).json({ status: 500, message: 'Failed to save draft' });
          return;
        }
        res.status(200).json({
          status: 200,
          data: {
            draft: {
              _id: String(draft._id),
              mappingId: String(draft.mappingId),
              versionNumber: draft.versionNumber,
              financialYear: draft.financialYear,
              currentStep: draft.currentStep,
              updatedAt: draft.updatedAt,
            },
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

  // ── DELETE /form-fill/drafts/:id — delete a draft ─────────────────────

  router.delete(
    '/form-fill/drafts/:id',
    param('id').isMongoId(),
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
        const result = await FormDraftModel.findOneAndUpdate(
          { _id: req.params.id, userId, isDeleted: false },
          { $set: { isDeleted: true } },
        );

        if (!result) {
          res.status(404).json({ status: 404, message: 'Draft not found' });
          return;
        }

        res.status(200).json({ status: 200, message: 'Draft deleted' });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // FORM SUBMISSION
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /form-fill/submit ────────────────────────────────────────────
  // Submit filled form → creates an Order, deletes draft if draftId provided

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
          mappingId,
          versionNumber,
          financialYear,
          personalDetails,
          answers,
          promoCode: promoCodeInput,
          useCredits,
          draftId,
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
          draftId?: string;
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

        // 1a. Validate submitted answers against the published JSON schema.
        // Without this, a client can POST arbitrary keys/types and they'll
        // be snapshotted into `order.formAnswers` where downstream code
        // (review pipeline, ATO prefill) assumes schema-conformance.
        const ansCheck = validateAnswers(
          version.jsonSchema as unknown as FormMappingSchema,
          answers,
        );
        if (!ansCheck.valid) {
          res.status(422).json({
            status: 422,
            code: 'ANSWERS_SCHEMA_MISMATCH',
            message: 'Submitted answers do not match the form schema',
            errors: ansCheck.errors.map((e) => ({
              path: e.instancePath,
              keyword: e.keyword,
              message: e.message,
            })),
          });
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
        const lineItems = [
          {
            salesId: salesItem._id as Types.ObjectId,
            title: salesItem.title,
            price: salesItem.price,
            quantity: 1,
            priceAtCreation: salesItem.price,
            completionStatus: 'not_started' as const,
          },
        ];

        const totalAmount = salesItem.price;
        let discountAmount = 0;
        const discountPercent = 0;
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
            ...(personalDetails.dateOfBirth
              ? { dateOfBirth: new Date(personalDetails.dateOfBirth) }
              : {}),
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
          await promoCodeService.applyPromoCode(
            promoCodeStr,
            userId,
            String(order._id),
            totalAmount,
          );
        }

        // 9. Deduct credits if applied
        if (creditApplied > 0 && creditService) {
          await creditService.useCredit(userId, creditApplied, String(order._id));
        }

        // 10. Clean up the draft (soft-delete) if draftId provided
        if (draftId) {
          await FormDraftModel.findOneAndUpdate(
            { _id: draftId, userId, isDeleted: false },
            { $set: { isDeleted: true } },
          ).catch(() => {
            // non-critical: draft cleanup failure is acceptable
          });
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

        auditLog.log({
          actor: userId,
          actorType: 'client',
          action: 'create',
          resource: 'order',
          resourceId: String(order._id),
          severity: 'info',
          description: `Client submitted form-fill, created order ${order.orderNumber}`,
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

        const result = await promoCodeService.validatePromoCode(
          code,
          userId,
          orderAmount,
          salesItemId,
        );
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
