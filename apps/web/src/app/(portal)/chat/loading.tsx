'use client';

import { Skeleton, Card, Space } from 'antd';

/**
 * Chat page loading skeleton for the client portal.
 */
export default function ChatLoading(): React.ReactNode {
  return (
    <div>
      <Skeleton.Input active size="large" style={{ width: 120, marginBottom: 24 }} />

      <Card
        bodyStyle={{
          padding: 0,
          height: 'calc(100vh - 280px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Chat header */}
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Space>
            <Skeleton.Avatar active size={36} />
            <Skeleton.Input active size="small" style={{ width: 180 }} />
          </Space>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, padding: 16 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: i % 3 === 0 ? 'flex-end' : 'flex-start',
                marginBottom: 16,
              }}
            >
              {i % 3 !== 0 && (
                <Skeleton.Avatar active size={32} style={{ marginRight: 8, flexShrink: 0 }} />
              )}
              <Skeleton.Button
                active
                style={{
                  width: 160 + (i * 25),
                  height: 36,
                  borderRadius: 12,
                }}
              />
            </div>
          ))}
        </div>

        {/* Input area */}
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <Space style={{ width: '100%' }}>
            <Skeleton.Input active style={{ width: 'calc(100vw - 200px)' }} />
            <Skeleton.Button active style={{ width: 60 }} />
          </Space>
        </div>
      </Card>
    </div>
  );
}
