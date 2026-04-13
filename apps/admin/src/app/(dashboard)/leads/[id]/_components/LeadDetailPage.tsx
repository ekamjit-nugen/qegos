'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Row, Col, Card, Descriptions, Timeline, Tag, Button, Form, Input, InputNumber,
  Select, Radio, Spin, Empty, Modal, App, Space, Divider, DatePicker, TimePicker,
  Popconfirm, Alert, Tabs,
} from 'antd';
import {
  EditOutlined, PlusOutlined, DeleteOutlined, UserSwitchOutlined,
  SwapOutlined, CheckCircleOutlined, PhoneOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useLead, useDeleteLead, useConvertLead, useAssignLead } from '@/hooks/useLeads';
import { useLeadActivities, useLogActivity } from '@/hooks/useLeadActivities';
import { useLeadReminders, useCompleteReminder, useCreateReminder } from '@/hooks/useLeadReminders';
import { useStaffList } from '@/hooks/useUsers';
import { useAuth } from '@/lib/auth/useAuth';
import { LeadStatusTransition } from '../../_components/LeadStatusTransition';
import { LeadFormModal } from '../../_components/LeadFormModal';
import {
  LEAD_SOURCE_LABELS,
  LEAD_PRIORITY_COLORS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  ACTIVITY_TYPE_GROUPS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_OUTCOME_LABELS,
  ACTIVITY_OUTCOMES,
  SENTIMENTS,
  SENTIMENT_LABELS,
  CALL_DIRECTIONS,
  MARITAL_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  PREFERRED_LANGUAGE_LABELS,
  PREFERRED_CONTACT_LABELS,
  LeadStatus,
} from '@/types/lead';
import { formatDate, formatDateTime, formatPhone, formatRelative, fullName, formatCurrency } from '@/lib/utils/format';
import type dayjs from 'dayjs';

