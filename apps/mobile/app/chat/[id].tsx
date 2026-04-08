import React, { useState, useRef, useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  Appbar,
  Surface,
  useTheme,
} from 'react-native-paper';
import { ChatSkeleton } from '@/components/ScreenSkeleton';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';
import { useConversationMessages, useSendMessage } from '@/hooks/useChat';
import { useChatSocket } from '@/hooks/useSocket';
import type { ChatMessage } from '@/types/chat';

export default function ChatConversationScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useConversationMessages(id);
  const sendMessage = useSendMessage();
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Socket.io — real-time messages + typing indicator
  const { sendTyping } = useChatSocket(
    id,
    useCallback((payload) => {
      setIsTyping(payload.isTyping);
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); }
      typingTimeoutRef.current = setTimeout(() => { setIsTyping(false); }, 3000);
    }, []),
  );

  const messages = data?.data ?? [];

  async function handleSend(): Promise<void> {
    if (!messageText.trim() || !id) { return; }
    const body = messageText.trim();
    setMessageText('');
    await sendMessage.mutateAsync({ conversationId: id, body });
  }

  function handleTextChange(text: string): void {
    setMessageText(text);
    if (id && text.trim()) {
      sendTyping(id);
    }
  }

  function renderMessage({
    item,
  }: {
    item: ChatMessage;
  }): React.ReactElement {
    const isOwn = item.senderId === user?._id;

    return (
      <View
        style={[
          styles.messageRow,
          isOwn ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        <Surface
          style={[
            styles.messageBubble,
            {
              backgroundColor: isOwn
                ? theme.colors.primaryContainer
                : theme.colors.surfaceVariant,
            },
          ]}
          elevation={1}
        >
          {!isOwn && (
            <Text variant="labelSmall" style={styles.senderName}>
              {item.senderName}
            </Text>
          )}
          <Text variant="bodyMedium">{item.body}</Text>
          <Text variant="labelSmall" style={styles.messageTime}>
            {new Date(item.createdAt).toLocaleTimeString('en-AU', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Surface>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Conversation" />
      </Appbar.Header>

      {isLoading ? (
        <ChatSkeleton />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item: ChatMessage) => item._id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge">No messages yet</Text>
            </View>
          }
        />
      )}

      {isTyping && (
        <View style={styles.typingBar}>
          <Text variant="labelSmall" style={styles.typingText}>
            Staff is typing...
          </Text>
        </View>
      )}

      <Surface style={styles.inputBar} elevation={2}>
        <TextInput
          value={messageText}
          onChangeText={handleTextChange}
          placeholder="Type a message..."
          mode="outlined"
          style={styles.textInput}
          dense
          multiline
          maxLength={2000}
        />
        <IconButton
          icon="send"
          mode="contained"
          onPress={handleSend}
          disabled={!messageText.trim() || sendMessage.isPending}
          loading={sendMessage.isPending}
        />
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  messageList: {
    padding: 16,
  },
  messageRow: {
    marginBottom: 10,
    maxWidth: '80%',
  },
  messageRowLeft: {
    alignSelf: 'flex-start',
  },
  messageRowRight: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    padding: 10,
    borderRadius: 12,
  },
  senderName: {
    fontWeight: '600',
    marginBottom: 2,
    opacity: 0.7,
  },
  messageTime: {
    opacity: 0.5,
    marginTop: 4,
    textAlign: 'right',
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontStyle: 'italic',
    opacity: 0.6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    marginRight: 4,
    maxHeight: 100,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
});
