/**
 * Database Index Initialization Script
 *
 * Ensures all critical indexes exist for production performance.
 * Run once at startup (or via CLI) — idempotent (createIndex is a no-op if index exists).
 *
 * Index strategy:
 * 1. Compound indexes covering common queries (avoid collection scans)
 * 2. Partial indexes for filtered subsets (save space)
 * 3. TTL indexes for automatic data expiry
 * 4. Analytics-optimized indexes for aggregation pipelines
 */

import type { Connection } from 'mongoose';

export interface IndexDefinition {
  collection: string;
  keys: Record<string, 1 | -1 | 'text'>;
  options?: {
    name?: string;
    unique?: boolean;
    sparse?: boolean;
    partialFilterExpression?: Record<string, unknown>;
    expireAfterSeconds?: number;
    background?: boolean;
  };
  reason: string;
}

/**
 * All indexes that should exist beyond what Mongoose schema-level indexes create.
 * These are performance-critical compound indexes identified from query patterns.
 */
export const PERFORMANCE_INDEXES: IndexDefinition[] = [
  // ─── Payment Indexes (Analytics hot path) ──────────────────────────────
  {
    collection: 'payments',
    keys: { status: 1, createdAt: -1, amount: 1 },
    options: { name: 'idx_payment_status_date_amount' },
    reason: 'Analytics: revenueService, forecastService, clvService filter by status+date and sum amount',
  },
  {
    collection: 'payments',
    keys: { userId: 1, status: 1, amount: 1 },
    options: { name: 'idx_payment_user_status_amount' },
    reason: 'Analytics: clvService groups payments by userId with status filter',
  },
  {
    collection: 'payments',
    keys: { orderId: 1, status: 1, amount: 1 },
    options: { name: 'idx_payment_order_status_amount' },
    reason: 'Analytics: channelRoiService looks up payments by orderId+status',
  },

  // ─── Order Indexes ─────────────────────────────────────────────────────
  {
    collection: 'orders',
    keys: { status: 1, isDeleted: 1, createdAt: -1 },
    options: { name: 'idx_order_status_deleted_date' },
    reason: 'Analytics: serviceMixService, seasonalTrendsService filter by status+isDeleted+date',
  },
  {
    collection: 'orders',
    keys: { status: 1, isDeleted: 1, updatedAt: -1 },
    options: { name: 'idx_order_status_deleted_updated' },
    reason: 'Analytics: executiveSummary queries active orders and recently completed orders',
  },
  {
    collection: 'orders',
    keys: { processingBy: 1, status: 1, isDeleted: 1, updatedAt: -1 },
    options: { name: 'idx_order_staff_status_updated' },
    reason: 'Analytics: staffBenchmarkService aggregates completed orders by processingBy',
  },
  {
    collection: 'orders',
    keys: { financialYear: 1, status: 1, isDeleted: 1 },
    options: { name: 'idx_order_fy_status' },
    reason: 'Order list filtered by financial year and status (most common admin query)',
  },
  {
    collection: 'orders',
    keys: { userId: 1, financialYear: 1 },
    options: { name: 'idx_order_user_fy' },
    reason: 'Client portal: "My orders by financial year"',
  },
  {
    collection: 'orders',
    keys: { 'lineItems.title': 1, status: 1, isDeleted: 1, createdAt: -1 },
    options: { name: 'idx_order_service_title' },
    reason: 'Analytics: serviceMixService unwinds and groups by lineItems.title',
  },

  // ─── Lead Indexes ──────────────────────────────────────────────────────
  {
    collection: 'leads',
    keys: { status: 1, isDeleted: 1, createdAt: -1 },
    options: { name: 'idx_lead_status_deleted_date' },
    reason: 'Analytics: pipelineHealthService filters leads by status+date+isDeleted',
  },
  {
    collection: 'leads',
    keys: { assignedTo: 1, status: 1, isDeleted: 1 },
    options: { name: 'idx_lead_assigned_status' },
    reason: 'Staff dashboard: "My leads" filtered by status',
  },
  {
    collection: 'leads',
    keys: { campaignId: 1, isDeleted: 1, isConverted: 1 },
    options: { name: 'idx_lead_campaign_converted' },
    reason: 'Analytics: channelRoiService traces Campaign→Lead→Order',
  },
  {
    collection: 'leads',
    keys: { isConverted: 1, convertedOrderId: 1 },
    options: {
      name: 'idx_lead_converted_order',
      partialFilterExpression: { isConverted: true },
    },
    reason: 'Conversion lookup: find converted leads and their orders',
  },

  // ─── Lead Activity Indexes ─────────────────────────────────────────────
  {
    collection: 'leadactivities',
    keys: { type: 1, createdAt: -1, performedBy: 1 },
    options: { name: 'idx_activity_type_date_staff' },
    reason: 'Analytics: staffBenchmarkService + pipelineHealthService filter by type+date',
  },
  {
    collection: 'leadactivities',
    keys: { performedBy: 1, createdAt: -1 },
    options: { name: 'idx_activity_performer_date' },
    reason: 'Staff activity report: activities by a specific staff member',
  },

  // ─── Tax Year Summary Indexes ──────────────────────────────────────────
  {
    collection: 'tax_year_summaries',
    keys: { financialYear: 1, userId: 1 },
    options: { name: 'idx_taxsummary_fy_user' },
    reason: 'Analytics: churnRiskService does anti-join by financialYear+userId',
  },

  // ─── Review Assignment Indexes ─────────────────────────────────────────
  {
    collection: 'reviewassignments',
    keys: { status: 1, updatedAt: -1, reviewerId: 1, timeToReview: 1 },
    options: { name: 'idx_review_status_updated_reviewer' },
    reason: 'Analytics: staffBenchmarkService aggregates approved reviews by reviewer',
  },

  // ─── Support Ticket Indexes ────────────────────────────────────────────
  {
    collection: 'support_tickets',
    keys: { status: 1, resolvedAt: -1, assignedTo: 1 },
    options: { name: 'idx_ticket_status_resolved_assigned' },
    reason: 'Analytics: staffBenchmarkService aggregates resolved tickets by assignedTo',
  },
  {
    collection: 'support_tickets',
    keys: { slaDeadline: 1, status: 1, slaBreached: 1 },
    options: { name: 'idx_ticket_sla_deadline' },
    reason: 'SLA monitoring: find tickets approaching or past deadline',
  },

  // ─── Broadcast Campaign Indexes ────────────────────────────────────────
  {
    collection: 'broadcastcampaigns',
    keys: { channel: 1, createdAt: -1 },
    options: { name: 'idx_campaign_channel_date' },
    reason: 'Analytics: channelRoiService groups campaigns by channel+date range',
  },

  // ─── Audit Log Indexes ─────────────────────────────────────────────────
  {
    collection: 'auditlogs',
    keys: { resource: 1, action: 1, timestamp: -1 },
    options: { name: 'idx_audit_resource_action_time' },
    reason: 'Audit trail: filter mutations by resource type + action (e.g., all order updates)',
  },

  // ─── Notification Indexes ──────────────────────────────────────────────
  {
    collection: 'notifications',
    keys: { recipientId: 1, isRead: 1, createdAt: -1 },
    options: { name: 'idx_notification_recipient_unread' },
    reason: 'Client portal: unread notification count badge (constant polling)',
  },

  // ─── Vault Document Indexes ────────────────────────────────────────────
  {
    collection: 'vault_documents',
    keys: { userId: 1, isArchived: 1, createdAt: -1 },
    options: { name: 'idx_vault_user_active_date' },
    reason: 'Client portal: active documents for a user sorted by date',
  },

  // ─── Chat Indexes ─────────────────────────────────────────────────────
  {
    collection: 'messages',
    keys: { conversationId: 1, createdAt: 1 },
    options: { name: 'idx_message_conversation_date_asc' },
    reason: 'Chat: load messages for a conversation in chronological order',
  },

  // ─── Appointment Indexes ───────────────────────────────────────────────
  {
    collection: 'appointments',
    keys: { userId: 1, status: 1, date: 1 },
    options: { name: 'idx_appointment_user_status_date' },
    reason: 'Client portal: upcoming appointments for a user',
  },
];

