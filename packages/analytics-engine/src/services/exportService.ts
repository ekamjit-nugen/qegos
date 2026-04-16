/**
 * Export Service — Async analytics export via BullMQ
 */

import { randomUUID } from 'crypto';
import type { AnalyticsView, ExportJobResponse } from '../types';

export interface ExportParams {
  format: 'pdf' | 'xlsx';
  widgets: AnalyticsView[];
  dateFrom?: string;
  dateTo?: string;
  requestedBy: string; // userId
}

/**
 * Enqueue an analytics export job. Returns the job ID for polling.
 */
export async function createExportJob(
  queue: { add: (name: string, data: unknown) => Promise<unknown> },
  params: ExportParams,
): Promise<ExportJobResponse> {
  const jobId = randomUUID();

  await queue.add('analytics-export', {
    jobId,
    format: params.format,
    widgets: params.widgets,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    requestedBy: params.requestedBy,
  });

  return {
    jobId,
    status: 'queued',
    format: params.format,
    widgets: params.widgets,
  };
}
