export interface TokenPayload {
  userId: string;
  userType: number;
  roleId: string;
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    _id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: number;
  };
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface MfaVerifyRequest {
  mfaToken: string;
  totpCode: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
