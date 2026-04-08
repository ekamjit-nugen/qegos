import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Chip,
  Divider,
  ActivityIndicator,
  Appbar,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTaxSummaries } from '@/hooks/useTaxSummary';
import type { TaxSummary } from '@/types/taxSummary';

const ATO_STATUS_COLORS: Record<string, string> = {
  not_lodged: '#FF9800',
  lodged: '#2196F3',
  processing: '#9C27B0',
  assessed: '#4CAF50',
  amended: '#607D8B',
};

export default function TaxSummaryScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isError } = useTaxSummaries();

  const summaries = data?.data ?? [];

  function formatCurrency(cents: number): string {
    const abs = Math.abs(cents);
    const formatted = `$${(abs / 100).toFixed(2)}`;
    return cents < 0 ? `-${formatted}` : formatted;
  }

  function renderSummary({
    item,
  }: {
    item: TaxSummary;
  }): React.ReactElement {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleMedium" style={styles.fy}>
              FY {item.financialYear}
            </Text>
          </View>

          <View style={styles.row}>
            <Text variant="bodyMedium">Total Income</Text>
            <Text variant="bodyMedium">{formatCurrency(item.totalIncome)}</Text>
          </View>
          <View style={styles.row}>
            <Text variant="bodyMedium">Deductions</Text>
            <Text variant="bodyMedium">
              {formatCurrency(item.totalDeductions)}
            </Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.row}>
            <Text variant="bodyMedium">Taxable Income</Text>
            <Text variant="bodyMedium">
              {formatCurrency(item.taxableIncome)}
            </Text>
          </View>
          <Divider style={styles.divider} />

          <View style={styles.row}>
            <Text
              variant="titleSmall"
              style={[
                styles.bold,
                {
                  color: item.isRefund
                    ? '#4CAF50'
                    : theme.colors.error,
                },
              ]}
            >
              {item.isRefund ? 'Refund' : 'Owing'}
            </Text>
            <Text
              variant="titleSmall"
              style={[
                styles.bold,
                {
                  color: item.isRefund
                    ? '#4CAF50'
                    : theme.colors.error,
                },
              ]}
            >
              {formatCurrency(Math.abs(item.refundOrOwing))}
            </Text>
          </View>

          {item.lodgementDate && (
            <Text variant="bodySmall" style={styles.dimText}>
              Lodged:{' '}
              {new Date(item.lodgementDate).toLocaleDateString('en-AU')}
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Tax Summaries" />
      </Appbar.Header>

      <FlatList
        data={summaries}
        keyExtractor={(item: TaxSummary) => item._id}
        renderItem={renderSummary}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text variant="bodyLarge">No tax summaries available</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fy: {
    fontWeight: '700',
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  divider: {
    marginVertical: 6,
  },
  bold: {
    fontWeight: '700',
  },
  dimText: {
    opacity: 0.6,
    marginTop: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
