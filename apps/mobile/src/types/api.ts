export interface ApiResponse<T> {
  status: number;
  data: T;
}

export interface PaginatedResponse<T> {
  status: number;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  errors?: Array<{ field: string; message: string }>;
}
