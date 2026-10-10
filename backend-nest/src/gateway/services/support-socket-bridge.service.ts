import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';

/**
 * The REST API and the Socket.IO server are different processes. A support
 * turn finished after the HTTP response publishes a ticket id (no message
 * text) so the open screen can refetch, the same way it does on support:message.
 */
export const SUPPORT_EMIT_CHANNEL = 'socket:support-emit';

const TICKET_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SupportEmitMessage = { ticketId: string };

export function isValidSupportEmit(msg: unknown): msg is SupportEmitMessage {
  if (!msg || typeof msg !== 'object') return false;
  const id = (msg as { ticketId?: unknown }).ticketId;
  return typeof id === 'string' && TICKET_ID_RE.test(id);
}

@Injectable()
export class SupportSocketBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private pub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    this.pub = getSharedRedisClient(3, 'default');
    if (this.pub.status === 'wait') {
      this.pub.connect().catch(() => {
        this.logger.warn({}, 'Support bridge pub client unavailable');
      });
    }
  }

  onModuleDestroy() {
    this.pub = null;
  }

  /** Ask clients in the ticket room to refetch. Never sends message text. */
  notify(ticketId: string): void {
    if (!isValidSupportEmit({ ticketId })) return;
    const server = this.emitService.getServer();
    if (server) {
      server.to(`support:${ticketId}`).emit('support:message', { ticketId });
      return;
    }
    if (this.pub?.status !== 'ready') return;
    void this.pub.publish(
      SUPPORT_EMIT_CHANNEL,
      JSON.stringify({ ticketId } satisfies SupportEmitMessage),
    );
  }
}
