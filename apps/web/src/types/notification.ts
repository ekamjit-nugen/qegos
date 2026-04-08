export interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  relatedResource?: string;
  relatedResourceId?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  quietHoursStart?: string;
  quietHoursEnd?: string;
  channels: Record<string, boolean>;
  notificationTypes: Record<string, boolean>;
}
