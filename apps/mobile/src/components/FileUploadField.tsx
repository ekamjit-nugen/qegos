import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, Text } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useVaultUpload, type VaultDocumentUploaded } from '@/hooks/useVaultUpload';

export interface FileUploadFieldValue {
  documentId: string;
  fileName: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

interface FileUploadFieldProps {
  label: string;
  required?: boolean;
  description?: string;
  financialYear: string;
  category?: string;
  value?: FileUploadFieldValue;
  onChange: (value: FileUploadFieldValue | undefined) => void;
  /** Restrict picker to specific MIME types (e.g. `['image/*', 'application/pdf']`). */
  acceptedTypes?: string[];
}

export function FileUploadField({
  label,
  required,
  description,
  financialYear,
  category,
  value,
  onChange,
  acceptedTypes,
}: FileUploadFieldProps): React.ReactNode {
  const upload = useVaultUpload();
  const [error, setError] = useState<string>('');

  async function handlePick(): Promise<void> {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: acceptedTypes ?? '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      upload.mutate(
        {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          size: asset.size,
          financialYear,
          category,
        },
        {
          onSuccess: (doc: VaultDocumentUploaded) => {
            onChange({
              documentId: doc.documentId,
              fileName: doc.fileName,
              url: doc.downloadUrl,
              mimeType: doc.mimeType,
              size: doc.fileSize,
            });
          },
          onError: (err) => {
            setError(err.message || 'Upload failed');
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pick file');
    }
  }

  function handleClear(): void {
    onChange(undefined);
  }

  return (
    <View>
      <Text variant="bodyMedium" style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {description ? (
        <Text variant="bodySmall" style={styles.dim}>
          {description}
        </Text>
      ) : null}

      {value ? (
        <View style={styles.fileRow}>
          <View style={styles.fileInfo}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {value.fileName}
            </Text>
            {typeof value.size === 'number' ? (
              <Text variant="bodySmall" style={styles.dim}>
                {(value.size / 1024).toFixed(1)} KB
              </Text>
            ) : null}
          </View>
          <IconButton
            icon="close"
            size={20}
            onPress={handleClear}
            disabled={upload.isPending}
            accessibilityLabel="Remove file"
          />
        </View>
      ) : (
        <Button
          mode="outlined"
          icon="upload"
          onPress={handlePick}
          loading={upload.isPending}
          disabled={upload.isPending}
          style={styles.button}
        >
          {upload.isPending ? 'Uploading…' : 'Choose file'}
        </Button>
      )}

      {error ? (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 4 },
  dim: { opacity: 0.6, marginBottom: 6 },
  button: { marginTop: 6 },
  fileRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  fileInfo: { flex: 1 },
});
