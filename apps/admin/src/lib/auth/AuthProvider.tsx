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
import type { User } from '@/types/user';
import type { LoginResponse } from '@/types/auth';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (): Promise<void> => {
    try {
      const res = await api.get<{ status: number; data: User }>('/users/me');
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
        const res = await axios.post<{ status: number; data: { accessToken: string; refreshToken: string } }>(
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
    async (email: string, password: string): Promise<LoginResponse> => {
      const res = await api.post<{ status: number; data: LoginResponse }>(
        '/auth/signin',
        { email, password },
      );
      const data = res.data.data;

      if (data.mfaRequired) {
        return data; // Caller handles MFA step
      }

      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      await fetchUser();
      return data;
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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
