import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Chip,
  ProgressBar,
  Button,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMyOrders } from '@/hooks/useOrders';
import type { Order } from '@/types/order';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import { ListSkeleton } from '@/components/ScreenSkeleton';

export default function OrdersScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useMyOrders(page, 20);

  const orders = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function renderOrder({ item }: { item: Order }): React.ReactElement {
    const statusLabel = ORDER_STATUS_LABELS[item.status] ?? 'Unknown';
    const statusColor = ORDER_STATUS_COLORS[item.status] ?? 'grey';

    return (
      <Card
        style={styles.card}
        onPress={() => router.push(`/orders/${item._id}`)}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={styles.orderNumber}>
              {item.orderNumber}
            </Text>
            <Chip
              compact
              textStyle={styles.chipText}
              style={{ backgroundColor: statusColor }}
            >
              {statusLabel}
            </Chip>
          </View>

          <Text variant="bodySmall" style={styles.fy}>
            FY {item.financialYear}
          </Text>

          <View style={styles.progressRow}>
            <Text variant="bodySmall">Progress</Text>
            <Text variant="bodySmall">{item.completionPercent}%</Text>
          </View>
          <ProgressBar
            progress={item.completionPercent / 100}
            color={theme.colors.primary}
            style={styles.progressBar}
          />

          <View style={styles.cardFooter}>
            <Text variant="bodyMedium" style={styles.amount}>
              ${(item.finalAmount / 100).toFixed(2)}
            </Text>
            <Text variant="bodySmall" style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString('en-AU')}
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  }

  if (isLoading) {
    return <ListSkeleton rows={6} />;
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Failed to load orders</Text>
        <Text variant="bodyMedium" style={{ opacity: 0.6, marginBottom: 16, textAlign: 'center' }}>
          Please check your connection and try again.
        </Text>
        <Button mode="contained" onPress={() => void 0}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item: Order) => item._id}
      renderItem={renderOrder}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text variant="bodyLarge">No orders found</Text>
        </View>
      }
      onEndReached={() => {
        if (page < totalPages) {
          setPage((prev: number) => prev + 1);
        }
      }}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderNumber: {
    fontWeight: '600',
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
  },
  fy: {
    opacity: 0.6,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontWeight: '600',
  },
  date: {
    opacity: 0.6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
