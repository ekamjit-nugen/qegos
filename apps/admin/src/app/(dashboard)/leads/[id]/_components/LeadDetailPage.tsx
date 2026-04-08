'use client';

import { useState } from 'react';
import { Row, Col, Card, Descriptions, Timeline, Tag, Button, Form, Input, Select, Spin, App, Empty } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useLead } from '@/hooks/useLeads';
import { useLeadActivities, useLogActivity } from '@/hooks/useLeadActivities';
import { useLeadReminders, useCompleteReminder } from '@/hooks/useLeadReminders';
import { LeadStatusTransition } from '../../_components/LeadStatusTransition';
import { LeadFormModal } from '../../_components/LeadFormModal';
import {
  LEAD_SOURCE_LABELS,
  LEAD_PRIORITY_COLORS,
} from '@/types/lead';
import { formatDate, formatDateTime, formatPhone, formatRelative, fullName } from '@/lib/utils/format';

export function LeadDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: lead, isLoading } = useLead(id);
  const { data: activitiesData } = useLeadActivities(id);
  const { data: reminders } = useLeadReminders(id);
  const logActivity = useLogActivity();
  const completeReminder = useCompleteReminder();
  const [showEdit, setShowEdit] = useState(false);
  const [activityForm] = Form.useForm();
  const { message } = App.useApp();

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!lead) { return <Empty description="Lead not found" />; }

  const activities = activitiesData?.data ?? [];

  const handleLogActivity = async (): Promise<void> => {
    const values = await activityForm.validateFields();
    try {
      await logActivity.mutateAsync({ leadId: id, ...values });
      message.success('Activity logged');
      activityForm.resetFields();
    } catch {
      message.error('Failed to log activity');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>
          {lead.leadNumber} - {fullName(lead.firstName, lead.lastName)}
        </h2>
        <Button icon={<EditOutlined />} onClick={() => setShowEdit(true)}>Edit</Button>
      </div>

      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={16}>
          <Card title="Lead Information" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Name">{fullName(lead.firstName, lead.lastName)}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{formatPhone(lead.mobile)}</Descriptions.Item>
              <Descriptions.Item label="Email">{lead.email ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Source">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</Descriptions.Item>
              <Descriptions.Item label="Priority">
                <Tag color={LEAD_PRIORITY_COLORS[lead.priority]}>{lead.priority?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Score">{lead.score}</Descriptions.Item>
              <Descriptions.Item label="State">{lead.state ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Financial Year">{lead.financialYear ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatDate(lead.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Last Contacted">{formatDate(lead.lastContactedAt)}</Descriptions.Item>
            </Descriptions>
            {lead.notes && (
              <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <strong>Notes:</strong> {lead.notes}
              </div>
            )}
          </Card>

          <Card title="Activity Timeline" style={{ marginBottom: 16 }}>
            <Form form={activityForm} layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item name="type" rules={[{ required: true }]} style={{ width: 120 }}>
                <Select placeholder="Type" options={[
                  { value: 'note', label: 'Note' },
                  { value: 'call', label: 'Call' },
                  { value: 'email', label: 'Email' },
                  { value: 'sms', label: 'SMS' },
                  { value: 'meeting', label: 'Meeting' },
                ]} />
              </Form.Item>
              <Form.Item name="description" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Input placeholder="Activity description..." />
              </Form.Item>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleLogActivity} loading={logActivity.isPending}>
                Log
              </Button>
            </Form>

            <Timeline
              items={activities.map((a) => ({
                key: a._id,
                color: a.isSystemGenerated ? 'gray' : 'blue',
                children: (
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      <Tag>{a.type}</Tag> {a.description}
                    </div>
                    <div style={{ color: '#999', fontSize: 12 }}>
                      {a.performedByName ?? 'System'} - {formatRelative(a.createdAt)}
                    </div>
                  </div>
                ),
              }))}
            />
            {activities.length === 0 && <Empty description="No activities yet" />}
          </Card>
        </Col>

        {/* Right column */}
        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <LeadStatusTransition leadId={id} currentStatus={lead.status} />
          </Card>

          <Card title="Reminders" style={{ marginBottom: 16 }}>
            {(reminders ?? []).map((r) => (
              <div key={r._id} style={{ marginBottom: 12, padding: 8, background: r.isOverdue ? '#fff2f0' : '#fafafa', borderRadius: 6 }}>
                <div style={{ fontWeight: 500 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  Due: {formatDateTime(r.reminderDate)}
                  {r.isOverdue && <Tag color="red" style={{ marginLeft: 8 }}>Overdue</Tag>}
                </div>
                {!r.isCompleted && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => void completeReminder.mutateAsync(r._id)}
                  >
                    Complete
                  </Button>
                )}
              </div>
            ))}
            {(!reminders || reminders.length === 0) && <Empty description="No reminders" />}
          </Card>

          {lead.assignedToName && (
            <Card title="Assignment" style={{ marginBottom: 16 }}>
              <p>Assigned to: <strong>{lead.assignedToName}</strong></p>
            </Card>
          )}
        </Col>
      </Row>

      <LeadFormModal open={showEdit} onClose={() => setShowEdit(false)} lead={lead} />
    </div>
  );
}
