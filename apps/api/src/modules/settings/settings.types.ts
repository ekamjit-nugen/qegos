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

/**
 * Build default settings from environment variables.
 * Falls back to hardcoded defaults if env vars are not set.
 * This allows deployment-time configuration without touching the DB.
 *
 * Env vars:
 *   APPOINTMENT_SLOT_DURATION_MINUTES — default: 30
 *   APPOINTMENT_BUFFER_MINUTES        — default: 5
 */
export function getDefaultSettings(): Array<{
  key: string;
  value: unknown;
  description: string;
}> {
  const slotDuration = Number(process.env.APPOINTMENT_SLOT_DURATION_MINUTES) || 30;
  const bufferMinutes = process.env.APPOINTMENT_BUFFER_MINUTES !== undefined
    ? Number(process.env.APPOINTMENT_BUFFER_MINUTES)
    : 5;

  return [
    {
      key: SETTING_KEYS.APPOINTMENT_SLOT_DURATION,
      value: slotDuration,
      description: 'Default appointment slot duration in minutes',
    },
    {
      key: SETTING_KEYS.APPOINTMENT_BUFFER_MINUTES,
      value: bufferMinutes,
      description: 'Break time between consecutive appointment slots in minutes (e.g. 5 or 10)',
    },
  ];
}

/** @deprecated Use getDefaultSettings() for env-aware defaults */
export const DEFAULT_SETTINGS = getDefaultSettings();

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface SettingsRouteDeps {
  SettingModel: import('mongoose').Model<ISettingDocument>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: (resource: string, action: string) => import('express').RequestHandler;
}
