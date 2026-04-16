import React, { useState, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text, Card, ActivityIndicator, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/hooks/useNotifications';
import type { Notification } from '@/types/notification';

export default function NotificationsScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const [page] = useState(1);
  const { data, isLoading, refetch, isRefetching } = useNotifications(page);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const notifications = data?.data ?? [];

  const handleRefresh = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  function renderNotification({ item }: { item: Notification }): React.ReactElement {
    return (
      <Card
        style={[styles.card, !item.isRead && styles.unreadCard]}
        onPress={() => {
          if (!item.isRead) {
            markRead.mutate(item._id);
          }
        }}
      >
        <Card.Content>
          <Text variant="titleSmall" style={[!item.isRead && styles.unreadTitle]}>
            {item.title}
          </Text>
          <Text variant="bodySmall" style={styles.body}>
            {item.body}
          </Text>
          <Text variant="labelSmall" style={styles.time}>
            {new Date(item.createdAt).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Notifications" />
        <Appbar.Action
          icon="check-all"
          onPress={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item: Notification) => item._id}
          renderItem={renderNotification}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyLarge">No notifications</Text>
            </View>
          }
        />
      )}
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
    marginBottom: 10,
  },
  unreadCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#6200ee',
  },
  unreadTitle: {
    fontWeight: '700',
  },
  body: {
    marginTop: 4,
    opacity: 0.8,
  },
  time: {
    marginTop: 6,
    opacity: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
