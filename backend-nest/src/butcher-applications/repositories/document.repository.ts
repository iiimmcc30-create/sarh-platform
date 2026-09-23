import { Injectable } from '@nestjs/common';
import type { ButcherApplicationDocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TransactionClient } from '../helpers/transaction';
import { ButcherApplicationError } from '../errors';
import type { DocumentUploadInput, DocumentReplaceInput } from '../types';

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient) {
    return tx ?? this.prisma;
  }

  findDocumentByIdAndApplication(
    documentId: string,
    applicationId: string,
    tx?: TransactionClient,
  ) {
    return this.client(tx).butcherApplicationDocument.findFirst({
      where: { id: documentId, applicationId },
    });
  }

  findDocumentByApplicationAndType(
    applicationId: string,
    type: ButcherApplicationDocumentType,
    tx?: TransactionClient,
  ) {
    return this.client(tx).butcherApplicationDocument.findFirst({
      where: { applicationId, type },
    });
  }

  createDocument(
    tx: TransactionClient,
    applicationId: string,
    input: DocumentUploadInput,
  ) {
    return tx.butcherApplicationDocument.create({
      data: {
        applicationId,
        type: input.type,
        fileKey: input.fileKey,
        originalFileName: input.originalFileName ?? null,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: 'UPLOADED',
      },
    });
  }

  replaceDocument(
    tx: TransactionClient,
    documentId: string,
    input: DocumentReplaceInput,
  ) {
    return tx.butcherApplicationDocument.update({
      where: { id: documentId },
      data: {
        fileKey: input.fileKey,
        originalFileName: input.originalFileName ?? null,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: 'UPLOADED',
        verifiedBy: null,
        verifiedAt: null,
        notes: null,
      },
    });
  }

  deleteDocument(tx: TransactionClient, documentId: string): Promise<void> {
    return tx.butcherApplicationDocument
      .delete({ where: { id: documentId } })
      .then(() => undefined);
  }

  approveUploadedDocuments(
    tx: TransactionClient,
    applicationId: string,
    adminUserId: string,
    now: Date,
  ): Promise<void> {
    return tx.butcherApplicationDocument
      .updateMany({
        where: { applicationId, status: 'UPLOADED' },
        data: {
          status: 'APPROVED',
          verifiedBy: adminUserId,
          verifiedAt: now,
        },
      })
      .then(() => undefined);
  }

  async getDocumentOrThrow(
    documentId: string,
    applicationId: string,
    tx?: TransactionClient,
  ) {
    const document = await this.findDocumentByIdAndApplication(
      documentId,
      applicationId,
      tx,
    );
    if (!document) {
      throw new ButcherApplicationError('DOCUMENT_NOT_FOUND');
    }
    return document;
  }
}

export type DocumentEntity =
  Prisma.ButcherApplicationDocumentGetPayload<object>;
