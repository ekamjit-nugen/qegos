import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Chip,
  ProgressBar,
  useTheme,
} from 'react-native-paper';
import { useVaultDocuments, useVaultYears, useStorageUsage } from '@/hooks/useVault';
import type { VaultDocument } from '@/types/vault';
import { VaultSkeleton } from '@/components/ScreenSkeleton';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VaultScreen(): React.ReactNode {
  const theme = useTheme();
  const [selectedYear, setSelectedYear] = useState<string | undefined>(
    undefined,
  );

  const storageQuery = useStorageUsage();
  const yearsQuery = useVaultYears();
  const documentsQuery = useVaultDocuments({
    financialYear: selectedYear,
  });

  const storage = storageQuery.data?.data;
  const years = yearsQuery.data?.data ?? [];
  const documents = documentsQuery.data?.data ?? [];

  function renderDocument({
    item,
  }: {
    item: VaultDocument;
  }): React.ReactElement {
    return (
      <Card style={styles.docCard}>
        <Card.Content>
          <Text variant="titleSmall" numberOfLines={1}>
            {item.fileName}
          </Text>
          <View style={styles.docMeta}>
            <Chip compact style={styles.categoryChip}>
              {item.category}
            </Chip>
            <Text variant="bodySmall" style={styles.dimText}>
              {formatFileSize(item.fileSize)}
            </Text>
            <Text variant="bodySmall" style={styles.dimText}>
              {new Date(item.createdAt).toLocaleDateString('en-AU')}
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {storage && (
        <View style={styles.storageSection}>
          <View style={styles.storageHeader}>
            <Text variant="bodyMedium">Storage Used</Text>
            <Text variant="bodySmall" style={styles.dimText}>
              {formatFileSize(storage.used)} / {formatFileSize(storage.limit)}
            </Text>
          </View>
          <ProgressBar
            progress={storage.percentage / 100}
            color={
              storage.percentage > 90
                ? theme.colors.error
                : theme.colors.primary
            }
            style={styles.storageBar}
          />
          <Text variant="bodySmall" style={styles.dimText}>
            {storage.documents} documents
          </Text>
        </View>
      )}

      <View style={styles.yearFilters}>
        <Chip
          selected={!selectedYear}
          onPress={() => setSelectedYear(undefined)}
          style={styles.yearChip}
          compact
        >
          All
        </Chip>
        {years.map((y) => (
          <Chip
            key={y.year}
            selected={selectedYear === y.year}
            onPress={() => setSelectedYear(y.year)}
            style={styles.yearChip}
            compact
          >
            {y.year} ({y.count})
          </Chip>
        ))}
      </View>

      {documentsQuery.isLoading ? (
        <VaultSkeleton />
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item: VaultDocument) => item._id}
          renderItem={renderDocument}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge">No documents found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  storageSection: {
    padding: 16,
    paddingBottom: 8,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  storageBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  yearFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  yearChip: {
    marginBottom: 4,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  docCard: {
    marginBottom: 10,
  },
  docMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  categoryChip: {
    height: 28,
  },
  dimText: {
    opacity: 0.6,
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
});
