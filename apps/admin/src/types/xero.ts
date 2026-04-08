export type XeroSyncStatus = 'queued' | 'processing' | 'success' | 'failed';

export type XeroSyncEntityType = 'contact' | 'invoice' | 'payment' | 'credit_note';

export const SYNC_STATUS_COLORS: Record<XeroSyncStatus, string> = {
  queued: 'default',
  processing: 'processing',
  success: 'green',
  failed: 'red',
};

export const SYNC_ENTITY_LABELS: Record<XeroSyncEntityType, string> = {
  contact: 'Contact',
  invoice: 'Invoice',
  payment: 'Payment',
  credit_note: 'Credit Note',
};

export interface XeroConfig {
  xeroConnected: boolean;
  xeroTenantId?: string;
  xeroRevenueAccountCode?: string;
  xeroBankAccountId?: string;
  xeroGstAccountCode?: string;
  xeroDefaultTaxType?: string;
  lastSyncAt?: string;
  syncErrorCount: number;
}

export interface XeroSyncLog {
  _id: string;
  entityType: XeroSyncEntityType;
  entityId: string;
  xeroEntityId?: string;
  action: string;
  status: XeroSyncStatus;
  error?: string;
  retryCount: number;
  createdAt: string;
}

export interface SyncLogListQuery {
  page?: number;
  limit?: number;
  status?: XeroSyncStatus;
  entityType?: XeroSyncEntityType;
}
