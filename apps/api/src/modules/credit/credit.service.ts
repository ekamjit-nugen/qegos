import type { Model } from 'mongoose';
import * as _auditLog from '@nugen/audit-log';
import { AppError } from '@nugen/error-handler';
import { getRequestId } from '../../lib/requestContext';
import type { ICreditTransactionDocument, CreditType } from './credit.types';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

export interface CreditServiceDeps {
  CreditTransactionModel: Model<ICreditTransactionDocument>;
}

export interface CreditServiceResult {
  getBalance: (userId: string) => Promise<number>;
  addCredit: (
    userId: string,
    amount: number,
    type: CreditType,
    description: string,
    referenceId?: string,
    expiresAt?: Date,
  ) => Promise<ICreditTransactionDocument>;
  useCredit: (
    userId: string,
    amount: number,
    orderId: string,
  ) => Promise<ICreditTransactionDocument>;
  getTransactions: (
    userId: string,
    page?: number,
    limit?: number,
  ) => Promise<{ transactions: ICreditTransactionDocument[]; total: number }>;
  expireCredits: () => Promise<number>;
}

export function createCreditService(deps: CreditServiceDeps): CreditServiceResult {
  const { CreditTransactionModel } = deps;

  async function getBalance(userId: string): Promise<number> {
    // Get latest transaction for this user to read the running balance
    const latest = await CreditTransactionModel.findOne({ userId }).sort({ createdAt: -1 }).lean();
    return latest?.balance ?? 0;
  }

  async function addCredit(
    userId: string,
    amount: number,
    type: CreditType,
    description: string,
    referenceId?: string,
    expiresAt?: Date,
  ): Promise<ICreditTransactionDocument> {
    if (amount <= 0) {
      throw AppError.badRequest('Credit amount must be positive');
    }
    const currentBalance = await getBalance(userId);
    const newBalance = currentBalance + amount;

    const transaction = await CreditTransactionModel.create({
      userId,
      type,
      amount,
      balance: newBalance,
      referenceId,
      description,
      expiresAt,
    });

    auditLog.log({
      actor: userId,
      actorType: 'system',
      action: 'create',
      resource: 'credit',
      resourceId: String(transaction._id),
      severity: 'info',
      description: `Credit added: ${amount} cents, type=${type}`,
    });

    return transaction;
  }

  async function useCredit(
    userId: string,
    amount: number,
    orderId: string,
  ): Promise<ICreditTransactionDocument> {
    if (amount <= 0) {
      throw AppError.badRequest('Credit usage amount must be positive');
    }

    const currentBalance = await getBalance(userId);
    if (currentBalance < amount) {
      throw AppError.badRequest(
        `Insufficient credit balance. Available: $${(currentBalance / 100).toFixed(2)}`,
      );
    }

    const newBalance = currentBalance - amount;

    const transaction = await CreditTransactionModel.create({
      userId,
      type: 'usage',
      amount: -amount, // negative for deduction
      balance: newBalance,
      referenceId: orderId,
      description: `Credit applied to order`,
    });

    auditLog.log({
      actor: userId,
      actorType: 'system',
      action: 'update',
      resource: 'credit',
      resourceId: String(transaction._id),
      severity: 'warning',
      description: `Credit used: ${amount} cents for order ${orderId}`,
    });

    return transaction;
  }

  async function getTransactions(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ transactions: ICreditTransactionDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      CreditTransactionModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ICreditTransactionDocument[]>(),
      CreditTransactionModel.countDocuments({ userId }),
    ]);
    return { transactions, total };
  }

  /**
   * Expire credits past their expiresAt date (REF-INV-04: 12-month expiry).
   * Returns number of credit entries expired.
   */
  async function expireCredits(): Promise<number> {
    const now = new Date();

    // Find all users with expirable credits
    const expirableCredits = await CreditTransactionModel.find({
      expiresAt: { $lte: now },
      type: { $nin: ['usage', 'expiry'] },
      amount: { $gt: 0 },
    }).lean();

    let expiredCount = 0;
    const processedUsers = new Set<string>();

    for (const credit of expirableCredits) {
      const userId = String(credit.userId);
      if (processedUsers.has(userId)) {
        continue;
      }
      processedUsers.add(userId);

      // Get total expired amount for this user
      const userExpirableCredits = expirableCredits.filter((c) => String(c.userId) === userId);
      const totalExpired = userExpirableCredits.reduce((sum, c) => sum + c.amount, 0);

      if (totalExpired <= 0) {
        continue;
      }

      const currentBalance = await getBalance(userId);
      const expiryAmount = Math.min(totalExpired, currentBalance);

      if (expiryAmount > 0) {
        await CreditTransactionModel.create({
          userId,
          type: 'expiry',
          amount: -expiryAmount,
          balance: currentBalance - expiryAmount,
          description: 'Credits expired (12-month expiry)',
        });
        expiredCount++;
      }
    }

    // Mark processed credits so they don't get processed again
    if (expirableCredits.length > 0) {
      await CreditTransactionModel.updateMany(
        {
          _id: { $in: expirableCredits.map((c) => c._id) },
        },
        { $unset: { expiresAt: 1 } },
      );
    }

    return expiredCount;
  }

  return { getBalance, addCredit, useCredit, getTransactions, expireCredits };
}
