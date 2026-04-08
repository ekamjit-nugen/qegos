'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, List, Spin, Empty } from 'antd';
import { useConversation, useConversationMessages } from '@/hooks/useChat';
import type { ConversationStatus } from '@/types/chat';
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_COLORS } from '@/types/chat';
import { formatDateTime } from '@/lib/utils/format';

interface ChatMessage {
  _id: string;
  senderType: 'client' | 'staff' | 'system';
  content: string;
  createdAt: string;
}

const SENDER_TYPE_COLORS: Record<string, string> = {
  client: 'blue',
  staff: 'green',
  system: 'default',
};

export function ChatDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: conversation, isLoading: convLoading } = useConversation(id);
  const { data: messages, isLoading: msgLoading } = useConversationMessages(id);

  if (convLoading || msgLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!conversation) { return <Empty description="Conversation not found" />; }

  const messageList = (messages ?? []) as ChatMessage[];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          Conversation{conversation.subject ? ` - ${conversation.subject}` : ''}{' '}
          <Tag color={CONVERSATION_STATUS_COLORS[conversation.status as ConversationStatus]}>
            {CONVERSATION_STATUS_LABELS[conversation.status as ConversationStatus] ?? conversation.status}
          </Tag>
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Messages">
            {messageList.length === 0 ? (
              <Empty description="No messages" />
            ) : (
              <List
                dataSource={messageList}
                renderItem={(msg: ChatMessage) => (
                  <List.Item
                    key={msg._id}
                    style={{
                      background: msg.senderType === 'client' ? '#f0f5ff' : msg.senderType === 'system' ? '#f5f5f5' : '#fff',
                      padding: '12px 16px',
                      marginBottom: 4,
                      borderRadius: 6,
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color={SENDER_TYPE_COLORS[msg.senderType] ?? 'default'}>
                            {msg.senderType}
                          </Tag>
                          <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                            {formatDateTime(msg.createdAt)}
                          </span>
                        </div>
                      }
                      description={<span style={{ color: '#000' }}>{msg.content}</span>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Conversation Info">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="User ID">{conversation.userId}</Descriptions.Item>
              <Descriptions.Item label="Staff ID">{conversation.staffId}</Descriptions.Item>
              {conversation.orderId && (
                <Descriptions.Item label="Order ID">{conversation.orderId}</Descriptions.Item>
              )}
              <Descriptions.Item label="Status">
                <Tag color={CONVERSATION_STATUS_COLORS[conversation.status as ConversationStatus]}>
                  {CONVERSATION_STATUS_LABELS[conversation.status as ConversationStatus] ?? conversation.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Unread (Staff)">{conversation.unreadCountStaff}</Descriptions.Item>
              <Descriptions.Item label="Last Message">{formatDateTime(conversation.lastMessageAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
