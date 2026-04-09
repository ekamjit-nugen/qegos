'use client';

import { Skeleton, Card, Space } from 'antd';

/**
 * Chat page loading skeleton — conversation list + message area.
 */
export default function ChatLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24, display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* Conversation list */}
      <Card style={{ width: 320, flexShrink: 0 }} bodyStyle={{ padding: 0 }}>
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Skeleton.Input active style={{ width: '100%' }} />
        </div>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Space>
              <Skeleton.Avatar active size={40} />
              <div>
                <Skeleton.Input active size="small" style={{ width: 140, marginBottom: 4 }} />
                <Skeleton.Input active size="small" style={{ width: 200 }} />
              </div>
            </Space>
          </div>
        ))}
      </Card>

      {/* Message area */}
      <Card style={{ flex: 1 }} bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Space>
            <Skeleton.Avatar active size={36} />
            <Skeleton.Input active size="small" style={{ width: 160 }} />
          </Space>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, padding: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: i % 2 === 0 ? 'flex-end' : 'flex-start',
                marginBottom: 16,
              }}
            >
              <Skeleton.Button
                active
                style={{
                  width: 200 + (i * 30),
                  height: 40,
                  borderRadius: 12,
                }}
              />
            </div>
          ))}
        </div>

        {/* Input area */}
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <Skeleton.Input active style={{ width: '100%' }} />
        </div>
      </Card>
    </div>
  );
}
