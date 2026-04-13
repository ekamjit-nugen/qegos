'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { User, UserListQuery } from '@/types/user';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useUserList(filters: UserListQuery) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<User>>(`/users?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<User>>(`/users/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<User> & { password?: string }) => {
      const res = await api.post<ApiResponse<User>>('/users', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      const res = await api.put<ApiResponse<User>>(`/users/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['users', vars.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useToggleUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: boolean }) => {
      const res = await api.patch<ApiResponse<User>>(`/users/${id}/status`, { status });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['users', vars.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ['users', 'staff'],
    queryFn: async () => {
      // Fetch all non-client users (userType 0-4: super_admin, admin, office_manager, senior_staff, staff)
      const res = await api.get<PaginatedResponse<User>>('/users?limit=100');
      const allUsers = res.data.data ?? [];
      // Filter to staff-level users (userType 0-4, excluding clients/students)
      return allUsers.filter((u) => u.userType !== undefined && u.userType <= 4);
    },
  });
}
