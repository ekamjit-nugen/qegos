import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Button,
  ProgressBar,
  Chip,
  Badge,
  IconButton,
  Divider,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';
import { useMyOrders } from '@/hooks/useOrders';
import { useVaultDocuments } from '@/hooks/useVault';
import { useUpcomingAppointments } from '@/hooks/useAppointments';
import { useUnreadCount } from '@/hooks/useChat';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
} from '@/hooks/useNotifications';
import { DashboardSkeleton } from '@/components/ScreenSkeleton';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  OrderStatus,
  EFILE_STATUS_LABELS,
} from '@/types/order';

const TAX_SEASON_MILESTONES: { status: OrderStatus; label: string; icon: string }[] = [
  { status: OrderStatus.Pending, label: 'Submitted', icon: 'file-document' },
  { status: OrderStatus.DocumentsReceived, label: 'Documents', icon: 'folder-check' },
  { status: OrderStatus.Assigned, label: 'Assigned', icon: 'account-check' },
  { status: OrderStatus.InProgress, label: 'Preparing', icon: 'pencil' },
  { status: OrderStatus.Review, label: 'Review', icon: 'eye-check' },
  { status: OrderStatus.Lodged, label: 'Lodged', icon: 'bank-check' },
  { status: OrderStatus.Assessed, label: 'Assessed', icon: 'check-all' },
];

