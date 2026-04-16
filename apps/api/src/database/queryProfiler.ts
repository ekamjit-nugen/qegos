/**
 * Query Profiler — Development & Staging Tool
 *
 * Monitors MongoDB query performance and flags slow queries.
 * Enable via ENABLE_QUERY_PROFILER=true environment variable.
 *
 * Features:
 * - Logs queries exceeding threshold (default 100ms)
 * - Tracks collection scan (COLLSCAN) warnings
 * - Aggregation pipeline timing
 * - Periodic slow query summary
 */

import type { Connection } from 'mongoose';

export interface QueryProfile {
  collection: string;
  operation: string;
  durationMs: number;
  filter?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  indexUsed?: string;
  docsExamined: number;
  docsReturned: number;
  isCollScan: boolean;
  timestamp: Date;
}

export interface ProfilerConfig {
  /** Minimum duration (ms) to log a query. Default: 100 */
  slowThresholdMs?: number;
  /** Enable logging to console. Default: true */
  logToConsole?: boolean;
  /** Maximum profiles to keep in memory. Default: 1000 */
  maxProfiles?: number;
  /** Enable explain plan for slow queries. Default: false (expensive) */
  autoExplain?: boolean;
}

const DEFAULT_CONFIG: Required<ProfilerConfig> = {
  slowThresholdMs: 100,
  logToConsole: true,
  maxProfiles: 1000,
  autoExplain: false,
};

/**
 * In-memory store for profiled queries.
 */
class QueryProfileStore {
  private profiles: QueryProfile[] = [];
  private config: Required<ProfilerConfig>;

