import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text, Card, Chip, Divider, ActivityIndicator, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTaxSummaries } from '@/hooks/useTaxSummary';
import type { TaxSummary } from '@/types/taxSummary';

const _ATO_STATUS_COLORS: Record<string, string> = {
  not_lodged: '#FF9800',
  lodged: '#2196F3',
  processing: '#9C27B0',
  assessed: '#4CAF50',
  amended: '#607D8B',
};

export default function TaxSummaryScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading } = useTaxSummaries();

  const summaries = data?.data ?? [];
  // Sort by financial year DESC so [0] is current
  const sorted = [...summaries].sort((a, b) => b.financialYear.localeCompare(a.financialYear));
  const current = sorted[0];
  const previous = sorted[1];

  function formatCurrency(cents: number): string {
    const abs = Math.abs(cents);
    const formatted = `$${(abs / 100).toFixed(2)}`;
    return cents < 0 ? `-${formatted}` : formatted;
  }

  function deltaChip(curr: number, prev: number | undefined): string {
    if (prev === undefined || prev === 0) {
      return '';
    }
    const delta = curr - prev;
    const pct = (delta / Math.abs(prev)) * 100;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }

  function renderSummary({ item }: { item: TaxSummary }): React.ReactElement {
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
            <Text variant="bodyMedium">{formatCurrency(item.totalDeductions)}</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.row}>
            <Text variant="bodyMedium">Taxable Income</Text>
            <Text variant="bodyMedium">{formatCurrency(item.taxableIncome)}</Text>
          </View>
          <Divider style={styles.divider} />

          <View style={styles.row}>
            <Text
              variant="titleSmall"
              style={[
                styles.bold,
                {
                  color: item.isRefund ? '#4CAF50' : theme.colors.error,
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
                  color: item.isRefund ? '#4CAF50' : theme.colors.error,
                },
              ]}
            >
              {formatCurrency(Math.abs(item.refundOrOwing))}
            </Text>
          </View>

          {item.lodgementDate && (
            <Text variant="bodySmall" style={styles.dimText}>
              Lodged: {new Date(item.lodgementDate).toLocaleDateString('en-AU')}
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
        data={sorted}
        keyExtractor={(item: TaxSummary) => item._id}
        renderItem={renderSummary}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          current && previous ? (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.fy}>
                  Year over Year
                </Text>
                <Text variant="bodySmall" style={styles.dimText}>
                  FY {current.financialYear} vs FY {previous.financialYear}
                </Text>
                <Divider style={styles.divider} />
                <View style={styles.row}>
                  <Text variant="bodyMedium">Income</Text>
                  <Text variant="bodyMedium">
                    {formatCurrency(current.totalIncome)}{' '}
                    <Chip
                      compact
                      textStyle={styles.chipText}
                      style={{
                        backgroundColor:
                          current.totalIncome >= previous.totalIncome ? '#4CAF50' : '#F44336',
                      }}
                    >
                      {deltaChip(current.totalIncome, previous.totalIncome)}
                    </Chip>
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text variant="bodyMedium">Deductions</Text>
                  <Text variant="bodyMedium">
                    {formatCurrency(current.totalDeductions)}{' '}
                    <Chip
                      compact
                      textStyle={styles.chipText}
                      style={{ backgroundColor: '#2196F3' }}
                    >
                      {deltaChip(current.totalDeductions, previous.totalDeductions)}
                    </Chip>
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text variant="bodyMedium">Refund/Owing</Text>
                  <Text variant="bodyMedium">
                    {formatCurrency(current.refundOrOwing)}{' '}
                    <Chip
                      compact
                      textStyle={styles.chipText}
                      style={{
                        backgroundColor:
                          current.refundOrOwing >= previous.refundOrOwing ? '#4CAF50' : '#F44336',
                      }}
                    >
                      {deltaChip(current.refundOrOwing, previous.refundOrOwing)}
                    </Chip>
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ) : null
        }
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
