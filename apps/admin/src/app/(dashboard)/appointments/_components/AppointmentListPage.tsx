'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Button, Input, Select, Card, Row, Col } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppointmentList } from '@/hooks/useAppointments';
import type {
  Appointment,
  AppointmentListQuery,
  AppointmentStatus,
  AppointmentType,
} from '@/types/appointment';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_TYPE_LABELS,
} from '@/types/appointment';
import { formatDate } from '@/lib/utils/format';

export function AppointmentListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<AppointmentListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useAppointmentList(filters);

  const columns: ColumnsType<Appointment> = [
    {
      title: 'Date',
      dataIndex: 'date',
      render: (val: string) => formatDate(val),
      sorter: true,
      width: 120,
    },
    {
      title: 'Time',
      key: 'time',
      width: 130,
      render: (_: unknown, record: Appointment) => `${record.startTime} - ${record.endTime}`,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 110,
      render: (val: AppointmentType) => <Tag>{APPOINTMENT_TYPE_LABELS[val]}</Tag>,
    },
    {
      title: 'Client',
      dataIndex: 'userId',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Staff',
      dataIndex: 'staffId',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: AppointmentStatus) => (
        <Tag color={APPOINTMENT_STATUS_COLORS[val]}>{APPOINTMENT_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Appointment) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/appointments/${record._id}`)}
        />
      ),
    },
  ];

  const statusOptions = APPOINTMENT_STATUSES.map((s) => ({
    value: s,
    label: APPOINTMENT_STATUS_LABELS[s],
  }));

  const typeOptions = (Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map((t) => ({
    value: t,
    label: APPOINTMENT_TYPE_LABELS[t],
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Appointments</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search appointments..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Status"
              allowClear
              style={{ width: '100%' }}
              options={statusOptions}
              onChange={(val) => setFilters((f) => ({ ...f, status: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Type"
              allowClear
              style={{ width: '100%' }}
              options={typeOptions}
              onChange={(val) => setFilters((f) => ({ ...f, type: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Appointment>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} appointments`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
