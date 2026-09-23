import type {
  ButcherApplication,
  ButcherApplicationDocument,
  ButcherApplicationDocumentType,
  ButcherApplicationStatus,
  ButcherApplicationTimelineEvent,
  Country,
  Prisma,
} from '@prisma/client';
import type { AdminSortOption } from './constants';

export type ApplicationSnapshotInput = {
  nameAr?: string;
  nameEn?: string;
  shopPhone?: string;
  commercialReg?: string;
  country?: Country;
  city?: string;
  cityAr?: string;
  address?: string;
  addressAr?: string;
  lat?: number;
  lng?: number;
  bioAr?: string;
  bioEn?: string;
  specialties?: string[];
  openTime?: string;
  closeTime?: string;
};

export type SubmitInput = {
  acceptedTerms: boolean;
  confirmAccuracy: boolean;
  accountUsername: string;
  accountEmail?: string;
  password: string;
  confirmPassword: string;
};

export type WithdrawInput = {
  reason?: string;
};

export type DocumentUploadInput = {
  type: ButcherApplicationDocumentType;
  fileKey: string;
  originalFileName?: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type DocumentReplaceInput = {
  fileKey: string;
  originalFileName?: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type ApproveInput = {
  comment?: string;
};

export type RejectInput = {
  rejectionReason: string;
  comment?: string;
};

export type CommentInput = {
  comment: string;
};

export type UserListQuery = {
  cursor?: string;
  status?: ButcherApplicationStatus;
  limit?: number;
};

export type AdminListQuery = {
  cursor?: string;
  limit?: number;
  status?: ButcherApplicationStatus;
  country?: Country;
  submittedFrom?: Date;
  submittedTo?: Date;
  search?: string;
  sort?: AdminSortOption;
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ApplicationWithRelations = ButcherApplication & {
  documents: ButcherApplicationDocument[];
  timelineEvents: (ButcherApplicationTimelineEvent & {
    actor: { id: string; username: string } | null;
  })[];
  sourcedButcher: { id: string; userId: string } | null;
  user?: {
    id: string;
    username: string;
    phone: string | null;
    avatar: string | null;
    email?: string | null;
    displayName?: string | null;
    arabicName?: string | null;
    role?: string | null;
  };
};

export type ApplicationSummaryDto = {
  id: string;
  applicationNumber: number;
  status: ButcherApplicationStatus;
  nameAr: string | null;
  nameEn: string | null;
  country: Country | null;
  city: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  provisionedButcherId: string | null;
  provisionedButcherUserId: string | null;
  accountUsername: string | null;
  accountEmail: string | null;
};

export type ApplicationDetailDto = ApplicationSummaryDto & {
  shopPhone: string | null;
  commercialReg: string | null;
  cityAr: string | null;
  address: string | null;
  addressAr: string | null;
  lat: number | null;
  lng: number | null;
  bioAr: string | null;
  bioEn: string | null;
  specialties: string[];
  openTime: string;
  closeTime: string;
  rejectionReason: string | null;
  acceptedTermsAt: Date | null;
  documents: DocumentDto[];
  timeline: TimelineEventDto[];
  user?: {
    id: string;
    username: string;
    phone: string | null;
    avatar?: string | null;
    email?: string | null;
    displayName?: string | null;
    arabicName?: string | null;
    role?: string | null;
  };
};

export type DocumentDto = {
  id: string;
  type: ButcherApplicationDocumentType;
  fileKey: string | null;
  fileUrl?: string | null;
  status: ButcherApplicationDocument['status'];
  notes: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TimelineEventDto = {
  id: string;
  action: ButcherApplicationTimelineEvent['action'];
  comment: string | null;
  createdBy: string | null;
  actorUsername: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type AdminApplicationSummaryDto = ApplicationSummaryDto & {
  user: {
    id: string;
    username: string;
    phone: string | null;
    avatar: string | null;
    email?: string | null;
    displayName?: string | null;
    arabicName?: string | null;
    role?: string | null;
  };
  documentCount: number;
  pendingDocumentCount: number;
};

export type ApproveResultDto = {
  application: ApplicationDetailDto;
  butcher: { id: string; sourceApplicationId: string | null };
};
