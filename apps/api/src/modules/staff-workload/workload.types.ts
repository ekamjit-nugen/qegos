import type { Model } from 'mongoose';
import type { RequestHandler } from 'express';
import type { CheckPermissionFn } from '@nugen/rbac';

// ─── Scoring Weights ────────────────────────────────────────────────────────

/**
 * Default weights for workload scoring.
 * Lower total score = less loaded = preferred for assignment.
 * Each factor contributes: count * weight.
 */
export const DEFAULT_WEIGHTS: WorkloadWeights = {
  activeLeads: 1.0,
  ordersInProgress: 2.0,        // orders are heavier than leads
  pendingReviews: 1.5,
  openTickets: 0.8,
  upcomingAppointments: 1.2,    // within next 48h
};

export interface WorkloadWeights {
  activeLeads: number;
  ordersInProgress: number;
  pendingReviews: number;
  openTickets: number;
  upcomingAppointments: number;
}

/** Max capacity per factor — staff at or above this are ineligible */
export const DEFAULT_CAPACITY: WorkloadCapacity = {
  maxLeads: 50,
  maxOrders: 30,
  maxReviews: 20,
  maxTickets: 25,
  maxAppointmentsPerDay: 8,
};

export interface WorkloadCapacity {
  maxLeads: number;
  maxOrders: number;
  maxReviews: number;
  maxTickets: number;
  maxAppointmentsPerDay: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface WorkloadConfig {
  weights?: Partial<WorkloadWeights>;
  capacity?: Partial<WorkloadCapacity>;
  /** Staff userTypes eligible for assignment (default: admin, staff, office_manager, senior_staff) */
  eligibleUserTypes?: number[];
}

export const DEFAULT_ELIGIBLE_USER_TYPES = [1, 3, 5, 6]; // admin, staff, office_manager, senior_staff

// ─── Workload Snapshot ──────────────────────────────────────────────────────

export interface StaffWorkloadSnapshot {
  staffId: string;
  name: string;
  email: string;
  userType: number;
  activeLeads: number;
  ordersInProgress: number;
  pendingReviews: number;
  openTickets: number;
  upcomingAppointments: number;
  workloadScore: number;
  isAtCapacity: boolean;
  capacityBreaches: string[]; // which factors are at max
}

// ─── Assignment Types ───────────────────────────────────────────────────────

export type AssignmentContext =
  | 'lead'
  | 'order'
  | 'review'
  | 'ticket'
  | 'appointment';

export interface AssignmentRequest {
  context: AssignmentContext;
  /** Exclude specific staff (e.g., preparerId for review self-block) */
  excludeStaffIds?: string[];
  /** Require specific userTypes (e.g., senior for complex reviews) */
  requiredUserTypes?: number[];
  /** Prefer staff with specific skills/tags */
  preferredSkills?: string[];
}

export interface AssignmentResult {
  staffId: string;
  name: string;
  workloadScore: number;
  reason: string;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface WorkloadRouteDeps {
  UserModel: Model<any>;
  LeadModel: Model<any>;
  OrderModel: Model<any>;
  ReviewAssignmentModel: Model<any>;
  SupportTicketModel: Model<any>;
  AppointmentModel: Model<any>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
  config?: WorkloadConfig;
}