  constructor(config: ProfilerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  add(profile: QueryProfile): void {
    this.profiles.push(profile);

    // Keep bounded size
    if (this.profiles.length > this.config.maxProfiles) {
      this.profiles = this.profiles.slice(-this.config.maxProfiles);
    }

    // Log slow queries
    if (profile.durationMs >= this.config.slowThresholdMs) {
      if (this.config.logToConsole) {
        const scanWarning = profile.isCollScan ? ' ⚠ COLLSCAN' : '';
        console.warn(
          // eslint-disable-line no-console
          `[slow-query] ${profile.collection}.${profile.operation} ` +
            `${profile.durationMs}ms (examined: ${profile.docsExamined}, ` +
            `returned: ${profile.docsReturned})${scanWarning}`,
        );
        if (profile.filter) {
          console.warn('[slow-query] filter:', JSON.stringify(profile.filter)); // eslint-disable-line no-console
        }
      }
    }
  }

  /**
   * Get all slow queries above threshold.
   */
  getSlowQueries(thresholdMs?: number): QueryProfile[] {
    const threshold = thresholdMs ?? this.config.slowThresholdMs;
    return this.profiles.filter((p) => p.durationMs >= threshold);
  }

  /**
   * Get collection scan warnings.
   */
  getCollScans(): QueryProfile[] {
    return this.profiles.filter((p) => p.isCollScan);
  }

  /**
   * Get summary grouped by collection.
   */
  getSummary(): Array<{
    collection: string;
    queryCount: number;
    avgMs: number;
    maxMs: number;
    collScans: number;
    slowQueries: number;
  }> {
    const byCollection = new Map<string, QueryProfile[]>();
    for (const p of this.profiles) {
      if (!byCollection.has(p.collection)) {
        byCollection.set(p.collection, []);
      }
      byCollection.get(p.collection)!.push(p);
    }

    return [...byCollection.entries()]
      .map(([collection, profiles]) => ({
        collection,
        queryCount: profiles.length,
        avgMs: Math.round(profiles.reduce((s, p) => s + p.durationMs, 0) / profiles.length),
        maxMs: Math.max(...profiles.map((p) => p.durationMs)),
        collScans: profiles.filter((p) => p.isCollScan).length,
        slowQueries: profiles.filter((p) => p.durationMs >= this.config.slowThresholdMs).length,
      }))
      .sort((a, b) => b.maxMs - a.maxMs);
  }

  /**
   * Get the N slowest queries overall.
   */
  getSlowest(n: number = 10): QueryProfile[] {
    return [...this.profiles].sort((a, b) => b.durationMs - a.durationMs).slice(0, n);
  }

  /**
   * Clear all profiles.
   */
  clear(): void {
    this.profiles = [];
  }

  /**
   * Get total profile count.
   */
  get count(): number {
    return this.profiles.length;
  }
}

// Singleton store
let store: QueryProfileStore | null = null;

/**
 * Enable Mongoose query profiling on a connection.
 * Hooks into Mongoose's query execution to measure timing.
 *
 * Only call this in development/staging — never in production.
 */
export function enableQueryProfiler(
  connection: Connection,
  config: ProfilerConfig = {},
): QueryProfileStore {
  store = new QueryProfileStore(config);

  // Hook into Mongoose debug mode for query timing
  connection.set(
    'debug',
    (collectionName: string, methodName: string, ...methodArgs: unknown[]) => {
      // We can't intercept the actual completion, but we can log the query start.
      // For actual timing, use MongoDB profiler or Mongoose plugins.
      const filter = (methodArgs[0] as Record<string, unknown>) ?? {};

      // Record with estimated timing (debug callback fires at query start)
      // For accurate timing, use the Mongoose plugin approach below
      store!.add({
        collection: collectionName,
        operation: methodName,
        durationMs: 0, // Will be populated by plugin
        filter: typeof filter === 'object' ? filter : undefined,
        docsExamined: 0,
        docsReturned: 0,
        isCollScan: false,
        timestamp: new Date(),
      });
    },
  );

  return store;
}

/**
 * Mongoose plugin that profiles query execution time.
 * Apply to schemas that need profiling.
 *
 * Usage:
 *   schema.plugin(queryTimingPlugin);
 */
export function queryTimingPlugin(schema: import('mongoose').Schema): void {
  // Profile find queries
  schema.pre('find', function () {
    (this as unknown as Record<string, unknown>)._queryStart = Date.now();
  });

  schema.post('find', function (result: unknown) {
    const start = (this as unknown as Record<string, number>)._queryStart;
    if (start && store) {
      const duration = Date.now() - start;
      const docs = Array.isArray(result) ? result.length : 0;
      store.add({
        collection: this.model.collection.name,
        operation: 'find',
        durationMs: duration,
        filter: this.getFilter() as Record<string, unknown>,
        sort: this.getOptions().sort as Record<string, unknown> | undefined,
        docsExamined: 0, // Would need explain() for this
        docsReturned: docs,
        isCollScan: false,
        timestamp: new Date(),
      });
    }
  });

  // Profile findOne
  schema.pre('findOne', function () {
    (this as unknown as Record<string, unknown>)._queryStart = Date.now();
  });

  schema.post('findOne', function () {
    const start = (this as unknown as Record<string, number>)._queryStart;
    if (start && store) {
      const duration = Date.now() - start;
      store.add({
        collection: this.model.collection.name,
        operation: 'findOne',
        durationMs: duration,
        filter: this.getFilter() as Record<string, unknown>,
        docsExamined: 0,
        docsReturned: 1,
        isCollScan: false,
        timestamp: new Date(),
      });
    }
  });

  // Profile aggregate
  schema.pre('aggregate', function () {
    (this as unknown as Record<string, unknown>)._queryStart = Date.now();
  });

  schema.post('aggregate', function (result: unknown) {
    const start = (this as unknown as Record<string, number>)._queryStart;
    if (start && store) {
      const duration = Date.now() - start;
      const pipeline = this.pipeline() as unknown as Array<Record<string, unknown>>;
      const firstMatch = pipeline.find((s) => '$match' in s);
      const docs = Array.isArray(result) ? result.length : 0;

      store.add({
        collection:
          (this as unknown as { _model: { collection: { name: string } } })._model?.collection
            ?.name ?? 'unknown',
        operation: 'aggregate',
        durationMs: duration,
        filter: firstMatch?.$match as Record<string, unknown> | undefined,
        docsExamined: 0,
        docsReturned: docs,
        isCollScan: false,
        timestamp: new Date(),
      });
    }
  });
}

/**
 * Run explain() on a query to check index usage.
 * Returns structured explain output for analysis.
 */
export async function explainQuery(
  connection: Connection,
  collection: string,
  filter: Record<string, unknown>,
  sort?: Record<string, unknown>,
): Promise<{
  queryPlanner: {
    winningPlan: string;
    indexUsed: string | null;
    isCollScan: boolean;
  };
  executionStats: {
    nReturned: number;
    totalDocsExamined: number;
    totalKeysExamined: number;
    executionTimeMs: number;
    indexEfficiency: number;
  };
}> {
  if (!connection.db) {
    throw new Error('No active database connection');
  }
  const col = connection.db.collection(collection);

  let cursor = col.find(filter);
  if (sort) {
    cursor = cursor.sort(sort as Record<string, 1 | -1>);
  }

  const explanation = (await cursor.explain('executionStats')) as Record<string, unknown>;
  const stats = (explanation.executionStats as Record<string, unknown>) ?? {};
  const queryPlanner = (explanation.queryPlanner as Record<string, unknown>) ?? {};
  const winningPlan = (queryPlanner.winningPlan as Record<string, unknown>) ?? {};

  // Extract plan type
  const planStage = (winningPlan.stage as string) ?? 'UNKNOWN';
  const inputStage = winningPlan.inputStage as Record<string, unknown> | undefined;
  const isCollScan = planStage === 'COLLSCAN' || inputStage?.stage === 'COLLSCAN';
  const indexName =
    (inputStage?.indexName as string) ??
    ((inputStage?.inputStage as Record<string, unknown>)?.indexName as string) ??
    null;

  const nReturned = (stats.nReturned as number) ?? 0;
  const totalDocsExamined = (stats.totalDocsExamined as number) ?? 0;
  const totalKeysExamined = (stats.totalKeysExamined as number) ?? 0;
  const executionTimeMs = (stats.executionTimeMillis as number) ?? 0;

  // Index efficiency: ratio of returned docs to examined docs (1.0 = perfect)
  const indexEfficiency =
    totalDocsExamined > 0 ? Math.round((nReturned / totalDocsExamined) * 100) / 100 : 1;

  return {
    queryPlanner: {
      winningPlan: planStage,
      indexUsed: indexName,
      isCollScan,
    },
    executionStats: {
      nReturned,
      totalDocsExamined,
      totalKeysExamined,
      executionTimeMs,
      indexEfficiency,
    },
  };
}

/**
 * Analyze all analytics query patterns against explain plans.
 * Returns a report of which queries use indexes efficiently.
 */
export async function analyzeAnalyticsQueries(connection: Connection): Promise<
  Array<{
    name: string;
    collection: string;
    filter: Record<string, unknown>;
    indexUsed: string | null;
    isCollScan: boolean;
    efficiency: number;
    recommendation?: string;
  }>
> {
  const queries = [
    {
      name: 'Revenue by period',
      collection: 'payments',
      filter: {
        status: { $in: ['succeeded', 'captured'] },
        createdAt: { $gte: new Date('2025-01-01') },
      },
    },
    {
      name: 'CLV by user',
      collection: 'payments',
      filter: { status: { $in: ['succeeded', 'captured'] } },
    },
    {
      name: 'Pipeline health',
      collection: 'leads',
      filter: { isDeleted: { $ne: true }, createdAt: { $gte: new Date('2025-01-01') } },
    },
    {
      name: 'Staff benchmark (orders)',
      collection: 'orders',
      filter: {
        status: { $in: [6, 7, 8] },
        isDeleted: { $ne: true },
        processingBy: { $exists: true },
      },
    },
    {
      name: 'Staff benchmark (activities)',
      collection: 'leadactivities',
      filter: {
        type: { $in: ['phone_call_outbound', 'email_sent'] },
        createdAt: { $gte: new Date('2025-01-01') },
      },
    },
    {
      name: 'Churn risk',
      collection: 'tax_year_summaries',
      filter: { financialYear: '2024-2025' },
    },
    {
      name: 'Service mix',
      collection: 'orders',
      filter: {
        status: { $ne: 9 },
        isDeleted: { $ne: true },
        createdAt: { $gte: new Date('2025-01-01') },
      },
    },
    {
      name: 'Collection rate (pending)',
      collection: 'payments',
      filter: { status: { $in: ['pending', 'authorised', 'requires_capture'] } },
    },
  ];

  const results = [];
  for (const q of queries) {
    try {
      const explanation = await explainQuery(connection, q.collection, q.filter);
      let recommendation: string | undefined;

      if (explanation.queryPlanner.isCollScan) {
        recommendation = `CRITICAL: Collection scan on ${q.collection}. Add compound index for this filter pattern.`;
      } else if (explanation.executionStats.indexEfficiency < 0.5) {
        recommendation = `Index exists but only ${Math.round(explanation.executionStats.indexEfficiency * 100)}% efficient. Consider a more selective compound index.`;
      }

      results.push({
        name: q.name,
        collection: q.collection,
        filter: q.filter,
        indexUsed: explanation.queryPlanner.indexUsed,
        isCollScan: explanation.queryPlanner.isCollScan,
        efficiency: explanation.executionStats.indexEfficiency,
        recommendation,
      });
    } catch {
      results.push({
        name: q.name,
        collection: q.collection,
        filter: q.filter,
        indexUsed: null,
        isCollScan: true,
        efficiency: 0,
        recommendation: `Could not analyze: collection may not exist yet.`,
      });
    }
  }

  return results;
}

/**
 * Get the current profiler store (or null if not enabled).
 */
export function getProfilerStore(): QueryProfileStore | null {
  return store;
}
