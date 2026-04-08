'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, List, Spin, Empty, Button, App } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTicket, useUpdateTicketStatus, useEscalateTicket } from '@/hooks/useTickets';
import type { TicketMessage } from '@/types/ticket';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';
import { formatDateTime } from '@/lib/utils/format';

export function TicketDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: ticket, isLoading } = useTicket(id);
  const updateStatus = useUpdateTicketStatus();
  const escalateTicket = useEscalateTicket();
  const { message } = App.useApp();

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!ticket) { return <Empty description="Ticket not found" />; }

  const handleStatusChange = (status: string): void => {
    updateStatus.mutate(
      { id: ticket._id, status },
      {
        onSuccess: () => {
          void message.success(`Ticket marked as ${status}`);
        },
        onError: () => {
          void message.error('Failed to update ticket status');
        },
      },
    );
  };

  const handleEscalate = (): void => {
    escalateTicket.mutate(ticket._id, {
      onSuccess: () => {
        void message.success('Ticket escalated');
      },
      onError: () => {
        void message.error('Failed to escalate ticket');
      },
    });
  };

  const ticketMessages: TicketMessage[] = ticket.messages ?? [];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {ticket.ticketNumber} - {ticket.subject}{' '}
          <Tag color={TICKET_PRIORITY_COLORS[ticket.priority]}>
            {TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
          </Tag>
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Ticket Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Ticket Number">{ticket.ticketNumber}</Descriptions.Item>
              <Descriptions.Item label="Subject">{ticket.subject}</Descriptions.Item>
              <Descriptions.Item label="Category">
                {TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category}
              </Descriptions.Item>
              <Descriptions.Item label="Source">
                {ticket.source ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>
                {ticket.description ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {ticketMessages.length > 0 && (
            <Card title="Messages">
              <List
                dataSource={ticketMessages}
                renderItem={(msg: TicketMessage, index: number) => (
                  <List.Item
                    key={index}
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
                          <Tag color={msg.senderType === 'client' ? 'blue' : msg.senderType === 'staff' ? 'green' : 'default'}>
                            {msg.senderType}
                          </Tag>
                          {msg.isInternal && <Tag color="orange">Internal</Tag>}
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
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status & Actions" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Tag color={TICKET_STATUS_COLORS[ticket.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
                {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
              </Tag>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleStatusChange('resolved')}
                    loading={updateStatus.isPending}
                  >
                    Mark Resolved
                  </Button>
                  <Button
                    danger
                    icon={<ExclamationCircleOutlined />}
                    onClick={handleEscalate}
                    loading={escalateTicket.isPending}
                  >
                    Escalate
                  </Button>
                </>
              )}
              {ticket.status === 'resolved' && (
                <Button
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleStatusChange('closed')}
                  loading={updateStatus.isPending}
                >
                  Close
                </Button>
              )}
            </div>
          </Card>

          <Card title="Assignment" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Assigned To">{ticket.assignedTo ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Escalated To">{ticket.escalatedTo ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="SLA" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="SLA Deadline">
                {formatDateTime(ticket.slaDeadline)}
              </Descriptions.Item>
              <Descriptions.Item label="SLA Breached">
                <Tag color={ticket.slaBreached ? 'red' : 'green'}>
                  {ticket.slaBreached ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(ticket.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(ticket.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="Resolved">{formatDateTime(ticket.resolvedAt)}</Descriptions.Item>
              <Descriptions.Item label="Closed">{formatDateTime(ticket.closedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