export function LeadDetailPage({ id }: { id: string }): React.ReactNode {
  const router = useRouter();
  const { data: lead, isLoading } = useLead(id);
  const { data: activitiesData } = useLeadActivities(id);
  const { data: reminders } = useLeadReminders(id);
  const { data: staffList } = useStaffList();
  const { user: authUser } = useAuth();
  const logActivity = useLogActivity();
  const completeReminder = useCompleteReminder();
  const createReminder = useCreateReminder();
  const deleteLead = useDeleteLead();
  const convertLead = useConvertLead();
  const assignLead = useAssignLead();
  const [showEdit, setShowEdit] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [activityForm] = Form.useForm();
  const [reminderForm] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [selectedActivityType, setSelectedActivityType] = useState<string>('');
  const { message } = App.useApp();

  // Role-based gating: userType 0-3 = admin-level, 4 = staff
  const isAdminLevel = authUser?.userType !== undefined && authUser.userType <= 3;
  const isCallType = ['phone_call_outbound', 'phone_call_inbound', 'phone_call_missed'].includes(selectedActivityType);

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!lead) { return <Empty description="Lead not found" />; }

  const activities = activitiesData?.data ?? [];
  const canConvert = !lead.isConverted && [LeadStatus.QuoteSent, LeadStatus.Negotiation].includes(lead.status);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleLogActivity = async (): Promise<void> => {
    const values = await activityForm.validateFields();
    try {
      await logActivity.mutateAsync({
        leadId: id,
        type: values.type,
        description: values.description,
        outcome: values.outcome,
        sentiment: values.sentiment,
        callDuration: values.callDuration,
        callDirection: values.callDirection,
      });
      message.success('Activity logged');
      activityForm.resetFields();
      setShowActivityModal(false);
      setSelectedActivityType('');
    } catch {
      message.error('Failed to log activity');
    }
  };

  const handleCreateReminder = async (): Promise<void> => {
    const values = await reminderForm.validateFields();
    try {
      await createReminder.mutateAsync({
        leadId: id,
        title: values.title,
        description: values.description,
        reminderDate: (values.reminderDate as dayjs.Dayjs).format('YYYY-MM-DD'),
        reminderTime: (values.reminderTime as dayjs.Dayjs).format('HH:mm'),
        assignedTo: values.assignedTo,
      });
      message.success('Reminder created');
      reminderForm.resetFields();
      setShowReminderModal(false);
    } catch {
      message.error('Failed to create reminder');
    }
  };

  const handleConvert = async (): Promise<void> => {
    try {
      const result = await convertLead.mutateAsync(id);
      message.success('Lead converted to client successfully');
      setShowConvertModal(false);
      if (result.orderId) {
        message.info(`Order created: ${result.orderId}`);
      }
    } catch {
      message.error('Failed to convert lead');
    }
  };

  const handleAssign = async (): Promise<void> => {
    const values = await assignForm.validateFields();
    try {
      await assignLead.mutateAsync({ id, assignedTo: values.assignedTo });
      message.success('Lead assigned');
      assignForm.resetFields();
      setShowAssignModal(false);
    } catch {
      message.error('Failed to assign lead');
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await deleteLead.mutateAsync(id);
      message.success('Lead deleted');
      router.push('/leads');
    } catch {
      message.error('Failed to delete lead');
    }
  };

  const pendingReminders = (reminders ?? []).filter((r) => !r.isCompleted);
  const completedReminders = (reminders ?? []).filter((r) => r.isCompleted);

  const staffOptions = (staffList ?? []).map((s) => ({
    value: s._id,
    label: fullName(s.firstName, s.lastName),
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {lead.leadNumber} — {fullName(lead.firstName, lead.lastName)}
          </h2>
          <Space style={{ marginTop: 4 }}>
            <Tag color={LEAD_STATUS_COLORS[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Tag>
            <Tag color={LEAD_PRIORITY_COLORS[lead.priority]}>{lead.priority?.toUpperCase()}</Tag>
            {lead.isConverted && <Tag color="green" icon={<CheckCircleOutlined />}>Converted</Tag>}
          </Space>
        </div>
        <Space>
          {canConvert && (
            <Button type="primary" icon={<SwapOutlined />} onClick={() => setShowConvertModal(true)}>
              Convert to Client
            </Button>
          )}
          <Button icon={<EditOutlined />} onClick={() => setShowEdit(true)}>Edit</Button>
          {isAdminLevel && (
            <Popconfirm
              title="Delete this lead?"
              description="This action cannot be undone."
              onConfirm={() => { void handleDelete(); }}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* Conversion info banner */}
      {lead.isConverted && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="This lead has been converted"
          description={
            <Space>
              {lead.convertedOrderId && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => router.push(`/orders/${lead.convertedOrderId}`)}>
                  View Order
                </Button>
              )}
              {lead.convertedUserId && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => router.push(`/users/${lead.convertedUserId}`)}>
                  View Client
                </Button>
              )}
            </Space>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={16}>
          <Card title="Lead Information" style={{ marginBottom: 16 }}>
            <Tabs
              items={[
                {
                  key: 'contact',
                  label: 'Contact',
                  children: (
                    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                      <Descriptions.Item label="Name">{fullName(lead.firstName, lead.lastName)}</Descriptions.Item>
                      <Descriptions.Item label="Mobile">{formatPhone(lead.mobile)}</Descriptions.Item>
                      <Descriptions.Item label="Email">{lead.email ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Source">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</Descriptions.Item>
                      <Descriptions.Item label="Preferred Language">{PREFERRED_LANGUAGE_LABELS[lead.preferredLanguage ?? ''] ?? lead.preferredLanguage ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Preferred Contact">{PREFERRED_CONTACT_LABELS[lead.preferredContact ?? ''] ?? lead.preferredContact ?? '—'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'location',
                  label: 'Location',
                  children: (
                    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                      <Descriptions.Item label="Suburb">{lead.suburb ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="State">{lead.state ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Postcode">{lead.postcode ?? '—'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'financial',
                  label: 'Financial',
                  children: (
                    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                      <Descriptions.Item label="Financial Year">{lead.financialYear ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Estimated Value">{lead.estimatedValue != null ? formatCurrency(lead.estimatedValue) : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Priority"><Tag color={LEAD_PRIORITY_COLORS[lead.priority]}>{lead.priority?.toUpperCase()}</Tag></Descriptions.Item>
                      <Descriptions.Item label="Score">{lead.score}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'demographics',
                  label: 'Demographics',
                  children: (
                    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                      <Descriptions.Item label="Marital Status">{MARITAL_STATUS_LABELS[lead.maritalStatus ?? ''] ?? lead.maritalStatus ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Employment">{EMPLOYMENT_TYPE_LABELS[lead.employmentType ?? ''] ?? lead.employmentType ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Has Spouse">{lead.hasSpouse != null ? (lead.hasSpouse ? 'Yes' : 'No') : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Dependants">{lead.numberOfDependants ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Rental Property">{lead.hasRentalProperty != null ? (lead.hasRentalProperty ? 'Yes' : 'No') : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Share Portfolio">{lead.hasSharePortfolio != null ? (lead.hasSharePortfolio ? 'Yes' : 'No') : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Foreign Income">{lead.hasForeignIncome != null ? (lead.hasForeignIncome ? 'Yes' : 'No') : '—'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'tracking',
                  label: 'Tracking',
                  children: (
                    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                      <Descriptions.Item label="Created">{formatDate(lead.createdAt)}</Descriptions.Item>
                      <Descriptions.Item label="Last Contacted">{lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Follow-up Count">{lead.followUpCount ?? 0}</Descriptions.Item>
                      <Descriptions.Item label="Next Action">{lead.nextAction ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Next Action Date">{lead.nextActionDate ? formatDate(lead.nextActionDate) : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Tags">
                        {lead.tags && lead.tags.length > 0
                          ? lead.tags.map((t) => <Tag key={t}>{t}</Tag>)
                          : '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
              ]}
            />
            {lead.notes && (
              <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <strong>Notes:</strong> {lead.notes}
              </div>
            )}
          </Card>

          {/* Activity Timeline */}
          <Card
            title="Activity Timeline"
            style={{ marginBottom: 16 }}
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowActivityModal(true)}>
                Log Activity
              </Button>
            }
          >
            <Timeline
              items={activities.map((a) => ({
                key: a._id,
                color: a.isSystemGenerated ? 'gray' : 'blue',
                children: (
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      <Tag color={a.isSystemGenerated ? 'default' : 'blue'}>
                        {ACTIVITY_TYPE_LABELS[a.type] ?? a.type}
                      </Tag>
                      {a.description}
                    </div>
                    {a.outcome && (
                      <Tag color="purple" style={{ marginTop: 4 }}>
                        {ACTIVITY_OUTCOME_LABELS[a.outcome] ?? a.outcome}
                      </Tag>
                    )}
                    {a.sentiment && (
                      <Tag
                        color={a.sentiment === 'positive' ? 'green' : a.sentiment === 'negative' ? 'red' : 'default'}
                        style={{ marginTop: 4 }}
                      >
                        {SENTIMENT_LABELS[a.sentiment] ?? a.sentiment}
                      </Tag>
                    )}
                    {a.callDuration != null && a.callDuration > 0 && (
                      <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                        <PhoneOutlined /> {Math.floor(a.callDuration / 60)}m {a.callDuration % 60}s
                      </span>
                    )}
                    <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>
                      {a.performedByName ?? 'System'} — {formatRelative(a.createdAt)}
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
          {/* Status */}
          <Card title="Status" style={{ marginBottom: 16 }}>
            <LeadStatusTransition
              leadId={id}
              currentStatus={lead.status}
              onConvert={() => setShowConvertModal(true)}
            />
          </Card>

          {/* Assignment */}
          <Card
            title="Assignment"
            style={{ marginBottom: 16 }}
            extra={isAdminLevel && (
              <Button size="small" icon={<UserSwitchOutlined />} onClick={() => setShowAssignModal(true)}>
                {lead.assignedTo ? 'Reassign' : 'Assign'}
              </Button>
            )}
          >
            {lead.assignedToName ? (
              <p>Assigned to: <strong>{lead.assignedToName}</strong></p>
            ) : (
              <Empty description="Unassigned" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          {/* Reminders */}
          <Card
            title="Reminders"
            style={{ marginBottom: 16 }}
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => setShowReminderModal(true)}>
                Add
              </Button>
            }
          >
            {pendingReminders.length > 0 && (
              <>
                <Divider orientation="left" style={{ fontSize: 12, margin: '4px 0 8px' }}>Pending</Divider>
                {pendingReminders.map((r) => (
                  <div key={r._id} style={{ marginBottom: 12, padding: 8, background: r.isOverdue ? '#fff2f0' : '#fafafa', borderRadius: 6 }}>
                    <div style={{ fontWeight: 500 }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12, color: '#666' }}>{r.description}</div>}
                    <div style={{ fontSize: 12, color: '#999' }}>
                      Due: {formatDateTime(r.reminderDate)}
                      {r.isOverdue && <Tag color="red" style={{ marginLeft: 8 }}>Overdue</Tag>}
                    </div>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => { void completeReminder.mutateAsync(r._id); }}
                    >
                      Complete
                    </Button>
                  </div>
                ))}
              </>
            )}
            {completedReminders.length > 0 && (
              <>
                <Divider orientation="left" style={{ fontSize: 12, margin: '4px 0 8px' }}>Completed</Divider>
                {completedReminders.map((r) => (
                  <div key={r._id} style={{ marginBottom: 8, padding: 8, background: '#f6ffed', borderRadius: 6, opacity: 0.7 }}>
                    <div style={{ fontWeight: 500, textDecoration: 'line-through' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{formatDateTime(r.reminderDate)}</div>
                  </div>
                ))}
              </>
            )}
            {(!reminders || reminders.length === 0) && <Empty description="No reminders" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>

          {/* Lost Reason (if applicable) */}
          {lead.status === LeadStatus.Lost && lead.lostReason && (
            <Card title="Lost Reason" style={{ marginBottom: 16 }}>
              <Tag color="red">{lead.lostReason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Tag>
              {lead.lostReasonNote && <p style={{ marginTop: 8, color: '#666' }}>{lead.lostReasonNote}</p>}
            </Card>
          )}
        </Col>
      </Row>

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}

      {/* Activity Modal */}
      <Modal
        title="Log Activity"
        open={showActivityModal}
        onCancel={() => { setShowActivityModal(false); activityForm.resetFields(); setSelectedActivityType(''); }}
        onOk={() => { void handleLogActivity(); }}
        confirmLoading={logActivity.isPending}
        width={560}
        destroyOnClose
      >
        <Form form={activityForm} layout="vertical">
          <Form.Item name="type" label="Activity Type" rules={[{ required: true, message: 'Select type' }]}>
            <Select
              placeholder="Select activity type"
              options={ACTIVITY_TYPE_GROUPS}
              onChange={(val: string) => setSelectedActivityType(val)}
            />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Enter description' }]}>
            <Input.TextArea rows={3} placeholder="Describe the activity..." />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="outcome" label="Outcome">
                <Select
                  placeholder="Select outcome"
                  allowClear
                  options={ACTIVITY_OUTCOMES.map((o) => ({ value: o, label: ACTIVITY_OUTCOME_LABELS[o] }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sentiment" label="Sentiment">
                <Radio.Group>
                  {SENTIMENTS.map((s) => (
                    <Radio.Button key={s} value={s}>{SENTIMENT_LABELS[s]}</Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          {isCallType && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="callDuration" label="Call Duration (seconds)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="Duration in seconds" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="callDirection" label="Direction">
                  <Radio.Group>
                    {CALL_DIRECTIONS.map((d) => (
                      <Radio.Button key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</Radio.Button>
                    ))}
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>
          )}
        </Form>
      </Modal>

      {/* Reminder Modal */}
      <Modal
        title="Add Reminder"
        open={showReminderModal}
        onCancel={() => { setShowReminderModal(false); reminderForm.resetFields(); }}
        onOk={() => { void handleCreateReminder(); }}
        confirmLoading={createReminder.isPending}
        destroyOnClose
      >
        <Form form={reminderForm} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Enter title' }]}>
            <Input placeholder="Reminder title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="reminderDate" label="Date" rules={[{ required: true, message: 'Select date' }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="reminderTime" label="Time" rules={[{ required: true, message: 'Select time' }]}>
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={15} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="assignedTo"
            label="Assign To"
            rules={[{ required: true, message: 'Select staff' }]}
            initialValue={lead.assignedTo}
          >
            <Select placeholder="Select staff member" options={staffOptions} showSearch optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Convert Modal */}
      <Modal
        title="Convert Lead to Client"
        open={showConvertModal}
        onCancel={() => setShowConvertModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowConvertModal(false)}>Cancel</Button>,
          <Button
            key="convert"
            type="primary"
            loading={convertLead.isPending}
            onClick={() => { void handleConvert(); }}
          >
            Create New Client & Order
          </Button>,
        ]}
        destroyOnClose
      >
        <p>This will:</p>
        <ul>
          <li>Create a new client account using the lead&apos;s contact details</li>
          <li>Create a new order linked to this lead</li>
          <li>Mark the lead as <Tag color="green">Won</Tag></li>
        </ul>
        <Alert
          type="info"
          showIcon
          message="This action cannot be undone. The lead status will be set to Won."
        />
      </Modal>

      {/* Assign Modal */}
      <Modal
        title={lead.assignedTo ? 'Reassign Lead' : 'Assign Lead'}
        open={showAssignModal}
        onCancel={() => { setShowAssignModal(false); assignForm.resetFields(); }}
        onOk={() => { void handleAssign(); }}
        confirmLoading={assignLead.isPending}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item
            name="assignedTo"
            label="Assign To"
            rules={[{ required: true, message: 'Select staff member' }]}
            initialValue={lead.assignedTo}
          >
            <Select placeholder="Select staff member" options={staffOptions} showSearch optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <LeadFormModal open={showEdit} onClose={() => setShowEdit(false)} lead={lead} />
    </div>
  );
}
