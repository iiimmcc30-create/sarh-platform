import { Injectable } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { throwApi } from '../common/exceptions/api.exception';
import {
  councilIdFromRoom,
  listLivekitIdentities,
  receiveLivekitWebhook,
  streamIdFromRoom,
} from '../shared/rtc/livekit';
import { LivestreamsService } from './livestreams.service';

/**
 * LiveKit server webhooks (participant joined/left, room finished).
 * Signature is the JWT in `Authorization`, verified with the API secret.
 * Viewer counts for video rooms are taken from the LiveKit participant list
 * (host excluded). Council rooms are ignored — presence stays on the socket.
 */
@Injectable()
export class LivekitWebhookService {
  constructor(
    private readonly livestreams: LivestreamsService,
    private readonly logger: LoggerService,
  ) {}

  async handle(rawBody: string, authorization: string | undefined) {
    if (!rawBody) {
      throwApi(400, 'invalid_webhook', 'Empty webhook body');
    }
    let event: Awaited<ReturnType<typeof receiveLivekitWebhook>>;
    try {
      event = await receiveLivekitWebhook(rawBody, authorization);
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'LiveKit webhook rejected',
      );
      throwApi(401, 'invalid_webhook', 'Invalid LiveKit webhook signature');
    }

    const room = event.room?.name ?? '';
    if (!room || councilIdFromRoom(room)) return { ok: true };
    const streamId = streamIdFromRoom(room);
    if (!streamId) return { ok: true };

    try {
      if (event.event === 'room_finished') {
        await this.livestreams.endStreamBySystem(streamId);
      } else if (
        event.event === 'participant_joined' ||
        event.event === 'participant_left'
      ) {
        const identities = await listLivekitIdentities(room);
        if (identities) {
          await this.livestreams.setViewerCountFromIdentities(
            streamId,
            identities,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err), room },
        'LiveKit webhook handling failed',
      );
    }
    return { ok: true };
  }
}
