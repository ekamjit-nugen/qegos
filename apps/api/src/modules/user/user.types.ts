import type { Document, Types } from 'mongoose';
import type { IAuthFields } from '@nugen/auth';
import type { IRbacFields } from '@nugen/rbac';

export interface ConsentRecord {
  marketingSms?: { consented: boolean; date?: Date; source?: string };
  marketingEmail?: { consented: boolean; date?: Date; source?: string };
  marketingWhatsapp?: { consented: boolean; date?: Date; source?: string };
  marketingPush?: { consented: boolean; date?: Date; source?: string };
}

export interface FcmToken {
  token: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  lastUsed: Date;
}

export interface UserAddress {
  street?: string;
  suburb?: string;
  state?: 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';
  postcode?: string;
  country?: string;
}

export interface IUser extends IAuthFields, IRbacFields {
  email?: string;
  mobile?: string;
  firstName: string;
  lastName: string;
  status: boolean;
  profileImage?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address?: UserAddress;
  tfnLastThree?: string;
  tfnEncrypted?: string;
  abnNumber?: string;
  maritalStatus?: 'single' | 'married' | 'de_facto' | 'separated' | 'divorced' | 'widowed';
  preferredLanguage: string;
  preferredContact: 'call' | 'sms' | 'email' | 'whatsapp';
  timezone: string;
  referralCode?: string;
  creditBalance: number;
  storageUsed: number;
  storageQuota: number;
  fcmTokens: FcmToken[];
  consentRecord?: ConsentRecord;
  college?: string;
  discount: number;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isCorrectPassword(password: string): Promise<boolean>;
  isAccountLocked(): boolean;
  incrementFailedAttempts(): Promise<void>;
  resetFailedAttempts(): Promise<void>;
}
