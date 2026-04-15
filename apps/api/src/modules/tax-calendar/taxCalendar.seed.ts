import type { Model } from 'mongoose';
import type { ITaxDeadlineDocument } from './taxCalendar.types';

/**
 * Seed 12 standard ATO deadlines for a given financial year.
 * Financial year format: "2025-2026" (July 2025 to June 2026).
 */
export async function seedTaxDeadlines(
  TaxDeadlineModel: Model<ITaxDeadlineDocument>,
  financialYear: string,
): Promise<number> {
  const [, endYear] = financialYear.split('-').map(Number);

  const deadlines: Array<Partial<ITaxDeadlineDocument>> = [
    // Individual filing deadline — October 31
    {
      title: 'Individual Tax Return Due',
      description: 'Lodge your individual tax return for the financial year',
      deadlineDate: new Date(Date.UTC(endYear, 9, 31)), // Oct 31
      type: 'individual_filing',
      applicableTo: 'individual',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 30, channel: 'email' },
        { daysBefore: 7, channel: 'sms_push' },
        { daysBefore: 1, channel: 'push' },
      ],
    },
    // BAS Quarterly — Q1: Oct 28, Q2: Feb 28, Q3: Apr 28, Q4: Jul 28
    {
      title: 'BAS Q1 (Jul–Sep)',
      description: 'Business Activity Statement for Q1',
      deadlineDate: new Date(Date.UTC(endYear, 9, 28)),
      type: 'bas_quarterly',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'BAS Q2 (Oct–Dec)',
      description: 'Business Activity Statement for Q2',
      deadlineDate: new Date(Date.UTC(endYear, 1, 28)),
      type: 'bas_quarterly',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'BAS Q3 (Jan–Mar)',
      description: 'Business Activity Statement for Q3',
      deadlineDate: new Date(Date.UTC(endYear, 3, 28)),
      type: 'bas_quarterly',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'BAS Q4 (Apr–Jun)',
      description: 'Business Activity Statement for Q4',
      deadlineDate: new Date(Date.UTC(endYear, 6, 28)),
      type: 'bas_quarterly',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    // Super Guarantee — Q1: Oct 28, Q2: Jan 28, Q3: Apr 28, Q4: Jul 28
    {
      title: 'Super Guarantee Q1 (Jul–Sep)',
      description: 'Super guarantee charge statement for Q1',
      deadlineDate: new Date(Date.UTC(endYear, 9, 28)),
      type: 'super_guarantee',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'Super Guarantee Q2 (Oct–Dec)',
      description: 'Super guarantee charge statement for Q2',
      deadlineDate: new Date(Date.UTC(endYear, 0, 28)),
      type: 'super_guarantee',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'Super Guarantee Q3 (Jan–Mar)',
      description: 'Super guarantee charge statement for Q3',
      deadlineDate: new Date(Date.UTC(endYear, 3, 28)),
      type: 'super_guarantee',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    {
      title: 'Super Guarantee Q4 (Apr–Jun)',
      description: 'Super guarantee charge statement for Q4',
      deadlineDate: new Date(Date.UTC(endYear, 6, 28)),
      type: 'super_guarantee',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    // PAYG Instalment Q1
    {
      title: 'PAYG Instalment Q1 (Jul–Sep)',
      description: 'Pay As You Go instalment for Q1',
      deadlineDate: new Date(Date.UTC(endYear, 9, 28)),
      type: 'payg_instalment',
      applicableTo: 'self_employed',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 14, channel: 'email' },
        { daysBefore: 3, channel: 'push' },
      ],
    },
    // FBT Return — May 21
    {
      title: 'Fringe Benefits Tax Return',
      description: 'FBT return due for FBT year ending 31 March',
      deadlineDate: new Date(Date.UTC(endYear, 4, 21)),
      type: 'fringe_benefits',
      applicableTo: 'business',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 30, channel: 'email' },
        { daysBefore: 7, channel: 'sms_push' },
      ],
    },
    // Tax Agent Program — extended lodgement for agents
    {
      title: 'Tax Agent Program — Extended Lodgement',
      description: 'Extended lodgement deadline for tax agent-prepared returns',
      deadlineDate: new Date(Date.UTC(endYear + 1, 4, 15)), // May 15 of following year
      type: 'individual_filing',
      applicableTo: 'all_clients',
      financialYear,
      isRecurring: true,
      reminderSchedule: [
        { daysBefore: 30, channel: 'email' },
        { daysBefore: 7, channel: 'sms_push' },
        { daysBefore: 1, channel: 'push' },
      ],
    },
  ];

  let seeded = 0;
  for (const deadline of deadlines) {
    const exists = await TaxDeadlineModel.findOne({
      title: deadline.title,
      financialYear: deadline.financialYear,
    });
    if (!exists) {
      await TaxDeadlineModel.create(deadline);
      seeded++;
    }
  }

  return seeded;
}
