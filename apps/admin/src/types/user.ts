export enum UserType {
  SuperAdmin = 0,
  Admin = 1,
  Client = 2,
  Staff = 3,
  Student = 4,
  OfficeManager = 5,
  SeniorStaff = 6,
  ClientPortal = 7,
}

export const USER_TYPE_LABELS: Record<number, string> = {
  [UserType.SuperAdmin]: 'Super Admin',
  [UserType.Admin]: 'Admin',
  [UserType.Client]: 'Client',
  [UserType.Staff]: 'Staff',
  [UserType.Student]: 'Student',
  [UserType.OfficeManager]: 'Office Manager',
  [UserType.SeniorStaff]: 'Senior Staff',
  [UserType.ClientPortal]: 'Client Portal',
};

export const ADMIN_USER_TYPES = [
  UserType.SuperAdmin,
  UserType.Admin,
  UserType.Staff,
  UserType.OfficeManager,
  UserType.SeniorStaff,
];

export interface UserAddress {
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface User {
  _id: string;
  email: string;
  mobile?: string;
  firstName: string;
  lastName: string;
  userType: number;
  status: boolean;
  profileImage?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address?: UserAddress;
  preferredLanguage?: string;
  preferredContact?: 'call' | 'sms' | 'email' | 'whatsapp';
  referralCode?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  userType?: number;
  status?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
