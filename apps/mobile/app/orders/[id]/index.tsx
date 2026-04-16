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
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  EFILE_STATUS_LABELS,
} from '@/types/order';
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
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>
          Failed to load order
        </Text>
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
        {order.paymentStatus !== 'succeeded' && order.finalAmount > 0 && (
          <Appbar.Action
            icon="credit-card-outline"
            onPress={() => {
              router.push({
                pathname: '/orders/[id]/pay',
                params: { id: id as string, orderNumber: order.orderNumber },
              } as never);
            }}
          />
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusRow}>
              <Text variant="titleMedium">Status</Text>
              <Chip compact textStyle={styles.chipText} style={{ backgroundColor: statusColor }}>
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

        {(order.paymentStatus || order.eFileStatus || order.refundOrOwing !== undefined) && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Filing Status
              </Text>
              {order.paymentStatus && (
                <List.Item
                  title="Payment"
                  description={PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                  left={(props) => <List.Icon {...props} icon="credit-card-outline" />}
                />
              )}
              {order.eFileStatus && order.eFileStatus !== 'not_filed' && (
                <List.Item
                  title="ATO Lodgement"
                  description={`${EFILE_STATUS_LABELS[order.eFileStatus] ?? order.eFileStatus}${order.eFileReference ? ` · ${order.eFileReference}` : ''}`}
                  left={(props) => <List.Icon {...props} icon="bank-outline" />}
                />
              )}
              {order.refundOrOwing !== undefined && order.refundOrOwing !== 0 && (
                <List.Item
                  title={order.refundOrOwing > 0 ? 'Your Refund' : 'Amount Owing'}
                  description={`$${(Math.abs(order.refundOrOwing) / 100).toFixed(2)}`}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon="cash"
                      color={order.refundOrOwing! > 0 ? '#52c41a' : '#ff4d4f'}
                    />
                  )}
                />
              )}
              {order.noaReceived && (
                <List.Item
                  title="Notice of Assessment"
                  description={
                    order.noaDate ? new Date(order.noaDate).toLocaleDateString('en-AU') : 'Received'
                  }
                  left={(props) => <List.Icon {...props} icon="check-decagram" color="#52c41a" />}
                />
              )}
            </Card.Content>
          </Card>
        )}

        {order.scheduledAppointment && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Upcoming Appointment
              </Text>
              <List.Item
                title={`${order.scheduledAppointment.date} · ${order.scheduledAppointment.timeSlot}`}
                description={`${order.scheduledAppointment.type} · ${order.scheduledAppointment.status}`}
                left={(props) => <List.Icon {...props} icon="calendar-clock" />}
              />
            </Card.Content>
          </Card>
        )}

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
                  <Text variant="bodyMedium">${(item.subtotal / 100).toFixed(2)}</Text>
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
              <Text variant="bodyMedium">${(order.totalAmount / 100).toFixed(2)}</Text>
            </View>
            {order.discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium">Discount ({order.discountPercent}%)</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                  -${(order.discountAmount / 100).toFixed(2)}
                </Text>
              </View>
            )}
            {order.creditApplied !== undefined && order.creditApplied > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium">Credits Applied</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                  -${(order.creditApplied / 100).toFixed(2)}
                </Text>
              </View>
            )}
            {order.promoCode && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium">Promo Code</Text>
                <Chip compact>{order.promoCode}</Chip>
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
            {order.paymentStatus !== 'succeeded' && order.finalAmount > 0 && (
              <Button
                mode="contained"
                icon="credit-card-outline"
                style={{ marginTop: 12 }}
                onPress={() => {
                  router.push({
                    pathname: '/orders/[id]/pay',
                    params: { id: id as string, orderNumber: order.orderNumber },
                  } as never);
                }}
              >
                Pay Now
              </Button>
            )}
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
                  left={(props) => <List.Icon {...props} icon="file-document-outline" />}
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
              description={new Date(order.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              left={(props) => <List.Icon {...props} icon="calendar-outline" />}
            />
            <List.Item
              title="Last Updated"
              description={new Date(order.updatedAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
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
