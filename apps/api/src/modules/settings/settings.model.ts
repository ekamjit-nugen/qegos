import { Schema, type Model, type Connection } from 'mongoose';
import type { ISettingDocument } from './settings.types';
import { DEFAULT_SETTINGS } from './settings.types';

const settingSchema = new Schema<ISettingDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

/**
 * Factory function to create the Setting model.
 */
export function createSettingModel(connection: Connection): Model<ISettingDocument> {
  return connection.model<ISettingDocument>('Setting', settingSchema);
}

/**
 * Seed default settings if they don't exist.
 * Called once on server startup.
 */
export async function seedDefaultSettings(
  SettingModel: Model<ISettingDocument>,
): Promise<void> {
  for (const def of DEFAULT_SETTINGS) {
    await SettingModel.findOneAndUpdate(
      { key: def.key },
      { $setOnInsert: { key: def.key, value: def.value, description: def.description } },
      { upsert: true },
    );
  }
}
