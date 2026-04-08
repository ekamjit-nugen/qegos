'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Button, Input, Select, Card, Row, Col, App, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { UserFormModal } from './UserFormModal';
import { useUserList, useToggleUserStatus } from '@/hooks/useUsers';
import type { User, UserListQuery } from '@/types/user';
import { USER_TYPE_LABELS } from '@/types/user';
import { formatDate, formatPhone, fullName } from '@/lib/utils/format';

export function UserListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<UserListQuery>({ page: 1, limit: 20 });
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading } = useUserList(filters);
  const toggleStatus = useToggleUserStatus();
  const { message } = App.useApp();

  const handleToggleStatus = async (user: User): Promise<void> => {
    try {
      await toggleStatus.mutateAsync({ id: user._id, status: !user.status });
      message.success(`User ${user.status ? 'deactivated' : 'activated'}`);
    } catch {
      message.error('Failed to update user status');
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, record: User) => (
        <a onClick={() => router.push(`/users/${record._id}`)}>
          {fullName(record.firstName, record.lastName)}
        </a>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      render: (val: string) => formatPhone(val),
      width: 140,
    },
    {
      title: 'Type',
      dataIndex: 'userType',
      render: (val: number) => <Tag>{USER_TYPE_LABELS[val] ?? 'Unknown'}</Tag>,
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'red'}>{val ? 'Active' : 'Inactive'}</Tag>
      ),
      width: 90,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (val: string) => formatDate(val),
      sorter: true,
      width: 110,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: User) => (
        <>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/users/${record._id}`)}
          />
          <Popconfirm
            title={`${record.status ? 'Deactivate' : 'Activate'} this user?`}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Button type="link" size="small">
              {record.status ? 'Deactivate' : 'Activate'}
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ];

  const typeOptions = Object.entries(USER_TYPE_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New User
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search users..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="User Type"
              allowClear
              style={{ width: '100%' }}
              options={typeOptions}
              onChange={(val) => setFilters((f) => ({ ...f, userType: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Status"
              allowClear
              style={{ width: '100%' }}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
              onChange={(val) =>
                setFilters((f) => ({
                  ...f,
                  status: val === undefined ? undefined : val === 'true',
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Table<User>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} users`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />

      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
