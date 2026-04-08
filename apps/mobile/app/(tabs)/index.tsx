import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';
import { useMyOrders } from '@/hooks/useOrders';
import { useVaultDocuments } from '@/hooks/useVault';
import { useUpcomingAppointments } from '@/hooks/useAppointments';
import { useUnreadCount } from '@/hooks/useChat';
import { DashboardSkeleton } from '@/components/ScreenSkeleton';

export default function DashboardScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const ordersQuery = useMyOrders(1, 1);
  const vaultQuery = useVaultDocuments({ limit: 1 });
  const appointmentsQuery = useUpcomingAppointments();
  const unreadQuery = useUnreadCount();

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
      <Text variant="headlineMedium" style={styles.greeting}>
        Welcome back, {user?.firstName ?? 'there'}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Here is your tax preparation overview
      </Text>

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

          <Card
            style={styles.statCard}
            onPress={() => router.push('/appointments')}
          >
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

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.actions}>
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
});
