import { z } from 'zod';
import {
  documentReplaceBodySchema,
  documentUploadBodySchema,
  listQuerySchema,
  snapshotSchema,
  submitBodySchema,
  withdrawBodySchema,
} from '../routes/schemas';

export type ListApplicationsQueryDto = z.infer<typeof listQuerySchema>;
export type CreateApplicationBodyDto = z.infer<typeof snapshotSchema>;
export type UpdateApplicationBodyDto = z.infer<typeof snapshotSchema>;
export type DocumentUploadBodyDto = z.infer<typeof documentUploadBodySchema>;
export type DocumentReplaceBodyDto = z.infer<typeof documentReplaceBodySchema>;
export type SubmitApplicationBodyDto = z.infer<typeof submitBodySchema>;
export type WithdrawApplicationBodyDto = z.infer<typeof withdrawBodySchema>;
