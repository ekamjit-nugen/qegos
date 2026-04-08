export interface Appointment {
  _id: string;
  orderId?: string;
  orderNumber?: string;
  userId: string;
  staffId: string;
  staffName: string;
  type: 'phone' | 'video' | 'in_person';
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  notes?: string;
  createdAt: string;
}
