import { SYSTEM_TIMELINE_ACTOR_LABEL } from './helpers/timeline';
import type { ApplicationWithRelations } from './types';
import type { ApplicationSummaryEntity } from './repositories/application.repository';
import type {
  ApplicationDetailDto,
  ApplicationSummaryDto,
  AdminApplicationSummaryDto,
  DocumentDto,
  TimelineEventDto,
} from './types';
import { resolveAdminDocumentFileUrl } from './helpers/documentUrl';

function toDocumentDto(
  doc: ApplicationWithRelations['documents'][number],
  includeAdminNotes: boolean,
): DocumentDto {
  const hideNotes = !includeAdminNotes && doc.status !== 'REJECTED';
  return {
    id: doc.id,
    type: doc.type,
    fileKey: doc.fileKey,
    status: doc.status,
    notes: hideNotes ? null : doc.notes,
    originalFileName: doc.originalFileName,
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    verifiedBy: doc.verifiedBy,
    verifiedAt: doc.verifiedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toTimelineDto(
  event: ApplicationWithRelations['timelineEvents'][number],
): TimelineEventDto {
  return {
    id: event.id,
    action: event.action,
    comment: event.comment,
    createdBy: event.createdBy,
    actorUsername: event.actor?.username ?? SYSTEM_TIMELINE_ACTOR_LABEL,
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

export function toApplicationSummaryFromEntity(
  app: ApplicationSummaryEntity,
): ApplicationSummaryDto {
  return {
    id: app.id,
    applicationNumber: app.applicationNumber,
    status: app.status,
    nameAr: app.nameAr,
    nameEn: app.nameEn,
    country: app.country,
    city: app.city,
    submittedAt: app.submittedAt,
    approvedAt: app.approvedAt,
    rejectedAt: app.rejectedAt,
    withdrawnAt: app.withdrawnAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    provisionedButcherId: app.sourcedButcher?.id ?? null,
    provisionedButcherUserId: app.sourcedButcher?.userId ?? null,
    accountUsername: app.accountUsername ?? null,
    accountEmail: app.accountEmail ?? null,
  };
}

export function toApplicationSummary(
  app: ApplicationWithRelations,
): ApplicationSummaryDto {
  return {
    id: app.id,
    applicationNumber: app.applicationNumber,
    status: app.status,
    nameAr: app.nameAr,
    nameEn: app.nameEn,
    country: app.country,
    city: app.city,
    submittedAt: app.submittedAt,
    approvedAt: app.approvedAt,
    rejectedAt: app.rejectedAt,
    withdrawnAt: app.withdrawnAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    provisionedButcherId: app.sourcedButcher?.id ?? null,
    provisionedButcherUserId: app.sourcedButcher?.userId ?? null,
    accountUsername: app.accountUsername ?? null,
    accountEmail: app.accountEmail ?? null,
  };
}

export function toApplicationDetail(
  app: ApplicationWithRelations,
  options: { includeAdminFields?: boolean; includeUser?: boolean } = {},
): ApplicationDetailDto {
  const includeAdmin = options.includeAdminFields ?? false;
  const summary = toApplicationSummary(app);

  return {
    ...summary,
    shopPhone: app.shopPhone,
    commercialReg: app.commercialReg,
    cityAr: app.cityAr,
    address: app.address,
    addressAr: app.addressAr,
    lat: app.lat,
    lng: app.lng,
    bioAr: app.bioAr,
    bioEn: app.bioEn,
    specialties: app.specialties,
    openTime: app.openTime,
    closeTime: app.closeTime,
    rejectionReason: app.rejectionReason,
    acceptedTermsAt: app.acceptedTermsAt,
    documents: app.documents.map((d) => toDocumentDto(d, includeAdmin)),
    timeline: app.timelineEvents.map(toTimelineDto),
    ...(options.includeUser && app.user
      ? {
          user: {
            id: app.user.id,
            username: app.user.username,
            phone: app.user.phone,
            avatar: app.user.avatar,
            email: app.user.email,
            displayName: app.user.displayName,
            arabicName: app.user.arabicName,
            role: app.user.role,
          },
        }
      : {}),
  };
}

export function toAdminApplicationSummary(
  app: ApplicationWithRelations,
): AdminApplicationSummaryDto {
  const pendingDocumentCount = app.documents.filter(
    (d) => d.status === 'UPLOADED',
  ).length;
  return {
    ...toApplicationSummary(app),
    user: {
      id: app.user!.id,
      username: app.user!.username,
      phone: app.user!.phone,
      avatar: app.user!.avatar,
      email: app.user!.email,
      displayName: app.user!.displayName,
      arabicName: app.user!.arabicName,
      role: app.user!.role,
    },
    documentCount: app.documents.length,
    pendingDocumentCount,
  };
}

export function toDocumentDtoPublic(
  doc: ApplicationWithRelations['documents'][number],
  includeAdminNotes = false,
): DocumentDto {
  return toDocumentDto(doc, includeAdminNotes);
}

export async function withAdminDocumentUrls(
  dto: ApplicationDetailDto,
): Promise<ApplicationDetailDto> {
  const documents = await Promise.all(
    dto.documents.map(async (doc) => ({
      ...doc,
      fileUrl: await resolveAdminDocumentFileUrl(doc.fileKey, doc.mimeType),
    })),
  );
  return { ...dto, documents };
}

export function toTimelineEventDto(
  event: ApplicationWithRelations['timelineEvents'][number],
): TimelineEventDto {
  return toTimelineDto(event);
}
