/**
 * WhatsApp media download pipeline (WHA-INV-01).
 *
 * Inbound webhook messages of type `image`, `document`, etc. carry a Meta
 * media ID. The binary itself must be fetched via Graph API within ~5min
 * or the URL expires. This module owns:
 *
 *   1. `initMediaService(deps)` — wire MessageModel + uploader (+ optional
 *      virus scanner) at bootstrap.
 *   2. `processMediaDownload(messageId)` — idempotent worker entrypoint.
 *      Fetches the media via Meta, scans it (if scanner wired), uploads
 *      to blob storage, and stamps `mediaUrl` + `mediaDownloadedAt` on
 *      the message. No-op if already downloaded.
 *
 * The app runs this inside a BullMQ worker with retry + backoff; the
 * webhook path only enqueues. Keeping the package decoupled from the
 * queue lets tests call `processMediaDownload` directly.
 */
import type { WhatsAppMediaDeps } from '../types';
import { downloadMedia } from './metaApiService';

let deps: WhatsAppMediaDeps | null = null;

export function initMediaService(d: WhatsAppMediaDeps): void {
  deps = d;
}

export interface MediaDownloadResult {
  status: 'downloaded' | 'already_downloaded' | 'no_media' | 'infected' | 'not_found';
  mediaUrl?: string;
}

export async function processMediaDownload(messageId: string): Promise<MediaDownloadResult> {
  if (!deps) {
    throw new Error('whatsapp-connector: initMediaService() not called');
  }

  const msg = await deps.MessageModel.findById(messageId);
  if (!msg) {
    return { status: 'not_found' };
  }
  if (msg.mediaUrl) {
    return { status: 'already_downloaded', mediaUrl: msg.mediaUrl };
  }

  // `mediaOriginalUrl` currently stores the Meta media ID (see webhook
  // handler). That's what downloadMedia() expects.
  const mediaId = msg.mediaOriginalUrl;
  if (!mediaId) {
    return { status: 'no_media' };
  }

  const { buffer, mimeType } = await downloadMedia(mediaId);

  if (deps.scanMedia) {
    const scan = await deps.scanMedia(buffer);
    if (scan.status === 'infected') {
      await deps.MessageModel.findByIdAndUpdate(messageId, {
        $set: { failureReason: 'media_infected' },
      });
      return { status: 'infected' };
    }
    // `error` = scanner unreachable. Fail open: upload anyway. The
    // vault-side scanner will re-check when a user tries to view the file.
  }

  const safeMobile = (msg.contactMobile ?? 'unknown').replace(/[^0-9]/g, '');
  const key = `whatsapp/${safeMobile}/${mediaId}-${Date.now()}`;
  const storedKey = await deps.uploadMedia(buffer, key, mimeType ?? 'application/octet-stream');

  await deps.MessageModel.findByIdAndUpdate(messageId, {
    $set: {
      mediaUrl: storedKey,
      mediaMimeType: mimeType,
      mediaDownloadedAt: new Date(),
    },
  });

  return { status: 'downloaded', mediaUrl: storedKey };
}
