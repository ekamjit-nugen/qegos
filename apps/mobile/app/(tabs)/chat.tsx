import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text, Card, Badge, Button, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useConversations } from '@/hooks/useChat';
import type { Conversation } from '@/types/chat';
import { ChatSkeleton } from '@/components/ScreenSkeleton';

export default function ChatScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isError } = useConversations();

  const conversations = data?.data ?? [];

  function renderConversation({ item }: { item: Conversation }): React.ReactElement {
    const lastMessageTime = item.lastMessage?.sentAt
      ? new Date(item.lastMessage.sentAt).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      <Card style={styles.card} onPress={() => router.push(`/chat/${item._id}`)}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text
              variant="titleSmall"
              style={[styles.subject, item.unreadCount > 0 && styles.unreadSubject]}
              numberOfLines={1}
            >
              {item.subject}
            </Text>
            {item.unreadCount > 0 && (
              <Badge style={{ backgroundColor: theme.colors.primary }}>{item.unreadCount}</Badge>
            )}
          </View>
          {item.lastMessage && (
            <Text variant="bodySmall" numberOfLines={2} style={styles.preview}>
              {item.lastMessage.body}
            </Text>
          )}
          <Text variant="bodySmall" style={styles.time}>
            {lastMessageTime}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  if (isLoading) {
    return <ChatSkeleton />;
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>
          Failed to load conversations
        </Text>
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
      data={conversations}
      keyExtractor={(item: Conversation) => item._id}
      renderItem={renderConversation}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text variant="bodyLarge">No conversations yet</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subject: {
    flex: 1,
    marginRight: 8,
  },
  unreadSubject: {
    fontWeight: '700',
  },
  preview: {
    marginTop: 4,
    opacity: 0.7,
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
