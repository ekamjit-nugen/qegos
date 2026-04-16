/**
 * setupCronWorker — collapse the 50-line BullMQ cron+worker boilerplate
 * that repeats 9× in server.ts into a ~12-line call-site.
 *
 * Each call wires up:
 *   1. A Queue with the shared redis + default job options
 *   2. Repeatable jobs registered with the supplied cron patterns
 *   3. A Worker bound to a caller-supplied job handler
 *   4. Structured `completed`/`failed` logging via the shared jobLogger
 *   5. Dead-letter routing on exhausted retries
 *
 * The handler intentionally receives the raw BullMQ `Job` so callers can
 * `switch` on `job.name` (the existing pattern) and read `job.data` for
 * on-demand jobs (e.g. `lead-automation`'s `scoreRecalculation`).
 *
 * The Queue and Worker handles are returned so the bootstrap site can
 * enqueue ad-hoc jobs (e.g. injecting `automationQueue` into a service)
 * and so the caller retains ownership of the lifecycle if it later needs
 * to wire a graceful shutdown.
 */
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Logger } from '../lib/logger';

/** A repeatable BullMQ job entry: name + cron pattern. */
export interface CronJob {
  name: string;
  pattern: string;
}

/** Shared infra wiring threaded through every cron worker. */
export interface CronWorkerInfra {
  /** BullMQ `connection` option — passed to both Queue and Worker. */
  redisConnectionOpts: { host: string; port: number; password: string | undefined };
  /** BullMQ `defaultJobOptions` — retry/backoff policy applied to the queue. */
  defaultJobOptions: JobsOptions & { attempts: number };
  /** Child logger used for `Job completed` / `Job failed` lines. */
  jobLogger: Pick<Logger, 'info' | 'warn'>;
  /** Move a job to the dead-letter queue once `attempts` is exhausted. */
  moveToDeadLetter: (sourceQueue: string, job: Job | undefined, err: Error) => Promise<void>;
}

export interface SetupCronWorkerOptions {
  /** BullMQ queue name (also used in log lines + DLQ entries). */
  queueName: string;
  /** Repeatable jobs registered on bootstrap. May be empty for queues that only run on-demand jobs. */
  cronJobs?: ReadonlyArray<CronJob>;
  /** Job processor — receives the raw BullMQ Job so it can switch on name + read data. */
  handler: (job: Job) => Promise<void>;
  /** Optional per-queue overrides merged on top of the shared `defaultJobOptions`. */
  jobOptionsOverride?: Partial<JobsOptions>;
}

export interface CronWorkerHandle {
  queue: Queue;
  worker: Worker;
}

export async function setupCronWorker(
  infra: CronWorkerInfra,
  opts: SetupCronWorkerOptions,
): Promise<CronWorkerHandle> {
  const { queueName, cronJobs = [], handler, jobOptionsOverride } = opts;

  const queue = new Queue(queueName, {
    connection: infra.redisConnectionOpts,
    defaultJobOptions: jobOptionsOverride
      ? { ...infra.defaultJobOptions, ...jobOptionsOverride }
      : infra.defaultJobOptions,
  });

  for (const job of cronJobs) {
    await queue.add(job.name, {}, { repeat: { pattern: job.pattern } });
  }

  const worker = new Worker(queueName, handler, { connection: infra.redisConnectionOpts });

  worker.on('completed', (job) => {
    infra.jobLogger.info('Job completed', { queue: queueName, jobName: job.name });
  });
  worker.on('failed', (job, err) => {
    infra.jobLogger.warn('Job failed', {
      queue: queueName,
      jobName: job?.name,
      attempt: job?.attemptsMade,
      error: err.message,
    });
    void infra.moveToDeadLetter(queueName, job, err);
  });

  return { queue, worker };
}
