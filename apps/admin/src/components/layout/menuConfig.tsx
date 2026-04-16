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
  GiftOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

/**
 * userType levels (from CLAUDE.md):
 *   0 Super Admin
 *   1 Admin
 *   3 Staff
 *   5 Office Manager
 *   6 Senior Staff
 * Clients (2) / Students (4) never reach the admin shell.
 *
 * `allowedUserTypes` — undefined means "visible to all staff".
 */
export interface AdminMenuItem {
  path?: string;
  name: string;
  icon?: ReactNode;
  children?: AdminMenuItem[];
  allowedUserTypes?: number[];
}

const ALL_STAFF = [0, 1, 3, 5, 6];
const ADMIN_ONLY = [0, 1];
const MANAGER_PLUS = [0, 1, 5]; // Admin + Office Manager

export const menuItems: AdminMenuItem[] = [
  {
    path: '/',
    name: 'Dashboard',
    icon: <DashboardOutlined />,
    allowedUserTypes: ALL_STAFF,
  },
  {
    name: 'CRM',
    icon: <TeamOutlined />,
    allowedUserTypes: ALL_STAFF,
    children: [
      { path: '/leads', name: 'Leads', icon: <SolutionOutlined />, allowedUserTypes: ALL_STAFF },
      {
        path: '/referrals',
        name: 'Referrals',
        icon: <StarOutlined />,
        allowedUserTypes: ALL_STAFF,
      },
    ],
  },
  {
    name: 'Operations',
    icon: <FileTextOutlined />,
    allowedUserTypes: ALL_STAFF,
    children: [
      { path: '/orders', name: 'Orders', icon: <FileTextOutlined />, allowedUserTypes: ALL_STAFF },
      {
        path: '/consent-forms',
        name: 'Consent Forms',
        icon: <FormOutlined />,
        allowedUserTypes: ALL_STAFF,
      },
      {
        path: '/appointments',
        name: 'Appointments',
        icon: <ScheduleOutlined />,
        allowedUserTypes: ALL_STAFF,
      },
      {
        path: '/reviews',
        name: 'Review Pipeline',
        icon: <AuditOutlined />,
        allowedUserTypes: [0, 1, 5, 6],
      },
    ],
  },
  {
    name: 'Communication',
    icon: <MessageOutlined />,
    allowedUserTypes: ALL_STAFF,
    children: [
      {
        path: '/broadcasts',
        name: 'Broadcasts',
        icon: <NotificationOutlined />,
        allowedUserTypes: MANAGER_PLUS,
      },
      { path: '/chat', name: 'Chat', icon: <MessageOutlined />, allowedUserTypes: ALL_STAFF },
      {
        path: '/whatsapp',
        name: 'WhatsApp',
        icon: <PhoneOutlined />,
        allowedUserTypes: MANAGER_PLUS,
      },
      {
        path: '/tickets',
        name: 'Support Tickets',
        icon: <SolutionOutlined />,
        allowedUserTypes: ALL_STAFF,
      },
    ],
  },
  {
    name: 'Finance',
    icon: <DollarOutlined />,
    allowedUserTypes: MANAGER_PLUS,
    children: [
      {
        path: '/payments',
        name: 'Payments',
        icon: <DollarOutlined />,
        allowedUserTypes: MANAGER_PLUS,
      },
      {
        path: '/billing-disputes',
        name: 'Billing Disputes',
        icon: <FileTextOutlined />,
        allowedUserTypes: MANAGER_PLUS,
      },
      {
        path: '/promo-codes',
        name: 'Promo Codes',
        icon: <GiftOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
      { path: '/xero', name: 'Xero Sync', icon: <DollarOutlined />, allowedUserTypes: ADMIN_ONLY },
    ],
  },
  {
    path: '/documents',
    name: 'Documents',
    icon: <FolderOpenOutlined />,
    allowedUserTypes: ALL_STAFF,
  },
  {
    path: '/vault',
    name: 'Client Vault',
    icon: <CloudServerOutlined />,
    allowedUserTypes: ALL_STAFF,
  },
  {
    name: 'Reports',
    icon: <BarChartOutlined />,
    allowedUserTypes: MANAGER_PLUS,
    children: [
      {
        path: '/analytics',
        name: 'Analytics',
        icon: <BarChartOutlined />,
        allowedUserTypes: MANAGER_PLUS,
      },
      {
        path: '/audit-logs',
        name: 'Audit Logs',
        icon: <AuditOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
    ],
  },
  {
    name: 'System',
    icon: <SettingOutlined />,
    allowedUserTypes: ADMIN_ONLY,
    children: [
      { path: '/users', name: 'Users', icon: <UserOutlined />, allowedUserTypes: ADMIN_ONLY },
      {
        path: '/form-mappings',
        name: 'Form Mappings',
        icon: <FormOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
      {
        path: '/calendar',
        name: 'Tax Calendar',
        icon: <CalendarOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
      {
        path: '/reputation',
        name: 'Reputation',
        icon: <StarOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
      {
        path: '/settings',
        name: 'Settings',
        icon: <SettingOutlined />,
        allowedUserTypes: ADMIN_ONLY,
      },
    ],
  },
];

/**
 * Filter the menu tree based on the current user's userType.
 * Drops items whose `allowedUserTypes` doesn't include the current type, and
 * collapses parent groups whose children all got filtered out.
 */
export function filterMenuByUserType(
  items: AdminMenuItem[],
  userType: number | undefined,
): AdminMenuItem[] {
  if (userType === undefined) return [];
  const result: AdminMenuItem[] = [];
  for (const item of items) {
    if (item.allowedUserTypes && !item.allowedUserTypes.includes(userType)) continue;
    if (item.children && item.children.length > 0) {
      const filteredChildren = filterMenuByUserType(item.children, userType);
      if (filteredChildren.length === 0) continue;
      result.push({ ...item, children: filteredChildren });
    } else {
      result.push(item);
    }
  }
  return result;
}
