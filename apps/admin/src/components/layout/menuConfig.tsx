import {
  DashboardOutlined,
  TeamOutlined,
  SolutionOutlined,
  FileTextOutlined,
  DollarOutlined,
  BarChartOutlined,
  SettingOutlined,
  MessageOutlined,
  CalendarOutlined,
  StarOutlined,
  FolderOpenOutlined,
  CloudServerOutlined,
  AuditOutlined,
  UserOutlined,
  NotificationOutlined,
  PhoneOutlined,
  ScheduleOutlined,
  FormOutlined,
} from '@ant-design/icons';
import type { MenuDataItem } from '@ant-design/pro-components';

export const menuItems: MenuDataItem[] = [
  {
    path: '/',
    name: 'Dashboard',
    icon: <DashboardOutlined />,
  },
  {
    name: 'CRM',
    icon: <TeamOutlined />,
    children: [
      { path: '/leads', name: 'Leads', icon: <SolutionOutlined /> },
      { path: '/referrals', name: 'Referrals', icon: <StarOutlined /> },
    ],
  },
  {
    name: 'Operations',
    icon: <FileTextOutlined />,
    children: [
      { path: '/orders', name: 'Orders', icon: <FileTextOutlined /> },
      { path: '/consent-forms', name: 'Consent Forms', icon: <FormOutlined /> },
      { path: '/appointments', name: 'Appointments', icon: <ScheduleOutlined /> },
      { path: '/reviews', name: 'Review Pipeline', icon: <AuditOutlined /> },
    ],
  },
  {
    name: 'Communication',
    icon: <MessageOutlined />,
    children: [
      { path: '/broadcasts', name: 'Broadcasts', icon: <NotificationOutlined /> },
      { path: '/chat', name: 'Chat', icon: <MessageOutlined /> },
      { path: '/whatsapp', name: 'WhatsApp', icon: <PhoneOutlined /> },
      { path: '/tickets', name: 'Support Tickets', icon: <SolutionOutlined /> },
    ],
  },
  {
    name: 'Finance',
    icon: <DollarOutlined />,
    children: [
      { path: '/payments', name: 'Payments', icon: <DollarOutlined /> },
      { path: '/billing-disputes', name: 'Billing Disputes', icon: <FileTextOutlined /> },
      { path: '/xero', name: 'Xero Sync', icon: <DollarOutlined /> },
    ],
  },
  {
    path: '/documents',
    name: 'Documents',
    icon: <FolderOpenOutlined />,
  },
  {
    path: '/vault',
    name: 'Client Vault',
    icon: <CloudServerOutlined />,
  },
  {
    name: 'Reports',
    icon: <BarChartOutlined />,
    children: [
      { path: '/analytics', name: 'Analytics', icon: <BarChartOutlined /> },
      { path: '/audit-logs', name: 'Audit Logs', icon: <AuditOutlined /> },
    ],
  },
  {
    name: 'System',
    icon: <SettingOutlined />,
    children: [
      { path: '/users', name: 'Users', icon: <UserOutlined /> },
      { path: '/form-mappings', name: 'Form Mappings', icon: <FormOutlined /> },
      { path: '/calendar', name: 'Tax Calendar', icon: <CalendarOutlined /> },
      { path: '/reputation', name: 'Reputation', icon: <StarOutlined /> },
      { path: '/settings', name: 'Settings', icon: <SettingOutlined /> },
    ],
  },
];
