'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { api } from '@/lib/api/client';
import {
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearTokens,
} from '@/lib/api/tokenStorage';
import type { AuthUser } from '@/types/auth';
import type { ApiResponse } from '@/types/api';

interface OtpVerifyResult {
  userExists: boolean;
  accessToken?: string;
  refreshToken?: string;
}

interface LoginTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithOtp: (mobile: string, otp: string) => Promise<void>;
  sendOtp: (mobile: string) => Promise<void>;
  verifyOtp: (mobile: string, otp: string) => Promise<OtpVerifyResult>;
  register: (data: {
    firstName: string;
    lastName: string;
    mobile: string;
    otp: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (): Promise<void> => {
    try {
      const res = await api.get<ApiResponse<AuthUser>>('/users/me');
      setUser(res.data.data);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  // Attempt session restore on mount
  useEffect(() => {
    const restore = async (): Promise<void> => {
      const rt = getRefreshToken();
      if (!rt) {
        setIsLoading(false);
        return;
      }
      try {
        // Use raw axios to avoid the interceptor adding a stale/null Bearer token
        const res = await axios.post<ApiResponse<LoginTokens>>(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken: rt },
        );
        setAccessToken(res.data.data.accessToken);
        setRefreshToken(res.data.data.refreshToken);
        await fetchUser();
      } catch {
        clearTokens();
      } finally {
        setIsLoading(false);
      }
    };
    void restore();
  }, [fetchUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const res = await api.post<ApiResponse<LoginTokens>>(
        '/auth/signin',
        { email, password },
      );
      const data = res.data.data;
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      await fetchUser();
    },
    [fetchUser],
  );

  const sendOtp = useCallback(async (mobile: string): Promise<void> => {
    await api.post('/auth/send-otp', { mobile });
  }, []);

  const verifyOtp = useCallback(
    async (mobile: string, otp: string): Promise<OtpVerifyResult> => {
      const res = await api.post<ApiResponse<OtpVerifyResult>>(
        '/auth/verify-otp',
        { mobile, otp },
      );
      return res.data.data;
    },
    [],
  );

  const loginWithOtp = useCallback(
    async (mobile: string, otp: string): Promise<void> => {
      const result = await verifyOtp(mobile, otp);
      if (!result.userExists || !result.accessToken || !result.refreshToken) {
        throw new Error('User does not exist. Please register first.');
      }
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      await fetchUser();
    },
    [verifyOtp, fetchUser],
  );

  const register = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      mobile: string;
      otp: string;
    }): Promise<void> => {
      const res = await api.post<ApiResponse<LoginTokens>>(
        '/auth/signup',
        data,
      );
      const tokens = res.data.data;
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      await fetchUser();
    },
    [fetchUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithOtp,
        sendOtp,
        verifyOtp,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
