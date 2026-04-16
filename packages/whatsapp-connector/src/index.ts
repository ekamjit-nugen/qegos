import type { Connection, Model } from 'mongoose';
import type {
  IWhatsAppConfigDocument,
  IWhatsAppMessageDocument,
  WhatsAppConnectorConfig,
  WhatsAppCacheClient,
} from './types';
import { createWhatsAppConfigModel } from './models/whatsappConfigModel';
import { createWhatsAppMessageModel } from './models/whatsappMessageModel';
import { initWhatsAppService } from './services/whatsappService';
import { initMetaApiService } from './services/metaApiService';

// ─── Init Result ────────────────────────────────────────────────────────────

export interface WhatsAppConnectorInitResult {
  ConfigModel: Model<IWhatsAppConfigDocument>;
  MessageModel: Model<IWhatsAppMessageDocument>;
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function init(
  connection: Connection,
  config: WhatsAppConnectorConfig,
  cache?: WhatsAppCacheClient,
): WhatsAppConnectorInitResult {
  const ConfigModel = createWhatsAppConfigModel(connection);
  const MessageModel = createWhatsAppMessageModel(connection);

  initWhatsAppService(MessageModel, ConfigModel);
  initMetaApiService(config, cache);

  return { ConfigModel, MessageModel };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export type {
  IWhatsAppConfig,
  IWhatsAppConfigDocument,
  IWhatsAppMessage,
  IWhatsAppMessageDocument,
  WhatsAppDirection,
  WhatsAppContactType,
  WhatsAppMessageType,
  WhatsAppMessageStatus,
  WhatsAppQualityRating,
  WhatsAppConnectorConfig,
  WhatsAppRouteDeps,
  WhatsAppCacheClient,
  WhatsAppMediaDeps,
} from './types';

export { WHATSAPP_MESSAGE_TYPES, FREEFORM_WINDOW_HOURS, toMetaFormat, toE164 } from './types';

export { createWhatsAppConfigModel } from './models/whatsappConfigModel';
export { createWhatsAppMessageModel } from './models/whatsappMessageModel';

export {
  initMetaApiService,
  sendTemplateMessage,
  sendFreeformMessage,
  downloadMedia,
  listTemplates,
  getConnectionStatus,
} from './services/metaApiService';

export {
  initWhatsAppService,
  getConfig,
  updateConfig,
  logOutboundMessage,
  logInboundMessage,
  checkFreeformWindow,
  updateMessageStatus,
  getContactMessages,
  linkMediaToVault,
} from './services/whatsappService';

export { createWhatsAppRoutes } from './routes/whatsappRoutes';

export { initMediaService, processMediaDownload } from './services/mediaService';
export type { MediaDownloadResult } from './services/mediaService';

export {
  sendTemplateValidation,
  sendFreeformValidation,
  updateConfigValidation,
  getConversationValidation,
  getMediaValidation,
} from './validators/whatsappValidators';
