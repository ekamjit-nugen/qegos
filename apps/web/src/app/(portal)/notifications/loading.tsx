import { Skeleton, Card } from 'antd';

/**
 * Notifications page loading skeleton.
 */
export default function NotificationsLoading(): React.ReactNode {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 180 }} />
        <Skeleton.Button active size="small" style={{ width: 100 }} />
      </div>

      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Card
          key={i}
          style={{ marginBottom: 8 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Skeleton.Avatar active size={36} />
            <div style={{ flex: 1 }}>
              <Skeleton.Input active size="small" style={{ width: '70%', marginBottom: 4 }} />
              <Skeleton.Input active size="small" style={{ width: '90%', marginBottom: 4 }} />
              <Skeleton.Input active size="small" style={{ width: '25%' }} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
