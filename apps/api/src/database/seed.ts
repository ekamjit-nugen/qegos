/**
 * Development seed script — populates the database with sample data for local dev.
 *
 * Usage: npx ts-node-dev apps/api/src/database/seed.ts
 *
 * Idempotent: checks for existing records before inserting.
 * Only runs in development/test environments.
 */
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config/env';
import { connectDatabase, getConnection, disconnectDatabase } from './connection';
import { createUserModel } from '../modules/user/user.model';
import { createCounterModel, getNextSequence } from './counter.model';
import { createLeadModel } from '../modules/lead-management/lead.model';
import { createLeadActivityModel } from '../modules/lead-management/leadActivity.model';
import { createOrderModel } from '../modules/order-management/order.model';
import { createSalesModel, seedSalesCatalogue } from '../modules/order-management/sales.model';
import * as rbac from '@nugen/rbac';
import * as auth from '@nugen/auth';
import * as chatEngine from '@nugen/chat-engine';
import * as supportTickets from '@nugen/support-tickets';
import * as notificationEngine from '@nugen/notification-engine';
import type { Types } from 'mongoose';

const BCRYPT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password1!';

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[SEED] ${msg}`); // eslint-disable-line no-console
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function _randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main Seed Function ────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    log('Refusing to seed production database.');
    process.exit(1);
  }

  await connectDatabase();
  const connection = getConnection();
  const redisClient = null; // Seeds don't need Redis

  // Initialize packages that create models
  const { RoleModel } = rbac.init(connection, redisClient as never);
  const UserModel = createUserModel(connection);
  const CounterModel = createCounterModel(connection);
  const LeadModel = createLeadModel(connection);
  const LeadActivityModel = createLeadActivityModel(connection);
  const OrderModel = createOrderModel(connection);
  const SalesModel = createSalesModel(connection);

  // Auth init for password hashing
  auth.init({
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtRefreshSecret: config.JWT_REFRESH_SECRET,
    jwtAccessExpiry: config.JWT_ACCESS_EXPIRY,
    jwtRefreshExpiry: config.JWT_REFRESH_EXPIRY,
    maxSessions: 5,
    otpExpiry: 300,
    otpLength: 6,
    bcryptRounds: BCRYPT_ROUNDS,
    passwordPolicy: { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: false },
    phoneRegex: /^\+61\d{9}$/,
    mfaIssuer: config.MFA_ISSUER,
  }, connection, UserModel as never);

  // Chat engine models
  const { ConversationModel, MessageModel } = chatEngine.init(connection, {
    encryptionKey: config.ENCRYPTION_KEY,
  });

  // Support ticket models
  const { TicketModel: SupportTicketModel } = supportTickets.init(connection, {
    slaConfig: {
      critical: 4 * 60,
      high: 8 * 60,
      medium: 24 * 60,
      low: 48 * 60,
    },
  });

  // Notification engine models
  const { NotificationModel } = notificationEngine.init(connection, {} as never, {} as never);

  // ─── Step 1: Seed roles ────────────────────────────────────────────────────
  log('Seeding roles...');
  await rbac.seedRoles(RoleModel);

  // ─── Step 2: Seed sales catalogue ──────────────────────────────────────────
  log('Seeding sales catalogue...');
  await seedSalesCatalogue(SalesModel);

  // ─── Step 3: Seed users ────────────────────────────────────────────────────
  log('Seeding users...');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // Fetch role IDs
  const roles = await RoleModel.find({});
  const roleMap = new Map<string, Types.ObjectId>();
  for (const r of roles) {
    roleMap.set(r.name, r._id);
  }

  const usersToSeed = [
    // Super Admin
    {
      email: 'superadmin@qegos.com.au',
      mobile: '+61400000001',
      firstName: 'System',
      lastName: 'Admin',
      userType: 0,
      roleId: roleMap.get('super_admin'),
      address: { street: '1 George Street', suburb: 'Sydney', state: 'NSW' as const, postcode: '2000', country: 'Australia' },
    },
    // Admin
    {
      email: 'admin@qegos.com.au',
      mobile: '+61400000002',
      firstName: 'Office',
      lastName: 'Admin',
      userType: 1,
      roleId: roleMap.get('admin'),
      address: { street: '10 Collins Street', suburb: 'Melbourne', state: 'VIC' as const, postcode: '3000', country: 'Australia' },
    },
    // Office Manager
    {
      email: 'manager@qegos.com.au',
      mobile: '+61400000003',
      firstName: 'Sarah',
      lastName: 'Manager',
      userType: 2,
      roleId: roleMap.get('office_manager'),
      address: { street: '5 King Street', suburb: 'Brisbane', state: 'QLD' as const, postcode: '4000', country: 'Australia' },
    },
    // Senior Staff
    {
      email: 'senior@qegos.com.au',
      mobile: '+61400000004',
      firstName: 'David',
      lastName: 'Senior',
      userType: 3,
      roleId: roleMap.get('senior_staff'),
      address: { street: '20 Rundle Mall', suburb: 'Adelaide', state: 'SA' as const, postcode: '5000', country: 'Australia' },
    },
    // Staff members
    {
      email: 'staff1@qegos.com.au',
      mobile: '+61400000005',
      firstName: 'Emma',
      lastName: 'Staff',
      userType: 4,
      roleId: roleMap.get('staff'),
      address: { street: '8 Hay Street', suburb: 'Perth', state: 'WA' as const, postcode: '6000', country: 'Australia' },
    },
    {
      email: 'staff2@qegos.com.au',
      mobile: '+61400000006',
      firstName: 'James',
      lastName: 'Preparer',
      userType: 4,
      roleId: roleMap.get('staff'),
      address: { street: '15 Liverpool Street', suburb: 'Hobart', state: 'TAS' as const, postcode: '7000', country: 'Australia' },
    },
    // Client users
    {
      email: 'john.doe@example.com',
      mobile: '+61412345678',
      firstName: 'John',
      lastName: 'Doe',
      userType: 5,
      roleId: roleMap.get('client'),
      address: { street: '42 Bondi Road', suburb: 'Bondi', state: 'NSW' as const, postcode: '2026', country: 'Australia' },
      dateOfBirth: new Date('1985-03-15'),
      gender: 'male' as const,
      maritalStatus: 'married' as const,
      referralCode: 'JOHNDOE',
    },
    {
      email: 'jane.smith@example.com',
      mobile: '+61423456789',
      firstName: 'Jane',
      lastName: 'Smith',
      userType: 5,
      roleId: roleMap.get('client'),
      address: { street: '7 Chapel Street', suburb: 'Prahran', state: 'VIC' as const, postcode: '3181', country: 'Australia' },
      dateOfBirth: new Date('1990-07-22'),
      gender: 'female' as const,
      maritalStatus: 'single' as const,
      referralCode: 'JANESMITH',
    },
    {
      email: 'mike.chen@example.com',
      mobile: '+61434567890',
      firstName: 'Mike',
      lastName: 'Chen',
      userType: 5,
      roleId: roleMap.get('client'),
      address: { street: '33 James Street', suburb: 'Fortitude Valley', state: 'QLD' as const, postcode: '4006', country: 'Australia' },
      dateOfBirth: new Date('1978-11-08'),
      gender: 'male' as const,
      maritalStatus: 'married' as const,
      preferredLanguage: 'zh',
      referralCode: 'MIKECHEN',
    },
    // Student
    {
      email: 'student@example.com',
      mobile: '+61445678901',
      firstName: 'Alex',
      lastName: 'Student',
      userType: 6,
      roleId: roleMap.get('student'),
      address: { street: '1 University Ave', suburb: 'Camperdown', state: 'NSW' as const, postcode: '2050', country: 'Australia' },
      dateOfBirth: new Date('2002-01-10'),
      college: 'University of Sydney',
      discount: 20,
    },
  ];

  const userIds: Map<string, Types.ObjectId> = new Map();

  for (const userData of usersToSeed) {
    const existing = await UserModel.findOne({ email: userData.email });
    if (existing) {
      userIds.set(userData.email!, existing._id);
      continue;
    }
    const user = await UserModel.create({
      ...userData,
      password: passwordHash,
      status: true,
      preferredLanguage: userData.preferredLanguage ?? 'en',
      preferredContact: 'sms',
      timezone: 'Australia/Sydney',
      creditBalance: 0,
      storageUsed: 0,
      storageQuota: 524288000,
      fcmTokens: [],
      isDeleted: false,
      consentRecord: {
        marketingSms: { consented: true, date: new Date(), source: 'seed' },
        marketingEmail: { consented: true, date: new Date(), source: 'seed' },
        marketingWhatsapp: { consented: false },
        marketingPush: { consented: true, date: new Date(), source: 'seed' },
      },
    });
    userIds.set(userData.email!, user._id);
  }

  log(`  ${userIds.size} users ready.`);

  // ─── Step 4: Seed leads ────────────────────────────────────────────────────
  log('Seeding leads...');

  const staffId = userIds.get('staff1@qegos.com.au')!;
  const seniorId = userIds.get('senior@qegos.com.au')!;
  const salesItems = await SalesModel.find({ isActive: true }).limit(4);

  const leadsToSeed = [
    {
      source: 'phone_inbound' as const,
      firstName: 'Robert',
      lastName: 'Wilson',
      mobile: '+61411111111',
      email: 'robert.w@example.com',
      suburb: 'Parramatta',
      state: 'NSW' as const,
      postcode: '2150',
      financialYear: '2025-2026',
      status: 1,
      priority: 'hot' as const,
      score: 85,
      assignedTo: staffId,
      estimatedValue: 49500,
      serviceInterest: salesItems.slice(0, 2).map((s) => s._id),
    },
    {
      source: 'website' as const,
      firstName: 'Lisa',
      lastName: 'Nguyen',
      mobile: '+61422222222',
      email: 'lisa.n@example.com',
      suburb: 'Box Hill',
      state: 'VIC' as const,
      postcode: '3128',
      financialYear: '2025-2026',
      status: 3,
      priority: 'warm' as const,
      score: 62,
      assignedTo: seniorId,
      estimatedValue: 35000,
      serviceInterest: salesItems.slice(1, 3).map((s) => s._id),
    },
    {
      source: 'referral' as const,
      firstName: 'Ahmed',
      lastName: 'Hassan',
      mobile: '+61433333333',
      email: 'ahmed.h@example.com',
      suburb: 'Bankstown',
      state: 'NSW' as const,
      postcode: '2200',
      financialYear: '2025-2026',
      status: 5,
      priority: 'hot' as const,
      score: 92,
      assignedTo: staffId,
      estimatedValue: 75000,
      referralCode: 'JOHNDOE',
    },
    {
      source: 'social_media' as const,
      firstName: 'Priya',
      lastName: 'Patel',
      mobile: '+61444444444',
      suburb: 'Sunnybank',
      state: 'QLD' as const,
      postcode: '4109',
      financialYear: '2025-2026',
      status: 2,
      priority: 'cold' as const,
      score: 30,
      estimatedValue: 22000,
      preferredLanguage: 'hi',
    },
    {
      source: 'google_ads' as const,
      firstName: 'Tom',
      lastName: 'Baker',
      mobile: '+61455555555',
      email: 'tom.b@example.com',
      suburb: 'Fremantle',
      state: 'WA' as const,
      postcode: '6160',
      financialYear: '2025-2026',
      status: 8,
      priority: 'hot' as const,
      score: 98,
      assignedTo: seniorId,
      estimatedValue: 55000,
      isConverted: true,
    },
  ];

  const leadIds: Types.ObjectId[] = [];

  for (const leadData of leadsToSeed) {
    const existing = await LeadModel.findOne({ mobile: leadData.mobile });
    if (existing) {
      leadIds.push(existing._id);
      continue;
    }
    const leadNumber = `QGS-L-${String(await getNextSequence(CounterModel, 'lead')).padStart(4, '0')}`;
    const lead = await LeadModel.create({ ...leadData, leadNumber });
    leadIds.push(lead._id);
  }

  log(`  ${leadIds.length} leads ready.`);

  // ─── Step 5: Seed lead activities ──────────────────────────────────────────
  log('Seeding lead activities...');

  const activityCount = await LeadActivityModel.countDocuments();
  if (activityCount === 0) {
    const activities = [
      { leadId: leadIds[0], type: 'call', subject: 'Initial enquiry call', description: 'Client called about individual tax return. Has PAYG summary and deductions.', outcome: 'positive', sentiment: 'interested', callDuration: 12, callDirection: 'inbound', performedBy: staffId },
      { leadId: leadIds[0], type: 'sms', subject: 'Follow-up SMS', description: 'Sent pricing info and booking link.', outcome: 'positive', performedBy: staffId },
      { leadId: leadIds[1], type: 'email', subject: 'Web enquiry follow-up', description: 'Responded to website contact form about business tax returns.', outcome: 'neutral', performedBy: seniorId },
      { leadId: leadIds[2], type: 'call', subject: 'Referral introduction', description: 'Referred by John Doe. Needs help with rental property deductions.', outcome: 'positive', sentiment: 'interested', callDuration: 18, callDirection: 'outbound', performedBy: staffId },
      { leadId: leadIds[3], type: 'whatsapp', subject: 'WhatsApp follow-up', description: 'Sent message in Hindi about student tax return services.', outcome: 'no_answer', performedBy: staffId },
    ];

    for (const act of activities) {
      await LeadActivityModel.create(act);
    }
    log(`  ${activities.length} activities created.`);
  }

  // ─── Step 6: Seed orders ───────────────────────────────────────────────────
  log('Seeding orders...');

  const clientJohn = userIds.get('john.doe@example.com')!;
  const clientJane = userIds.get('jane.smith@example.com')!;
  const clientMike = userIds.get('mike.chen@example.com')!;
  const clientAlex = userIds.get('student@example.com')!;

  const ordersToSeed = [
    {
      userId: clientJohn,
      financialYear: '2024-2025',
      status: 8, // Assessed
      lineItems: salesItems.slice(0, 2).map((s) => ({
        salesId: s._id,
        title: s.title,
        price: s.price,
        quantity: 1,
        priceAtCreation: s.price,
        completionStatus: 'completed',
        completedAt: daysAgo(30),
      })),
      personalDetails: { firstName: 'John', lastName: 'Doe', mobile: '+61412345678', email: 'john.doe@example.com' },
      processingBy: staffId,
      eFileStatus: 'assessed',
      noaReceived: true,
      noaDate: daysAgo(15),
    },
    {
      userId: clientJane,
      financialYear: '2025-2026',
      status: 4, // In Progress
      lineItems: salesItems.slice(0, 1).map((s) => ({
        salesId: s._id,
        title: s.title,
        price: s.price,
        quantity: 1,
        priceAtCreation: s.price,
        completionStatus: 'in_progress',
      })),
      personalDetails: { firstName: 'Jane', lastName: 'Smith', mobile: '+61423456789', email: 'jane.smith@example.com' },
      processingBy: seniorId,
    },
    {
      userId: clientMike,
      financialYear: '2025-2026',
      status: 1, // Pending
      lineItems: salesItems.slice(0, 3).map((s) => ({
        salesId: s._id,
        title: s.title,
        price: s.price,
        quantity: 1,
        priceAtCreation: s.price,
        completionStatus: 'not_started',
      })),
      personalDetails: { firstName: 'Mike', lastName: 'Chen', mobile: '+61434567890', email: 'mike.chen@example.com' },
    },
    {
      userId: clientAlex,
      financialYear: '2025-2026',
      status: 2, // Documents Received
      lineItems: salesItems.slice(0, 1).map((s) => ({
        salesId: s._id,
        title: s.title,
        price: Math.round(s.price * 0.8), // 20% student discount
        quantity: 1,
        priceAtCreation: Math.round(s.price * 0.8),
        completionStatus: 'not_started',
      })),
      personalDetails: { firstName: 'Alex', lastName: 'Student', mobile: '+61445678901', email: 'student@example.com' },
      discountPercent: 20,
    },
  ];

  const orderIds: Types.ObjectId[] = [];

  for (const orderData of ordersToSeed) {
    const existing = await OrderModel.findOne({ userId: orderData.userId, financialYear: orderData.financialYear });
    if (existing) {
      orderIds.push(existing._id);
      continue;
    }
    const orderNumber = `QGS-O-${String(await getNextSequence(CounterModel, 'order')).padStart(4, '0')}`;
    const order = await OrderModel.create({ ...orderData, orderNumber });
    orderIds.push(order._id);
  }

  log(`  ${orderIds.length} orders ready.`);

  // ─── Step 7: Seed chat conversations ───────────────────────────────────────
  log('Seeding chat conversations...');

  const chatCount = await ConversationModel.countDocuments();
  if (chatCount === 0) {
    const convo1 = await ConversationModel.create({
      userId: clientJohn,
      staffId,
      status: 'active',
      subject: 'Question about deductions',
      lastMessageAt: daysAgo(1),
      lastMessagePreview: 'Thanks for the info!',
      unreadCountUser: 0,
      unreadCountStaff: 1,
    });

    await MessageModel.create([
      { conversationId: convo1._id, senderId: clientJohn, senderType: 'client', type: 'text', content: 'Hi, can I claim work-from-home expenses for this financial year?', isRead: true, readAt: daysAgo(2), createdAt: daysAgo(2) },
      { conversationId: convo1._id, senderId: staffId, senderType: 'staff', type: 'text', content: 'Yes! Under the revised fixed-rate method, you can claim 67 cents per hour for WFH expenses. You\'ll need a record of hours worked from home.', isRead: true, readAt: daysAgo(1), createdAt: daysAgo(2) },
      { conversationId: convo1._id, senderId: clientJohn, senderType: 'client', type: 'text', content: 'Thanks for the info!', isRead: false, createdAt: daysAgo(1) },
    ]);

    const convo2 = await ConversationModel.create({
      userId: clientJane,
      staffId: seniorId,
      status: 'active',
      subject: 'Document upload help',
      lastMessageAt: daysAgo(0),
      lastMessagePreview: 'I\'ll upload the PAYG summary now',
      unreadCountUser: 1,
      unreadCountStaff: 0,
    });

    await MessageModel.create([
      { conversationId: convo2._id, senderId: clientJane, senderType: 'client', type: 'text', content: 'I\'m having trouble uploading my PAYG summary. What format should it be?', isRead: true, readAt: daysAgo(0), createdAt: daysAgo(1) },
      { conversationId: convo2._id, senderId: seniorId, senderType: 'staff', type: 'text', content: 'We accept PDF, JPG, and PNG. The file must be under 10MB. Could you try again?', isRead: true, readAt: daysAgo(0), createdAt: daysAgo(0) },
      { conversationId: convo2._id, senderId: clientJane, senderType: 'client', type: 'text', content: 'I\'ll upload the PAYG summary now', isRead: true, readAt: daysAgo(0), createdAt: daysAgo(0) },
    ]);

    log('  2 conversations with messages created.');
  }

  // ─── Step 8: Seed support tickets ──────────────────────────────────────────
  log('Seeding support tickets...');

  const ticketCount = await SupportTicketModel.countDocuments();
  if (ticketCount === 0) {
    await SupportTicketModel.create([
      {
        ticketNumber: 'QGS-TKT-0001',
        userId: clientJohn,
        orderId: orderIds[0],
        category: 'billing',
        priority: 'medium',
        status: 'open',
        source: 'chat',
        subject: 'Invoice discrepancy',
        description: 'The invoice amount doesn\'t match the quoted price. I was quoted $495 but invoiced $550.',
        ticketMessages: [
          { senderId: clientJohn, senderType: 'client', content: 'Hi, my invoice doesn\'t match the quote I received.', createdAt: daysAgo(3) },
          { senderId: staffId, senderType: 'staff', content: 'I\'ll review this and get back to you within 24 hours.', createdAt: daysAgo(2) },
        ],
        assignedTo: staffId,
        slaDeadline: daysAgo(-1), // 1 day from now
      },
      {
        ticketNumber: 'QGS-TKT-0002',
        userId: clientMike,
        category: 'general',
        priority: 'low',
        status: 'resolved',
        source: 'portal',
        subject: 'How to change preferred language',
        description: 'I want to receive notifications in Chinese.',
        ticketMessages: [
          { senderId: clientMike, senderType: 'client', content: '我想用中文接收通知', createdAt: daysAgo(7) },
          { senderId: staffId, senderType: 'staff', content: 'I\'ve updated your language preference to Chinese. You should now receive notifications in Chinese.', createdAt: daysAgo(6) },
        ],
        assignedTo: staffId,
        resolvedBy: staffId,
        resolvedAt: daysAgo(6),
      },
    ]);
    log('  2 support tickets created.');
  }

  // ─── Step 9: Seed notifications ────────────────────────────────────────────
  log('Seeding notifications...');

  const notifCount = await NotificationModel.countDocuments();
  if (notifCount === 0) {
    await NotificationModel.create([
      { recipientId: clientJohn, recipientType: 'client', type: 'order_status', title: 'Tax Return Assessed', body: 'Your FY2024-25 tax return has been assessed by the ATO. Your refund of $2,847 is on its way!', channels: ['push', 'email'], isRead: true, readAt: daysAgo(10), relatedResource: 'Order', relatedResourceId: orderIds[0] },
      { recipientId: clientJane, recipientType: 'client', type: 'document_request', title: 'Documents Required', body: 'Please upload your PAYG summary and private health insurance statement for FY2025-26.', channels: ['push', 'sms'], isRead: false, relatedResource: 'Order', relatedResourceId: orderIds[1] },
      { recipientId: clientMike, recipientType: 'client', type: 'appointment_reminder', title: 'Appointment Tomorrow', body: 'Reminder: You have a phone consultation scheduled for tomorrow at 2:00 PM AEST.', channels: ['push'], isRead: false },
      { recipientId: clientAlex, recipientType: 'client', type: 'payment_received', title: 'Payment Confirmed', body: 'We\'ve received your payment of $396.00 for the Student Tax Return package.', channels: ['email'], isRead: true, readAt: daysAgo(5) },
    ]);
    log('  4 notifications created.');
  }

  // ─── Done ──────────────────────────────────────────────────────────────────
  log('Seed complete!');
  log('');
  log('Login credentials (all users):');
  log(`  Password: ${DEFAULT_PASSWORD}`);
  log('');
  log('Staff accounts:');
  log('  superadmin@qegos.com.au  (Super Admin)');
  log('  admin@qegos.com.au       (Admin)');
  log('  manager@qegos.com.au     (Office Manager)');
  log('  senior@qegos.com.au      (Senior Staff)');
  log('  staff1@qegos.com.au      (Staff)');
  log('  staff2@qegos.com.au      (Staff)');
  log('');
  log('Client accounts:');
  log('  john.doe@example.com     (Client)');
  log('  jane.smith@example.com   (Client)');
  log('  mike.chen@example.com    (Client)');
  log('  student@example.com      (Student)');

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('[SEED] Failed:', err); // eslint-disable-line no-console
  process.exit(1);
});
