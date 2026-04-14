import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { ISettingDocument } from './settings.types';

export interface SettingsServiceDeps {
  SettingModel: Model<ISettingDocument>;
}

export interface SettingsServiceResult {
  getSetting: (key: string) => Promise<unknown>;
  getSettingDoc: (key: string) => Promise<ISettingDocument | null>;
  setSetting: (key: string, value: unknown, updatedBy: string) => Promise<ISettingDocument>;
  getAllSettings: () => Promise<ISettingDocument[]>;
}

export function createSettingsService(deps: SettingsServiceDeps): SettingsServiceResult {
  const { SettingModel } = deps;

  async function getSetting(key: string): Promise<unknown> {
    const doc = await SettingModel.findOne({ key }).lean();
    if (!doc) return undefined;
    return doc.value;
  }

  async function getSettingDoc(key: string): Promise<ISettingDocument | null> {
    return SettingModel.findOne({ key }).lean<ISettingDocument>();
  }

  async function setSetting(
    key: string,
    value: unknown,
    updatedBy: string,
  ): Promise<ISettingDocument> {
    const doc = await SettingModel.findOneAndUpdate(
      { key },
      { $set: { value, updatedBy } },
      { new: true },
    );
    if (!doc) {
      throw AppError.notFound(`Setting "${key}" not found`);
    }
    return doc;
  }

  async function getAllSettings(): Promise<ISettingDocument[]> {
    return SettingModel.find().sort({ key: 1 }).lean<ISettingDocument[]>();
  }

  return { getSetting, getSettingDoc, setSetting, getAllSettings };
}
