'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Typography,
} from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  useConversations,
  useConversationMessages,
  useSendMessage,
  useMarkRead,
  useCreateConversation,
} from '@/hooks/usePortal';
import { useChatSocket } from '@/hooks/useSocket';
import type { Conversation, ChatMessage } from '@/types/chat';
import { formatRelative } from '@/lib/utils/format';

const { Title, Text, Paragraph } = Typography;

export function ChatPage(): React.ReactNode {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [messageText, setMessageText] = useState('');
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversations, isLoading: convosLoading } = useConversations();
  const { data: messages, isLoading: msgsLoading } = useConversationMessages(selectedId);
  const sendMutation = useSendMessage();
  const markReadMutation = useMarkRead();
  const createConvoMutation = useCreateConversation();

  // Socket.io integration — real-time messages, typing indicators
  const { sendTyping } = useChatSocket(
    selectedId,
    useCallback((payload) => {
      setTypingUser(payload.userId);
      // Clear typing indicator after 3 seconds
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); }
      typingTimeoutRef.current = setTimeout(() => { setTypingUser(null); }, 3000);
    }, []),
  );

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedId) {
      markReadMutation.mutate(selectedId);
    }
  }, [selectedId]); // eslint-disable-line

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!selectedId || !messageText.trim()) { return; }
    sendMutation.mutate(
      { conversationId: selectedId, content: messageText.trim() },
      { onSuccess: () => { setMessageText(''); } },
    );
  }, [selectedId, messageText, sendMutation]);

  const handleCreateConversation = useCallback(() => {
    if (!newSubject.trim()) { return; }
    createConvoMutation.mutate(newSubject.trim(), {
      onSuccess: (convo) => {
        setNewConvoOpen(false);
        setNewSubject('');
        setSelectedId(convo._id);
      },
    });
  }, [newSubject, createConvoMutation]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMessageText(e.target.value);
      if (selectedId && e.target.value.trim()) {
        sendTyping(selectedId);
      }
    },
    [selectedId, sendTyping],
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Chat</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setNewConvoOpen(true); }}
        >
          New Conversation
        </Button>
      </div>

      <Modal
        title="Start a Conversation"
        open={newConvoOpen}
        onCancel={() => { setNewConvoOpen(false); }}
        onOk={handleCreateConversation}
        confirmLoading={createConvoMutation.isPending}
      >
        <Input
          placeholder="Subject (e.g., Tax return query)"
          value={newSubject}
          onChange={(e) => { setNewSubject(e.target.value); }}
          onPressEnter={handleCreateConversation}
        />
      </Modal>

      <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
        {/* Conversation List */}
        <Card
          size="small"
          style={{ width: 320, flexShrink: 0, overflow: 'auto', maxHeight: 600 }}
          bodyStyle={{ padding: 0 }}
        >
          {convosLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <Empty
              description="No conversations"
              style={{ padding: 24 }}
            />
          ) : (
            <List
              dataSource={conversations}
              renderItem={(convo: Conversation) => (
                <List.Item
                  key={convo._id}
                  onClick={() => { setSelectedId(convo._id); }}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: selectedId === convo._id ? '#e6f4ff' : undefined,
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text
                        strong={convo.unreadCountUser > 0}
                        ellipsis
                        style={{ flex: 1 }}
                      >
                        {convo.subject ?? 'Conversation'}
                      </Text>
                      {convo.unreadCountUser > 0 && (
                        <Badge count={convo.unreadCountUser} size="small" />
                      )}
                    </div>
                    <Text
                      type="secondary"
                      ellipsis
                      style={{ display: 'block', fontSize: 12 }}
                    >
                      {convo.lastMessagePreview ?? 'No messages yet'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatRelative(convo.lastMessageAt)}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Card>

        {/* Message Area */}
        <Card
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          bodyStyle={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
          }}
        >
          {!selectedId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text type="secondary">Select a conversation to start chatting</Text>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: 16,
                  maxHeight: 450,
                }}
              >
                {msgsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin />
                  </div>
                ) : !messages || messages.length === 0 ? (
                  <Empty description="No messages yet" />
                ) : (
                  messages.map((msg: ChatMessage) => {
                    const isClient = msg.senderType === 'client';
                    const isSystem = msg.senderType === 'system';

                    if (isSystem) {
                      return (
                        <div
                          key={msg._id}
                          style={{
                            textAlign: 'center',
                            marginBottom: 12,
                          }}
                        >
                          <Text type="secondary" italic style={{ fontSize: 12 }}>
                            {msg.content}
                          </Text>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg._id}
                        style={{
                          display: 'flex',
                          justifyContent: isClient ? 'flex-end' : 'flex-start',
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            padding: '8px 14px',
                            borderRadius: 12,
                            background: isClient ? '#1677ff' : '#f0f0f0',
                            color: isClient ? '#fff' : 'inherit',
                          }}
                        >
                          <Paragraph
                            style={{
                              margin: 0,
                              color: isClient ? '#fff' : 'inherit',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {msg.content}
                          </Paragraph>
                          <Text
                            style={{
                              fontSize: 10,
                              color: isClient ? 'rgba(255,255,255,0.7)' : '#999',
                            }}
                          >
                            {formatRelative(msg.createdAt)}
                          </Text>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator */}
              {typingUser && (
                <div style={{ padding: '4px 16px', fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' }}>
                  Staff is typing...
                </div>
              )}

              {/* Input */}
              <div
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    loading={sendMutation.isPending}
                    disabled={!messageText.trim()}
                  />
                </Space.Compact>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
