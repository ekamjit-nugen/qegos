import type { Model } from 'mongoose';
import type { IXeroSyncLogDocument } from '../types';
import { callXeroApi, XeroOfflineError } from './xeroClient';

// ─── Module State ───────────────────────────────────────────────────────────

let XeroSyncLogModel: Model<IXeroSyncLogDocument>;
let UserModel: Model<any>;

export function initContactSync(
  syncLogModel: Model<IXeroSyncLogDocument>,
  userModel: Model<any>,
): void {
  XeroSyncLogModel = syncLogModel;
  UserModel = userModel;
}

// ─── Sync Single Contact (XRO-INV-06) ───────────────────────────────────

/**
 * Sync a QEGOS user to Xero as a Contact.
 * XRO-INV-06: Match by email (primary), then mobile, never name.
 */
export async function syncContact(
  userId: string,
): Promise<{ xeroContactId: string; created: boolean }> {
  const user = (await UserModel.findById(userId).lean()) as any;
  if (!user) {
    throw new Error('User not found');
  }

  // Check if already synced via sync log
  const existingLog = await XeroSyncLogModel.findOne({
    entityType: 'contact',
    entityId: userId,
    status: 'success',
  }).lean();

  if ((existingLog as any)?.xeroEntityId) {
    return { xeroContactId: (existingLog as any).xeroEntityId, created: false };
  }

  const syncLog = await XeroSyncLogModel.create({
    entityType: 'contact',
    entityId: userId,
    action: 'create',
    status: 'processing',
    requestPayload: { email: user.email, mobile: user.mobile },
  });

  try {
    const result = await callXeroApi(async (accessToken, tenantId) => {
      // XRO-INV-06: Search by email first
      let existingContact = await searchXeroContact(
        accessToken,
        tenantId,
        'EmailAddress',
        user.email,
      );

      // XRO-INV-06: Then by mobile
      if (!existingContact && user.mobile) {
        existingContact = await searchXeroContact(accessToken, tenantId, 'Phones', user.mobile);
      }

      if (existingContact) {
        return { contactId: existingContact.ContactID as string, created: false };
      }

      // Create new contact
      const contactPayload = buildContactPayload(user);
      const res = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ Contacts: [contactPayload] }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Xero contact creation failed: ${res.status} ${errBody}`);
      }

      const data = (await res.json()) as { Contacts: Array<{ ContactID: string }> };
      return { contactId: data.Contacts[0].ContactID, created: true };
    });

    syncLog.status = 'success';
    syncLog.xeroEntityId = result.contactId;
    syncLog.processedAt = new Date();
    await syncLog.save();

    return { xeroContactId: result.contactId, created: result.created };
  } catch (err: unknown) {
    syncLog.status = err instanceof XeroOfflineError ? 'queued' : 'failed';
    syncLog.error = (err as Error).message;
    await syncLog.save();
    throw err;
  }
}

// ─── Bulk Sync Contacts ─────────────────────────────────────────────────

export async function bulkSyncContacts(): Promise<{ synced: number; failed: number }> {
  // Find users not yet synced (no success log)
  const syncedUserIds = await XeroSyncLogModel.distinct('entityId', {
    entityType: 'contact',
    status: 'success',
  });

  const unsyncedUsers = await UserModel.find({
    _id: { $nin: syncedUserIds },
  })
    .select('_id')
    .lean();

  let synced = 0;
  let failed = 0;

  for (const user of unsyncedUsers) {
    try {
      await syncContact((user as any)._id.toString());
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function searchXeroContact(
  accessToken: string,
  tenantId: string,
  field: string,
  value: string,
): Promise<Record<string, unknown> | null> {
  const where =
    field === 'Phones' ? `Phones.Any(Phone.PhoneNumber=="${value}")` : `${field}=="${value}"`;

  const res = await fetch(
    `https://api.xero.com/api.xro/2.0/Contacts?where=${encodeURIComponent(where)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { Contacts: Array<Record<string, unknown>> };
  return data.Contacts?.[0] ?? null;
}

function buildContactPayload(user: Record<string, any>): Record<string, unknown> {
  const contact: Record<string, unknown> = {
    Name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    EmailAddress: user.email,
    FirstName: user.firstName,
    LastName: user.lastName,
  };

  if (user.mobile) {
    contact.Phones = [
      {
        PhoneType: 'MOBILE',
        PhoneNumber: user.mobile,
      },
    ];
  }

  if (user.address) {
    contact.Addresses = [
      {
        AddressType: 'STREET',
        AddressLine1: user.address.street,
        City: user.address.suburb,
        Region: user.address.state,
        PostalCode: user.address.postcode,
        Country: 'Australia',
      },
    ];
  }

  return contact;
}
