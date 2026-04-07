import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import { escapeRegex } from '@nugen/validator';
import type { IUserDocument } from './user.types';
import { encryptTfn } from './user.model';

export interface UserListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  userType?: number;
  status?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  scopeFilter?: Record<string, unknown>;
}

export interface UserListResult {
  users: IUserDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function createUserService(UserModel: Model<IUserDocument>): {
  listUsers: (query: UserListQuery) => Promise<UserListResult>;
  getUserById: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IUserDocument>;
  createUser: (data: Partial<IUserDocument>) => Promise<IUserDocument>;
  updateUser: (id: string, data: Partial<IUserDocument>, scopeFilter?: Record<string, unknown>) => Promise<IUserDocument>;
  toggleStatus: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IUserDocument>;
  softDelete: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IUserDocument>;
  updateTfn: (userId: string, tfn: string) => Promise<void>;
} {
  async function listUsers(query: UserListQuery): Promise<UserListResult> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const filter: FilterQuery<IUserDocument> = {};

    // Apply scope filter
    if (query.scopeFilter && Object.keys(query.scopeFilter).length > 0) {
      Object.assign(filter, query.scopeFilter);
    }

    if (query.userType !== undefined) {
      filter.userType = query.userType;
    }
    if (query.status !== undefined) {
      filter.status = query.status === 'true';
    }
    if (query.state) {
      filter['address.state'] = query.state;
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

    // FIX for Vegeta B-25: Escape regex to prevent ReDoS
    if (query.search) {
      const escaped = escapeRegex(query.search);
      filter.$or = [
        { firstName: { $regex: escaped, $options: 'i' } },
        { lastName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { mobile: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean<IUserDocument[]>(),
      UserModel.countDocuments(filter),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async function getUserById(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IUserDocument> {
    const filter: FilterQuery<IUserDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const user = await UserModel.findOne(filter).lean<IUserDocument>();
    if (!user) {
      throw AppError.notFound('User');
    }
    return user;
  }

  async function createUser(data: Partial<IUserDocument>): Promise<IUserDocument> {
    const user = await UserModel.create(data);
    return user;
  }

  async function updateUser(
    id: string,
    data: Partial<IUserDocument>,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IUserDocument> {
    const filter: FilterQuery<IUserDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const user = await UserModel.findOneAndUpdate(filter, data, { new: true, runValidators: true });
    if (!user) {
      throw AppError.notFound('User');
    }
    return user;
  }

  // FIX for Vegeta B-23: Apply scopeFilter on status toggle
  async function toggleStatus(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IUserDocument> {
    const filter: FilterQuery<IUserDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const user = await UserModel.findOne(filter);
    if (!user) {
      throw AppError.notFound('User');
    }
    user.status = !user.status;
    await user.save();
    return user;
  }

  // FIX for Vegeta B-24: Apply scopeFilter on delete
  async function softDelete(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IUserDocument> {
    const filter: FilterQuery<IUserDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const user = await UserModel.findOne(filter);
    if (!user) {
      throw AppError.notFound('User');
    }
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();
    return user;
  }

  async function updateTfn(userId: string, tfn: string): Promise<void> {
    const encrypted = encryptTfn(tfn);
    const lastThree = tfn.replace(/\s/g, '').slice(-3);
    await UserModel.findByIdAndUpdate(userId, {
      tfnEncrypted: encrypted,
      tfnLastThree: lastThree,
    });
  }

  return {
    listUsers,
    getUserById,
    createUser,
    updateUser,
    toggleStatus,
    softDelete,
    updateTfn,
  };
}
