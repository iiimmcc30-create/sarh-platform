import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { TransactionClient } from '../helpers/transaction';

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
