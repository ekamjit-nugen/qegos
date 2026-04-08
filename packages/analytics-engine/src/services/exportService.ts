import type { AnalyticsView, ExportJobResponse } from '../types';

interface ExportQueue {
  add(name: string, data: Record<string, unknown>): Promise<{ id: string | number }>;
}

/**
 * Enqueue an analytics export job for async processing.
 * Returns jobId for status polling.
 */
export async function createExportJob(
  queue: ExportQueue,
  params: {
    format: 'pdf' | 'xlsx';
    widgets: AnalyticsView[];
    dateRange: { dateFrom: string; dateTo: string };
    requestedBy: string;
  },
): Promise<ExportJobResponse> {
  const job = await queue.add('analytics-export', {
    format: params.format,
    widgets: params.widgets,
    dateRange: params.dateRange,
    requestedBy: params.requestedBy,
    requestedAt: new Date().toISOString(),
  });

  return {
    jobId: String(job.id),
    status: 'queued',
    message: `Export job queued. Format: ${params.format}, widgets: ${params.widgets.length}`,
  };
}
