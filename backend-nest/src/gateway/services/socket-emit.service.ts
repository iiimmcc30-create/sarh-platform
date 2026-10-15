import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { maskBadgesForRealtime } from '../../subscriptions/visibility/badge-visibility.service';

@Injectable()
export class SocketEmitService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, maskBadgesForRealtime(data, userId));
  }

  emitToThread(threadId: string, event: string, data: unknown): void {
    this.server?.to(`thread:${threadId}`).emit(event, maskBadgesForRealtime(data));
  }

  emitToStream(streamId: string, event: string, data: unknown): void {
    this.server?.to(`stream:${streamId}`).emit(event, maskBadgesForRealtime(data));
  }

  emitToTicket(ticketId: string, event: string, data: unknown): void {
    this.server?.to(`support:${ticketId}`).emit(event, data);
  }

  emitToCouncil(councilId: string, event: string, data: unknown): void {
    this.server?.to(`council:${councilId}`).emit(event, maskBadgesForRealtime(data));
  }

  async disconnectUserSockets(userId: string): Promise<void> {
    if (!this.server) return;
    try {
      const room = `user:${userId}`;
      const sockets = await this.server.in(room).fetchSockets();
      for (const socket of sockets) {
        socket.disconnect(true);
      }
    } catch {
      /* non-critical */
    }
  }
}