export default function DashboardScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const ordersQuery = useMyOrders(1, 5);
  const vaultQuery = useVaultDocuments({ limit: 1 });
  const appointmentsQuery = useUpcomingAppointments();
  const unreadQuery = useUnreadCount();
  const notifUnreadQuery = useUnreadNotificationCount();
  const notificationsQuery = useNotifications(1, 3);
  const markNotifRead = useMarkNotificationRead();
  const notifUnread = notifUnreadQuery.data?.data?.count ?? 0;
  const recentNotifs = notificationsQuery.data?.data ?? [];

  const activeOrders = ordersQuery.data?.meta?.total ?? 0;
  const totalDocuments = vaultQuery.data?.meta?.total ?? 0;
  const upcomingAppointments = appointmentsQuery.data?.data?.length ?? 0;
  const unreadMessages = unreadQuery.data?.data?.total ?? 0;

  const isLoading =
    ordersQuery.isLoading ||
    vaultQuery.isLoading ||
    appointmentsQuery.isLoading ||
    unreadQuery.isLoading;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineMedium" style={styles.greeting}>
            Welcome back, {user?.firstName ?? 'there'}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Here is your tax preparation overview
          </Text>
        </View>
        <View>
          <IconButton icon="bell-outline" size={28} onPress={() => router.push('/notifications')} />
          {notifUnread > 0 && (
            <Badge size={18} style={styles.bellBadge}>
              {notifUnread}
            </Badge>
          )}
        </View>
      </View>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <View style={styles.grid}>
          <Card style={styles.statCard} onPress={() => router.push('/(tabs)/orders')}>
            <Card.Content>
              <Text variant="displaySmall" style={{ color: theme.colors.primary }}>
                {activeOrders}
              </Text>
              <Text variant="bodyMedium">Active Orders</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard} onPress={() => router.push('/(tabs)/vault')}>
            <Card.Content>
              <Text variant="displaySmall" style={{ color: theme.colors.primary }}>
                {totalDocuments}
              </Text>
              <Text variant="bodyMedium">Documents</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard} onPress={() => router.push('/appointments')}>
            <Card.Content>
              <Text variant="displaySmall" style={{ color: theme.colors.primary }}>
                {upcomingAppointments}
              </Text>
              <Text variant="bodyMedium">Upcoming Appointments</Text>
            </Card.Content>
          </Card>

          <Card style={styles.statCard} onPress={() => router.push('/(tabs)/chat')}>
            <Card.Content>
              <Text variant="displaySmall" style={{ color: theme.colors.primary }}>
                {unreadMessages}
              </Text>
              <Text variant="bodyMedium">Unread Messages</Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {(() => {
        const orders = ordersQuery.data?.data ?? [];
        const activeOrder =
          orders.find(
            (o) =>
              o.status !== OrderStatus.Completed &&
              o.status !== OrderStatus.Assessed &&
              o.status !== OrderStatus.Cancelled,
          ) ?? orders[0];
        if (!activeOrder) {
          return null;
        }
        const currentIdx = TAX_SEASON_MILESTONES.findIndex((m) => m.status === activeOrder.status);
        return (
          <Card
            style={styles.seasonCard}
            onPress={() => router.push(`/orders/${activeOrder._id}` as never)}
          >
            <Card.Content>
              <Text variant="titleMedium" style={styles.seasonTitle}>
                Tax Season Progress
              </Text>
              <Text variant="bodySmall" style={styles.dim}>
                {activeOrder.orderNumber} · FY {activeOrder.financialYear}
              </Text>
              <View style={styles.chipRow}>
                <Chip
                  compact
                  style={{ backgroundColor: ORDER_STATUS_COLORS[activeOrder.status] }}
                  textStyle={styles.chipText}
                >
                  {ORDER_STATUS_LABELS[activeOrder.status]}
                </Chip>
                {activeOrder.eFileStatus && activeOrder.eFileStatus !== 'not_filed' && (
                  <Chip compact style={styles.efileChip}>
                    {EFILE_STATUS_LABELS[activeOrder.eFileStatus] ?? activeOrder.eFileStatus}
                  </Chip>
                )}
              </View>
              <ProgressBar
                progress={activeOrder.completionPercent / 100}
                color={theme.colors.primary}
                style={styles.seasonProgress}
              />
              <View style={styles.milestones}>
                {TAX_SEASON_MILESTONES.map((m, i) => {
                  const reached = currentIdx >= 0 && i <= currentIdx;
                  return (
                    <View key={m.status} style={styles.milestone}>
                      <View
                        style={[
                          styles.milestoneDot,
                          {
                            backgroundColor: reached
                              ? theme.colors.primary
                              : theme.colors.surfaceVariant,
                          },
                        ]}
                      />
                      <Text
                        variant="labelSmall"
                        style={{ opacity: reached ? 1 : 0.4, textAlign: 'center' }}
                      >
                        {m.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card.Content>
          </Card>
        );
      })()}

      {recentNotifs.length > 0 && (
        <Card style={styles.seasonCard}>
          <Card.Content>
            <View style={styles.notifHeader}>
              <Text variant="titleMedium" style={styles.seasonTitle}>
                Recent Notifications
              </Text>
              <Button compact mode="text" onPress={() => router.push('/notifications')}>
                See all
              </Button>
            </View>
            {recentNotifs.slice(0, 3).map((n, idx) => (
              <View key={n._id}>
                <Pressable
                  onPress={() => {
                    if (!n.isRead) {
                      markNotifRead.mutate(n._id);
                    }
                    router.push('/notifications');
                  }}
                  style={styles.notifItem}
                >
                  {!n.isRead && (
                    <View style={[styles.notifDot, { backgroundColor: theme.colors.primary }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="bodyMedium"
                      style={{ fontWeight: n.isRead ? '400' : '700' }}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    <Text variant="bodySmall" style={styles.dim} numberOfLines={2}>
                      {n.body}
                    </Text>
                  </View>
                </Pressable>
                {idx < Math.min(recentNotifs.length, 3) - 1 && <Divider />}
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.actions}>
        <Button
          mode="contained"
          style={styles.actionButton}
          icon="file-document-plus"
          onPress={() => router.push('/file-tax' as never)}
        >
          File Tax Return
        </Button>
        <Button
          mode="contained"
          style={styles.actionButton}
          onPress={() => router.push('/(tabs)/orders')}
        >
          View Orders
        </Button>
        <Button
          mode="contained"
          style={styles.actionButton}
          onPress={() => router.push('/(tabs)/vault')}
        >
          Upload Document
        </Button>
        <Button
          mode="outlined"
          style={styles.actionButton}
          onPress={() => router.push('/appointments')}
        >
          Book Appointment
        </Button>
        <Button
          mode="outlined"
          style={styles.actionButton}
          onPress={() => router.push('/tax-summary')}
        >
          Tax Summary
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  greeting: {
    marginTop: 8,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 20,
    opacity: 0.7,
  },
  loader: {
    marginTop: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 24,
  },
  actionButton: {
    flexGrow: 1,
    minWidth: '45%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 8,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  seasonCard: {
    marginTop: 20,
  },
  seasonTitle: {
    fontWeight: '600',
  },
  dim: {
    opacity: 0.6,
    marginTop: 2,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chipText: {
    color: '#fff',
    fontSize: 11,
  },
  efileChip: {
    backgroundColor: '#1677ff22',
  },
  seasonProgress: {
    height: 6,
    borderRadius: 3,
    marginBottom: 14,
  },
  milestones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  milestone: {
    alignItems: 'center',
    flex: 1,
  },
  milestoneDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
});
