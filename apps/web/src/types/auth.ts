export interface LoginRequest {
  email: string;
  password: string;
}

export interface OtpLoginRequest {
  mobile: string;
  otp: string;
}

export interface OtpRequest {
  mobile: string;
}

export interface OtpVerifyResponse {
  userExists: boolean;
  accessToken?: string;
  refreshToken?: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  mobile: string;
  otp: string;
}

export interface AuthUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  userType: number;
}

export interface TokenPayload {
  userId: string;
  userType: number;
  iat?: number;
  exp?: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
