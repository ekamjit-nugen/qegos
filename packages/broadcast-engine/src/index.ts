import type { Connection, Model } from 'mongoose';
import type Redis from 'ioredis';
import { createCampaignModel } from './models/campaignModel';
import { createTemplateModel } from './models/templateModel';
import { createMessageModel } from './models/messageModel';
import { createOptOutModel } from './models/optOutModel';
import { createConsentModel } from './models/consentModel';
import { initTwilioProvider, twilioProvider } from './services/providers/twilioProvider';
import { initSESProvider, sesProvider } from './services/providers/sesProvider';
import { initWhatsAppProvider, whatsappProvider } from './services/providers/whatsappProvider';
import { initTemplateService } from './services/templateService';
import { initAudienceService } from './services/audienceService';
import { initMessageService } from './services/messageService';
import { initCampaignService } from './services/campaignService';
import { initQueueProcessor } from './queues/queueProcessor';
import type {
  BroadcastEngineConfig,
  BroadcastEngineInitResult,
  SingleChannel,
  IChannelProvider,
} from './types';

/**
 * Initialize the broadcast engine package.
 *
 * The consuming app provides:
 * - Mongoose connection (Database Isolation rule)
 * - Redis client for BullMQ queue backing
 * - Channel credentials (Twilio, SES, WhatsApp) — optional per channel
 * - Lead & User models for audience resolution
 */
export function init(
  connection: Connection,
  _redisClient: Redis,
  config: BroadcastEngineConfig,
  externalModels: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DI boundary; see types.ts.
    LeadModel: Model<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UserModel: Model<any>;
  },
): BroadcastEngineInitResult {
  // Create models
  const CampaignModel = createCampaignModel(connection);
  const TemplateModel = createTemplateModel(connection);
  const MessageModel = createMessageModel(connection);
  const OptOutModel = createOptOutModel(connection);
  const ConsentModel = createConsentModel(connection);

  // Initialize providers (only if credentials provided)
  const providers = new Map<SingleChannel, IChannelProvider>();

  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber) {
    initTwilioProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      phoneNumber: config.twilioPhoneNumber,
    });
    providers.set('sms', twilioProvider);
  }

  if (
    config.sesRegion &&
    config.sesAccessKeyId &&
    config.sesSecretAccessKey &&
    config.sesFromEmail
  ) {
    initSESProvider({
      region: config.sesRegion,
      accessKeyId: config.sesAccessKeyId,
      secretAccessKey: config.sesSecretAccessKey,
      fromEmail: config.sesFromEmail,
    });
    providers.set('email', sesProvider);
  }

  if (config.whatsappApiToken && config.whatsappPhoneNumberId) {
    initWhatsAppProvider({
      apiToken: config.whatsappApiToken,
      phoneNumberId: config.whatsappPhoneNumberId,
    });
    providers.set('whatsapp', whatsappProvider);
  }

  // Initialize services
  initTemplateService(TemplateModel, config);
  initAudienceService(
    externalModels.LeadModel,
    externalModels.UserModel,
    OptOutModel,
    ConsentModel,
  );
  initMessageService(MessageModel, CampaignModel, OptOutModel);
  initCampaignService(CampaignModel, TemplateModel, config, providers);
  initQueueProcessor(CampaignModel, MessageModel, providers, config);

  return {
    CampaignModel,
    TemplateModel,
    MessageModel,
    OptOutModel,
    ConsentModel,
    providers,
  };
}

// Re-export everything
export * from './types';
export { createCampaignModel } from './models/campaignModel';
export { createTemplateModel } from './models/templateModel';
export { createMessageModel } from './models/messageModel';
export { createOptOutModel } from './models/optOutModel';
export { createConsentModel } from './models/consentModel';
export { twilioProvider, initTwilioProvider } from './services/providers/twilioProvider';
export { sesProvider, initSESProvider } from './services/providers/sesProvider';
export { whatsappProvider, initWhatsAppProvider } from './services/providers/whatsappProvider';
export {
  renderMergeTags,
  appendSmsFooter,
  appendEmailFooter,
  renderMessage,
  createTemplate,
  listTemplates,
  updateTemplate,
  getTemplateById,
  initTemplateService,
} from './services/templateService';
export { resolveAudience, getAudienceCount, initAudienceService } from './services/audienceService';
export {
  createMessages,
  getQueuedMessages,
  updateMessageStatus,
  updateMessageByGatewayId,
  handleBounce,
  getCampaignStats,
  syncCampaignCounters,
  getMessageLog,
  isCampaignComplete,
  initMessageService,
} from './services/messageService';
export {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  duplicateCampaign,
  previewMessage,
  getAudienceCountAndCost,
  isValidTransition,
  initCampaignService,
} from './services/campaignService';
export {
  processChannelQueue,
  triggerScheduledCampaigns,
  checkCampaignCompletion,
  initQueueProcessor,
} from './queues/queueProcessor';
export { createBroadcastRoutes, type BroadcastRouteDeps } from './routes/broadcastRoutes';
export {
  createCampaignValidation,
  updateCampaignValidation,
  campaignIdValidation,
  listCampaignsValidation,
  campaignMessagesValidation,
  previewCampaignValidation,
  createTemplateValidation,
  updateTemplateValidation,
  listTemplatesValidation,
  createOptOutValidation,
  listOptOutsValidation,
  checkOptOutValidation,
  importOptOutsValidation,
} from './validators/broadcastValidators';
