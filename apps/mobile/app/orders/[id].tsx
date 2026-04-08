import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Chip,
  ProgressBar,
  Divider,
  List,
  Button,
  Appbar,
  useTheme,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useOrder } from '@/hooks/useOrders';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import type { OrderLineItem, OrderDocument } from '@/types/order';
import { DetailSkeleton } from '@/components/ScreenSkeleton';

export default function OrderDetailScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useOrder(id);

  const order = data?.data;

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (isError || !order) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Failed to load order</Text>
        <Text variant="bodyMedium" style={{ opacity: 0.6, marginBottom: 16, textAlign: 'center' }}>
          This order may not exist or you may not have access.
        </Text>
        <Button mode="contained" onPress={() => router.back()}>
          Go Back
        </Button>
      </View>
    );
  }

  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? 'Unknown';
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? 'grey';

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={order.orderNumber} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusRow}>
              <Text variant="titleMedium">Status</Text>
              <Chip
                compact
                textStyle={styles.chipText}
                style={{ backgroundColor: statusColor }}
              >
                {statusLabel}
              </Chip>
            </View>
            <Text variant="bodySmall" style={styles.dimText}>
              FY {order.financialYear}
            </Text>

            <View style={styles.progressRow}>
              <Text variant="bodySmall">Progress</Text>
              <Text variant="bodySmall">{order.completionPercent}%</Text>
            </View>
            <ProgressBar
              progress={order.completionPercent / 100}
              color={theme.colors.primary}
              style={styles.progressBar}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Line Items
            </Text>
            {order.lineItems.map((item: OrderLineItem) => (
              <View key={item._id}>
                <View style={styles.lineItem}>
                  <View style={styles.lineItemInfo}>
                    <Text variant="bodyMedium">{item.title}</Text>
                    <Chip compact style={styles.statusChip}>
                      {item.completionStatus.replace('_', ' ')}
                    </Chip>
                  </View>
                  <Text variant="bodyMedium">
                    ${(item.subtotal / 100).toFixed(2)}
                  </Text>
                </View>
                <Divider style={styles.divider} />
              </View>
            ))}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Financial Summary
            </Text>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium">Subtotal</Text>
              <Text variant="bodyMedium">
                ${(order.totalAmount / 100).toFixed(2)}
              </Text>
            </View>
            {order.discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium">
                  Discount ({order.discountPercent}%)
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                  -${(order.discountAmount / 100).toFixed(2)}
                </Text>
              </View>
            )}
            <Divider style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text variant="titleSmall" style={styles.bold}>
                Total
              </Text>
              <Text variant="titleSmall" style={styles.bold}>
                ${(order.finalAmount / 100).toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {order.documents.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Documents
              </Text>
              {order.documents.map((doc: OrderDocument) => (
                <List.Item
                  key={doc.documentId}
                  title={doc.fileName}
                  description={doc.status}
                  left={(props) => (
                    <List.Icon {...props} icon="file-document-outline" />
                  )}
                />
              ))}
            </Card.Content>
          </Card>
        )}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Timeline
            </Text>
            {order.processingByName && (
              <List.Item
                title="Assigned to"
                description={order.processingByName}
                left={(props) => <List.Icon {...props} icon="account" />}
              />
            )}
            <List.Item
              title="Created"
              description={new Date(order.createdAt).toLocaleDateString(
                'en-AU',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                },
              )}
              left={(props) => (
                <List.Icon {...props} icon="calendar-outline" />
              )}
            />
            <List.Item
              title="Last Updated"
              description={new Date(order.updatedAt).toLocaleDateString(
                'en-AU',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                },
              )}
              left={(props) => <List.Icon {...props} icon="update" />}
            />
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
  },
  dimText: {
    opacity: 0.6,
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 10,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  lineItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  statusChip: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bold: {
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
