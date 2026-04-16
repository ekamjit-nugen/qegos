import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface VaultDocumentUploaded {
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: string;
  financialYear: string;
  downloadUrl?: string;
  uploadedAt: string;
}

export interface VaultUploadPayload {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  financialYear: string;
  category?: string;
  description?: string;
}

interface UploadResponse {
  status: number;
  data: { document: VaultDocumentUploaded };
  warning?: { code: string; message: string };
}

/**
 * Uploads a file (picked via expo-document-picker / expo-image-picker)
 * to the client-portal vault. Returns the persisted document, including
 * a downloadUrl that can be saved as the answer for a `file_upload`
 * form field.
 */
export function useVaultUpload() {
  return useMutation<VaultDocumentUploaded, Error, VaultUploadPayload>({
    mutationFn: async (payload): Promise<VaultDocumentUploaded> => {
      const formData = new FormData();
      // React Native's FormData accepts {uri, name, type} objects for files.
      formData.append('file', {
        uri: payload.uri,
        name: payload.name,
        type: payload.mimeType,
      } as unknown as Blob);
      formData.append('financialYear', payload.financialYear);
      formData.append('category', payload.category ?? 'other');
      if (payload.description) {
        formData.append('description', payload.description);
      }

      const response = await api.post<UploadResponse>('/portal/vault/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Long-running upload — bump timeout
        timeout: 120_000,
      });
      return response.data.data.document;
    },
  });
}
