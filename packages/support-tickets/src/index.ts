import type { Connection, Model, Document } from 'mongoose';
import type { ISupportTicketDocument, SupportTicketsConfig } from './types';
import { createSupportTicketModel } from './models/ticketModel';
import { initSlaEngine } from './services/slaEngine';
import { initTicketService } from './services/ticketService';
import { setCounterModel } from './models/ticketModel';

// ─── Init Result ────────────────────────────────────────────────────────────

export interface SupportTicketsInitResult {
  TicketModel: Model<ISupportTicketDocument>;
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function init(
  connection: Connection,
  config?: SupportTicketsConfig,
  externalModels?: {
    CounterModel: Model<Document>;
  },
): SupportTicketsInitResult {
  const TicketModel = createSupportTicketModel(connection);

  initSlaEngine(config);
  initTicketService(TicketModel);

  if (externalModels?.CounterModel) {
    setCounterModel(externalModels.CounterModel as never);
  }

  return { TicketModel };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export type {
  ISupportTicket,
  ISupportTicketDocument,
  ITicketMessage,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketSource,
  ResolutionCategory,
  MessageSenderType,
  SlaConfig,
  SupportTicketsConfig,
  SupportTicketsRouteDeps,
} from './types';

export {
  TICKET_STATUSES,
  TICKET_STATUS_TRANSITIONS,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_SOURCES,
  RESOLUTION_CATEGORIES,
  SLA_BY_PRIORITY,
  MAX_REOPENS,
} from './types';

export { createSupportTicketModel } from './models/ticketModel';

export {
  initSlaEngine,
  isBusinessHour,
  calculateSlaDeadline,
  calculateFirstResponseDeadline,
  isSlaImminent,
  isSlaBreached,
  getEscalationTriggerTime,
} from './services/slaEngine';

export {
  initTicketService,
  isValidTransition,
  createTicket,
  getTicket,
  listTickets,
  updateTicketStatus,
  assignTicket,
  addMessage,
  escalateTicket,
  resolveTicket,
  reopenTicket,
  rateSatisfaction,
  getTicketStats,
  checkSlaBreaches,
  autoCloseStaleTickets,
  autoCloseResolvedTickets,
} from './services/ticketService';

export { createTicketRoutes } from './routes/ticketRoutes';

export {
  createTicketValidation,
  listTicketsValidation,
  getTicketValidation,
  updateStatusValidation,
  assignTicketValidation,
  addMessageValidation,
  escalateValidation,
  resolveValidation,
  reopenValidation,
  satisfactionValidation,
} from './validators/ticketValidators';
