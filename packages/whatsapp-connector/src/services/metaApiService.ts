import type { WhatsAppConnectorConfig, WhatsAppCacheClient } from '../types';
import { toMetaFormat } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let accessToken: string;
let phoneNumberId: string;
let apiBaseUrl: string;
let cache: WhatsAppCacheClient | null = null;
const TEMPLATE_CACHE_TTL_SECONDS = 3600; // 1h — templates change rarely

export function initMetaApiService(
  config: WhatsAppConnectorConfig,
  cacheClient?: WhatsAppCacheClient,
): void {
  accessToken = config.accessToken ?? '';
  phoneNumberId = config.phoneNumberId ?? '';
  apiBaseUrl = config.apiBaseUrl ?? 'https://graph.facebook.com/v18.0';
  cache = cacheClient ?? null;
}

// ─── Send Template Message (WHA-INV-02) ─────────────────────────────────────

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'en',
): Promise<{ waMessageId: string }> {
  const url = `${apiBaseUrl}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: toMetaFormat(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length > 0
        ? [{
            type: 'body',
            parameters: params.map((p) => ({ type: 'text', text: p })),
          }]
        : [],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(`WhatsApp API error: ${error?.error?.message ?? response.statusText}`);
  }

  const data = await response.json() as { messages: Array<{ id: string }> };
  return { waMessageId: data.messages[0].id };
}

// ─── Send Freeform Text (WHA-INV-03: only within 24hr window) ───────────────

export async function sendFreeformMessage(
  to: string,
  text: string,
): Promise<{ waMessageId: string }> {
  const url = `${apiBaseUrl}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: toMetaFormat(to),
    type: 'text',
    text: { body: text },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(`WhatsApp API error: ${error?.error?.message ?? response.statusText}`);
  }

  const data = await response.json() as { messages: Array<{ id: string }> };
  return { waMessageId: data.messages[0].id };
}

// ─── Download Media (WHA-INV-01: within 30min of webhook) ───────────────────

export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Step 1: Get media URL from Meta
  const metaUrl = `${apiBaseUrl}/${mediaId}`;
  const metaResponse = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!metaResponse.ok) {
    throw new Error(`Failed to get media URL: ${metaResponse.statusText}`);
  }

  const metaData = await metaResponse.json() as { url: string; mime_type: string };

  // Step 2: Download the actual file
  const fileResponse = await fetch(metaData.url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!fileResponse.ok) {
    throw new Error(`Failed to download media: ${fileResponse.statusText}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: metaData.mime_type,
  };
}

// ─── List Approved Templates ────────────────────────────────────────────────

export async function listTemplates(
  businessAccountId: string,
): Promise<Array<{ name: string; status: string; language: string }>> {
  const cacheKey = `whatsapp:templates:${businessAccountId}`;

  if (cache) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Array<{ name: string; status: string; language: string }>;
      }
    } catch {
      // Cache hiccup — fall through to live fetch.
    }
  }

  const url = `${apiBaseUrl}/${businessAccountId}/message_templates`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list templates: ${response.statusText}`);
  }

  const data = await response.json() as { data: Array<{ name: string; status: string; language: string }> };

  if (cache) {
    try {
      await cache.set(cacheKey, JSON.stringify(data.data), 'EX', TEMPLATE_CACHE_TTL_SECONDS);
    } catch {
      // Non-fatal: caller gets the fresh data either way.
    }
  }

  return data.data;
}

// ─── Get Connection Status ──────────────────────────────────────────────────

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  qualityRating?: string;
}> {
  if (!accessToken || !phoneNumberId) {
    return { connected: false };
  }

  try {
    const url = `${apiBaseUrl}/${phoneNumberId}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return { connected: response.ok };
  } catch {
    return { connected: false };
  }
}
