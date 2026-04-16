import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IReviewAssignmentDocument } from '../review-pipeline/review.types';
import type { ICounterDocument } from '../../database/counter.model';
import type {
  IOrderDocument2,
  ISalesDocument,
  OrderListQuery,
  OrderListResult,
  OrderStatus as OrderStatusType,
  ILineItem,
} from './order.types';
import { OrderStatus, ORDER_STATUS_TRANSITIONS } from './order.types';
import { generateOrderNumber } from './order.model';

export interface OrderServiceDeps {
  OrderModel: Model<IOrderDocument2>;
  SalesModel: Model<ISalesDocument>;
  ReviewAssignmentModel?: Model<IReviewAssignmentDocument>;
  UserModel?: Model<any>;
  CounterModel?: Model<ICounterDocument>;
}

export interface OrderServiceResult {
  createOrder: (data: Partial<IOrderDocument2>, userId: string) => Promise<IOrderDocument2>;
  getOrder: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IOrderDocument2>;
  listOrders: (query: OrderListQuery) => Promise<OrderListResult>;
  updateOrder: (
    id: string,
    data: Partial<IOrderDocument2>,
    scopeFilter?: Record<string, unknown>,
  ) => Promise<IOrderDocument2>;
  transitionStatus: (
    id: string,
    newStatus: number,
    data: { note?: string; eFileReference?: string; cancelReason?: string },
    actorUserType: number,
    scopeFilter?: Record<string, unknown>,
  ) => Promise<IOrderDocument2>;
  assignOrder: (
    id: string,
    staffId: string,
    scopeFilter?: Record<string, unknown>,
  ) => Promise<IOrderDocument2>;
  bulkAssign: (orderIds: string[], staffId: string) => Promise<{ updated: number }>;
  scheduleAppointment: (
    orderId: string,
    data: { date: string; timeSlot: string; type: string; staffId: string; meetingLink?: string },
    scopeFilter?: Record<string, unknown>,
  ) => Promise<IOrderDocument2>;
  updateProgress: (
    id: string,
    percent: number,
    scopeFilter?: Record<string, unknown>,
  ) => Promise<IOrderDocument2>;
  calculateTotals: (
    orderId: string,
  ) => Promise<{ totalAmount: number; discountAmount: number; finalAmount: number }>;
  getStats: () => Promise<Record<string, unknown>>;
  getRevenue: (filters?: {
    financialYear?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => Promise<Record<string, unknown>>;
  softDelete: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IOrderDocument2>;
}

// User types that qualify as senior/admin for backward transitions
const SENIOR_USER_TYPES = [0, 1, 5, 6]; // super_admin, admin, office_manager, senior_staff
const ADMIN_USER_TYPES = [0, 1]; // super_admin, admin
const CANCEL_USER_TYPES = [0, 1, 5]; // super_admin, admin, office_manager

export function createOrderService(deps: OrderServiceDeps): OrderServiceResult {
  const { OrderModel, SalesModel, ReviewAssignmentModel, UserModel, CounterModel } = deps;

  // ─── Create Order ─────────────────────────────────────────────────────

  async function createOrder(
    data: Partial<IOrderDocument2>,
    userId: string,
  ): Promise<IOrderDocument2> {
    const orderNumber = await generateOrderNumber(OrderModel, CounterModel);

    // Snapshot priceAtCreation from Sales catalogue (ORD-INV-02)
    const lineItems: ILineItem[] = [];
    if (data.lineItems && data.lineItems.length > 0) {
      for (const item of data.lineItems) {
        const salesItem = await SalesModel.findById(item.salesId);
        if (!salesItem) {
          throw AppError.badRequest(`Sales item ${String(item.salesId)} not found`);
        }
        lineItems.push({
          salesId: salesItem._id,
          title: salesItem.title,
          price: salesItem.price,
          quantity: item.quantity || 1,
          priceAtCreation: salesItem.price, // Snapshot — ORD-INV-02
          completionStatus: 'not_started',
        });
      }
    }

    // ORD-INV-03: Calculate totals server-side
    const totalAmount = lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);
    const discountPercent = data.discountPercent || 0;
    const discountAmount = Math.round(totalAmount * (discountPercent / 100));
    const finalAmount = totalAmount - discountAmount;

    const order = await OrderModel.create({
      ...data,
      orderNumber,
      // Staff creating on behalf of client may pass an explicit userId in the body;
      // fall back to the actor's userId for self-serve flows.
      userId: data.userId ?? userId,
      lineItems,
      totalAmount,
      discountPercent,
      discountAmount,
      finalAmount,
      status: data.status ?? OrderStatus.Pending,
      completionPercent: 0,
      noaReceived: false,
      orderType: data.orderType ?? 'standard',
      amendmentCount: data.amendmentCount ?? 0,
      isDeleted: false,
    });

    return order;
  }

  // ─── Get Order ────────────────────────────────────────────────────────

  async function getOrder(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const order = await OrderModel.findOne(filter)
      .populate('userId', 'firstName lastName email mobile')
      .populate('processingBy', 'firstName lastName email')
      .populate('leadId', 'leadNumber firstName lastName')
      .lean<IOrderDocument2>();
    if (!order) {
      throw AppError.notFound('Order');
    }
    return order;
  }

  // ─── List Orders ──────────────────────────────────────────────────────

  async function listOrders(query: OrderListQuery): Promise<OrderListResult> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const filter: FilterQuery<IOrderDocument2> = {};

    if (query.scopeFilter && Object.keys(query.scopeFilter).length > 0) {
      Object.assign(filter, query.scopeFilter);
    }

    if (query.status !== undefined) {
      filter.status = query.status;
    }
    if (query.financialYear) {
      filter.financialYear = query.financialYear;
    }
    if (query.processingBy) {
      filter.processingBy = query.processingBy;
    }
    if (query.userId) {
      filter.userId = query.userId;
    }
    if (query.eFileStatus) {
      filter.eFileStatus = query.eFileStatus;
    }

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) {
        (filter.createdAt as Record<string, unknown>).$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        (filter.createdAt as Record<string, unknown>).$lte = new Date(query.dateTo);
      }
    }

    const [orders, total] = await Promise.all([
      OrderModel.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('processingBy', 'firstName lastName')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean<IOrderDocument2[]>(),
      OrderModel.countDocuments(filter),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Update Order ─────────────────────────────────────────────────────

  async function updateOrder(
    id: string,
    inputData: Partial<IOrderDocument2>,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    let data = inputData;
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    // ORD-INV-06: userId immutable
    // Fix for S-3.3, B-3.16: Strip status to prevent state machine bypass
    delete (data as Record<string, unknown>).status;
    delete (data as Record<string, unknown>).userId;
    delete (data as Record<string, unknown>).orderNumber;

    // Fetch current to recalculate totals
    const existing = await OrderModel.findOne(filter);
    if (!existing) {
      throw AppError.notFound('Order');
    }

    // Fix for B-3.21: Snapshot prices for new line items (same as createOrder)
    if (data.lineItems) {
      const snapshotItems: ILineItem[] = [];
      for (const item of data.lineItems) {
        if (item.priceAtCreation) {
          // Existing item with price already snapshotted
          snapshotItems.push(item);
        } else {
          // New item — fetch price from Sales catalogue
          const salesItem = await SalesModel.findById(item.salesId);
          if (!salesItem) {
            throw AppError.badRequest(`Sales item ${String(item.salesId)} not found`);
          }
          snapshotItems.push({
            ...item,
            title: salesItem.title,
            price: salesItem.price,
            priceAtCreation: salesItem.price,
            quantity: item.quantity || 1,
            completionStatus: item.completionStatus ?? 'not_started',
          });
        }
      }
      data = { ...data, lineItems: snapshotItems };
    }

    // Apply updates
    Object.assign(existing, data);

    // ORD-INV-03: Recalculate totals server-side
    if (data.lineItems || data.discountPercent !== undefined) {
      const totalAmount = existing.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);
      existing.totalAmount = totalAmount;
      existing.discountAmount = Math.round(totalAmount * (existing.discountPercent / 100));
      existing.finalAmount = totalAmount - existing.discountAmount;
    }

    await existing.save();

    return (await OrderModel.findById(id).lean<IOrderDocument2>())!;
  }

  // ─── Status Transition (ORD-INV-01) ───────────────────────────────────

  async function transitionStatus(
    id: string,
    newStatus: number,
    data: { note?: string; eFileReference?: string; cancelReason?: string },
    actorUserType: number,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    const order = await OrderModel.findOne(filter);
    if (!order) {
      throw AppError.notFound('Order');
    }

    const currentStatus = order.status as OrderStatusType;
    const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];

    // ORD-INV-01: Validate transition
    if (!allowed.includes(newStatus as OrderStatusType)) {
      throw AppError.badRequest(`Invalid status transition from ${currentStatus} to ${newStatus}`, [
        { field: 'status', message: `Allowed transitions: [${allowed.join(', ')}]` },
      ]);
    }

    // Backward transition check
    if (newStatus < currentStatus && newStatus !== OrderStatus.Cancelled) {
      if (!SENIOR_USER_TYPES.includes(actorUserType)) {
        throw AppError.forbidden('Backward transitions require senior_staff or admin role');
      }
    }

    // ORD-INV-08: Cancel requires admin/office_manager + reason
    if (newStatus === OrderStatus.Cancelled) {
      if (!CANCEL_USER_TYPES.includes(actorUserType)) {
        throw AppError.forbidden('Cancel requires admin or office_manager role');
      }
      if (!data.cancelReason) {
        throw AppError.badRequest('Cancel reason is required');
      }
      if (data.note) {
        order.notes = (order.notes ? order.notes + '\n' : '') + `CANCELLED: ${data.cancelReason}`;
      }
    }

    // Reopen (9→1) requires admin
    if (currentStatus === OrderStatus.Cancelled && newStatus === OrderStatus.Pending) {
      if (!ADMIN_USER_TYPES.includes(actorUserType)) {
        throw AppError.forbidden('Reopen from cancelled requires admin role');
      }
    }

    // Fix for S-3.1, B-3.2: RVW-INV-01 — Order cannot complete without approved review
    if (newStatus === OrderStatus.Completed) {
      if (!ReviewAssignmentModel) {
        throw AppError.badRequest(
          'Review system not configured — cannot complete order (RVW-INV-01)',
        );
      }
      const approvedReview = await ReviewAssignmentModel.findOne({
        orderId: id,
        status: 'approved',
      }).lean();
      if (!approvedReview) {
        throw AppError.badRequest(
          'Order cannot be completed without an approved review (RVW-INV-01)',
        );
      }
    }

    // Status→3 requires processingBy set
    if (newStatus === OrderStatus.Assigned && !order.processingBy) {
      throw AppError.badRequest('processingBy must be set before transitioning to Assigned');
    }

    // Status→7 requires eFileReference or manual confirmation
    if (newStatus === OrderStatus.Lodged) {
      if (!data.eFileReference && !order.eFileReference) {
        throw AppError.badRequest(
          'eFileReference is required for lodgement, or provide manual confirmation',
        );
      }
      if (data.eFileReference) {
        order.eFileReference = data.eFileReference;
        order.eFileStatus = 'submitted';
      }
    }

    order.status = newStatus;
    await order.save();

    return (await OrderModel.findById(id).lean<IOrderDocument2>())!;
  }

  // ─── Assign Order (ORD-INV-07) ────────────────────────────────────────

  // Fix for S-3.5, B-3.11: Add scopeFilter to prevent IDOR
  async function assignOrder(
    id: string,
    staffId: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const order = await OrderModel.findOneAndUpdate(
      filter,
      { processingBy: staffId },
      { new: true },
    );
    if (!order) {
      throw AppError.notFound('Order');
    }
    return order;
  }

  async function bulkAssign(orderIds: string[], staffId: string): Promise<{ updated: number }> {
    // Fix for B-3.6: Validate that target staff exists and is active
    if (UserModel) {
      const staff = await UserModel.findOne({
        _id: staffId,
        status: true,
        isDeleted: { $ne: true },
      }).lean();
      if (!staff) {
        throw AppError.badRequest('Target staff member does not exist or is inactive');
      }
    }

    const result = await OrderModel.updateMany(
      { _id: { $in: orderIds } },
      { processingBy: staffId },
    );
    return { updated: result.modifiedCount };
  }

  // ─── Schedule Appointment ─────────────────────────────────────────────

  // Fix for B-3.25: Add scopeFilter
  async function scheduleAppointment(
    orderId: string,
    data: { date: string; timeSlot: string; type: string; staffId: string; meetingLink?: string },
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    // Double-booking prevention
    const existingBooking = await OrderModel.findOne({
      'scheduledAppointment.date': new Date(data.date),
      'scheduledAppointment.timeSlot': data.timeSlot,
      'scheduledAppointment.staffId': data.staffId,
      'scheduledAppointment.status': 'scheduled',
      _id: { $ne: orderId },
    });

    if (existingBooking) {
      throw AppError.conflict('This time slot is already booked for this staff member');
    }

    const appointmentFilter: FilterQuery<IOrderDocument2> = { _id: orderId };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(appointmentFilter, scopeFilter);
    }
    const order = await OrderModel.findOneAndUpdate(
      appointmentFilter,
      {
        scheduledAppointment: {
          date: new Date(data.date),
          timeSlot: data.timeSlot,
          staffId: data.staffId,
          type: data.type,
          meetingLink: data.meetingLink,
          status: 'scheduled',
        },
      },
      { new: true },
    );
    if (!order) {
      throw AppError.notFound('Order');
    }
    return order;
  }

  // ─── Update Progress ──────────────────────────────────────────────────

  async function updateProgress(
    id: string,
    percent: number,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const order = await OrderModel.findOneAndUpdate(
      filter,
      { completionPercent: Math.min(100, Math.max(0, percent)) },
      { new: true },
    );
    if (!order) {
      throw AppError.notFound('Order');
    }
    return order;
  }

  // ─── Calculate Totals (ORD-INV-03) ────────────────────────────────────

  async function calculateTotals(
    orderId: string,
  ): Promise<{ totalAmount: number; discountAmount: number; finalAmount: number }> {
    const order = await OrderModel.findById(orderId);
    if (!order) {
      throw AppError.notFound('Order');
    }

    const totalAmount = order.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);
    const discountAmount = Math.round(totalAmount * (order.discountPercent / 100));
    const finalAmount = totalAmount - discountAmount;

    order.totalAmount = totalAmount;
    order.discountAmount = discountAmount;
    order.finalAmount = finalAmount;
    await order.save();

    return { totalAmount, discountAmount, finalAmount };
  }

  // ─── Stats ────────────────────────────────────────────────────────────

  async function getStats(): Promise<Record<string, unknown>> {
    const [byStatus, byFY, byStaff] = await Promise.all([
      OrderModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      OrderModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$financialYear', count: { $sum: 1 } } },
      ]),
      OrderModel.aggregate([
        { $match: { isDeleted: { $ne: true }, processingBy: { $ne: null } } },
        { $group: { _id: '$processingBy', count: { $sum: 1 } } },
      ]),
    ]);

    return { byStatus, byFY, byStaff };
  }

  async function getRevenue(filters?: {
    financialYear?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Record<string, unknown>> {
    const match: FilterQuery<IOrderDocument2> = {
      isDeleted: { $ne: true },
      status: { $gte: 6 }, // Completed+
    };

    if (filters?.financialYear) {
      match.financialYear = filters.financialYear;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      match.createdAt = {};
      if (filters?.dateFrom) {
        (match.createdAt as Record<string, unknown>).$gte = new Date(filters.dateFrom);
      }
      if (filters?.dateTo) {
        (match.createdAt as Record<string, unknown>).$lte = new Date(filters.dateTo);
      }
    }

    const [total, byService, byPeriod] = await Promise.all([
      OrderModel.aggregate([
        { $match: match },
        { $group: { _id: null, totalRevenue: { $sum: '$finalAmount' }, count: { $sum: 1 } } },
      ]),
      OrderModel.aggregate([
        { $match: match },
        { $unwind: '$lineItems' },
        {
          $group: {
            _id: '$lineItems.title',
            revenue: { $sum: { $multiply: ['$lineItems.price', '$lineItems.quantity'] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      OrderModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            revenue: { $sum: '$finalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      total: total[0] ?? { totalRevenue: 0, count: 0 },
      byService,
      byPeriod,
    };
  }

  // Fix for B-3.32: Soft delete order
  async function softDelete(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IOrderDocument2> {
    const filter: FilterQuery<IOrderDocument2> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const order = await OrderModel.findOne(filter);
    if (!order) {
      throw AppError.notFound('Order');
    }
    order.isDeleted = true;
    order.deletedAt = new Date();
    await order.save();
    return order;
  }

  return {
    createOrder,
    getOrder,
    listOrders,
    updateOrder,
    transitionStatus,
    assignOrder,
    bulkAssign,
    scheduleAppointment,
    updateProgress,
    calculateTotals,
    getStats,
    getRevenue,
    softDelete,
  };
}
