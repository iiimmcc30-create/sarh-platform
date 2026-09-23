/** Days before soft-deleted rows are hard-purged by the cleanup job. */
export const SOFT_DELETE_RETENTION_DAYS = 90;

/** Prisma filter: row is not soft-deleted. */
export const notDeleted = { deletedAt: null } as const;

export function softDeleteFields() {
  return { deletedAt: new Date() };
}

export function retentionCutoff(days = SOFT_DELETE_RETENTION_DAYS): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
