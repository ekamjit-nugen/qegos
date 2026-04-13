import type { Document, Types } from 'mongoose';

// ─── Setting Interface ─────────────────────────────────────────────────────

export interface ISetting {
  key: string;
  value: unknown;
  description: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISettingDocument extends ISetting, Document {
  _id: Types.ObjectId;
}

// ─── Known Setting Keys ────────────────────────────────────────────────────

export const SETTING_KEYS = {
  APPOINTMENT_SLOT_DURATION: 'appointment.slotDurationMinutes',
  APPOINTMENT_BUFFER_MINUTES: 'appointment.bufferMinutes',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// ─── Default Values ────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Array<{
  key: string;
  value: unknown;
  description: string;
}> = [
  {
    key: SETTING_KEYS.APPOINTMENT_SLOT_DURATION,
    value: 30,
    description: 'Default appointment slot duration in minutes',
  },
  {
    key: SETTING_KEYS.APPOINTMENT_BUFFER_MINUTES,
    value: 0,
    description: 'Buffer time between appointment slots in minutes',
  },
];

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface SettingsRouteDeps {
  SettingModel: import('mongoose').Model<ISettingDocument>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: (resource: string, action: string) => import('express').RequestHandler;
}
