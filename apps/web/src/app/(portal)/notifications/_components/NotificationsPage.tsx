'use client';

import { useCallback, useState } from 'react';
import {
  Button,
  Collapse,
  Empty,
  List,
  Pagination,
  Spin,
  Switch,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  FileTextOutlined,
  MessageOutlined,
  ShoppingCartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/usePortal';
import type { Notification } from '@/types/notification';
import { formatRelative } from '@/lib/utils/format';

const { Title, Text, Paragraph } = Typography;

const TYPE_ICONS: Record<string, ReactNode> = {
  order: <ShoppingCartOutlined />,
  document: <FileTextOutlined />,
  chat: <MessageOutlined />,
  default: <BellOutlined />,
};

function getTypeIcon(type: string): ReactNode {
  return TYPE_ICONS[type] ?? TYPE_ICONS.default;
}

export function NotificationsPage(): React.ReactNode {
  const [page, setPage] = useState(1);
  const { data: notifResponse, isLoading } = useNotifications(page);
  const markReadMutation = useMarkNotificationRead();
  const markAllMutation = useMarkAllRead();
  const { data: preferences } = useNotificationPreferences();
  const updatePrefsMutation = useUpdateNotificationPreferences();

  const notifications = notifResponse?.data ?? [];
  const meta = notifResponse?.meta;

  const handleMarkRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  const handleMarkAllRead = useCallback(() => {
    markAllMutation.mutate();
  }, [markAllMutation]);

  const handleToggleChannel = useCallback(
    (channel: string, enabled: boolean) => {
      if (!preferences) { return; }
      updatePrefsMutation.mutate({
        channels: { ...preferences.channels, [channel]: enabled },
      });
    },
    [preferences, updatePrefsMutation],
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Notifications
        </Title>
        <Button
          icon={<CheckOutlined />}
          onClick={handleMarkAllRead}
          loading={markAllMutation.isPending}
        >
          Mark All Read
        </Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : notifications.length === 0 ? (
        <Empty description="No notifications" />
      ) : (
        <>
          <List
            dataSource={notifications}
            renderItem={(notif: Notification) => (
              <List.Item
                key={notif._id}
                onClick={() => {
                  if (!notif.isRead) {
                    handleMarkRead(notif._id);
                  }
                }}
                style={{
                  cursor: notif.isRead ? 'default' : 'pointer',
                  background: notif.isRead ? undefined : '#fafafa',
                  padding: '12px 16px',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 20, color: '#1677ff' }}>
                      {getTypeIcon(notif.type)}
                    </span>
                  }
                  title={
                    <Text strong={!notif.isRead}>{notif.title}</Text>
                  }
                  description={
                    <>
                      <Paragraph
                        type="secondary"
                        style={{ margin: 0, fontSize: 13 }}
                        ellipsis={{ rows: 2 }}
                      >
                        {notif.body}
                      </Paragraph>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatRelative(notif.createdAt)}
                      </Text>
                    </>
                  }
                />
              </List.Item>
            )}
          />

          {meta && meta.totalPages > 1 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Pagination
                current={page}
                total={meta.total}
                pageSize={meta.limit}
                onChange={setPage}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}

      <Collapse
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'settings',
            label: (
              <span>
                <SettingOutlined style={{ marginRight: 8 }} />
                Notification Settings
              </span>
            ),
            children: preferences ? (
              <div>
                <Title level={5} style={{ marginBottom: 12 }}>
                  Quiet Hours
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {preferences.quietHoursStart && preferences.quietHoursEnd
                    ? `${preferences.quietHoursStart} - ${preferences.quietHoursEnd}`
                    : 'Not configured'}
                </Text>

                <Title level={5} style={{ marginTop: 16, marginBottom: 12 }}>
                  Channel Preferences
                </Title>
                {Object.entries(preferences.channels ?? {}).map(([channel, enabled]) => (
                  <div
                    key={channel}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ textTransform: 'capitalize' }}>{channel}</Text>
                    <Switch
                      checked={enabled}
                      onChange={(checked) => { handleToggleChannel(channel, checked); }}
                      loading={updatePrefsMutation.isPending}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Spin />
            ),
          },
        ]}
      />
    </div>
  );
}