/**
 * Ensure all performance indexes exist.
 * Safe to call multiple times — createIndex is idempotent.
 */
export async function ensurePerformanceIndexes(connection: Connection): Promise<{
  created: string[];
  skipped: string[];
  errors: Array<{ index: string; error: string }>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ index: string; error: string }> = [];

  if (!connection.db) throw new Error('No active database connection');
  const db = connection.db;

  for (const def of PERFORMANCE_INDEXES) {
    const indexName = def.options?.name ?? Object.keys(def.keys).join('_');
    try {
      const collection = db.collection(def.collection);

      // Check if index already exists
      const existingIndexes = await collection.indexes();
      const exists = existingIndexes.some(
        (idx) => idx.name === indexName,
      );

      if (exists) {
        skipped.push(indexName);
        continue;
      }

      await collection.createIndex(def.keys as Record<string, 1 | -1>, {
        ...def.options,
        background: true, // Non-blocking index build
      });
      created.push(indexName);
    } catch (err) {
      errors.push({
        index: indexName,
        error: (err as Error).message,
      });
    }
  }

  return { created, skipped, errors };
}

/**
 * List all indexes across all collections.
 * Useful for debugging and auditing.
 */
export async function listAllIndexes(connection: Connection): Promise<
  Array<{ collection: string; indexes: Array<{ name: string; keys: Record<string, unknown> }> }>
> {
  if (!connection.db) throw new Error('No active database connection');
  const db = connection.db;
  const collections = await db.listCollections().toArray();
  const results = [];

  for (const col of collections) {
    try {
      const indexes = await db.collection(col.name).indexes();
      results.push({
        collection: col.name,
        indexes: indexes.map((idx) => ({
          name: idx.name ?? 'unknown',
          keys: idx.key as Record<string, unknown>,
        })),
      });
    } catch {
      // Skip system collections that may not be accessible
    }
  }

  return results;
}
