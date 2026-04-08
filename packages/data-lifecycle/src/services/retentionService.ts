import type { RetentionPolicyConfig, ModelFieldConfig } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let retentionPolicies: RetentionPolicyConfig[] = [];
let modelConfigs: Map<string, ModelFieldConfig>;

export function initRetentionService(
  policies: RetentionPolicyConfig[],
  configs: Map<string, ModelFieldConfig>,
): void {
  retentionPolicies = policies;
  modelConfigs = configs;
}

// ─── Enforce Retention Policies ────────────────────────────────────────────

export interface RetentionResult {
  modelName: string;
  action: string;
  recordsAffected: number;
}

/**
 * Runs all configured retention policies.
 * For each policy, finds records older than retentionDays
 * and applies the configured action (anonymize, soft_delete, hard_delete).
 */
export async function enforceRetentionPolicies(): Promise<RetentionResult[]> {
  const results: RetentionResult[] = [];

  for (const policy of retentionPolicies) {
    const config = modelConfigs.get(policy.modelName);
    if (!config) continue;

    const cutoffDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);

    const filter: Record<string, unknown> = {
      [policy.dateField]: { $lte: cutoffDate },
      ...(policy.filter ?? {}),
    };

    let affected = 0;

    switch (policy.action) {
      case 'hard_delete': {
        const result = await config.model.deleteMany(filter);
        affected = result.deletedCount;
        break;
      }
      case 'soft_delete': {
        const result = await config.model.updateMany(filter, {
          $set: { isDeleted: true, deletedAt: new Date() },
        });
        affected = result.modifiedCount;
        break;
      }
      case 'anonymize': {
        const setFields: Record<string, string> = {};
        for (const [field, replacement] of Object.entries(config.piiFields)) {
          setFields[field] = replacement;
        }
        if (Object.keys(setFields).length > 0) {
          const result = await config.model.updateMany(filter, { $set: setFields });
          affected = result.modifiedCount;
        }
        break;
      }
    }

    results.push({
      modelName: policy.modelName,
      action: policy.action,
      recordsAffected: affected,
    });
  }

  return results;
}
