import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import {
  councilIdToChannel,
  getAgoraConfig,
  uidFromUserId,
} from '../../shared/lib/agora';

const KICKING_RULE_URL = 'https://api.agora.io/dev/v1/kicking-rule';
const TIMEOUT_MS = 5_000;

type Privilege = 'join_channel' | 'publish_audio';

function ruleKey(councilId: string, userId: string) {
  return `council:kickrule:${councilId}:${userId}`;
}

/**
 * Optional instant enforcement through Agora's RESTful "kicking-rule" API. Active
 * only when AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET (and the app id/certificate)
 * are configured; otherwise every call is a silent no-op and enforcement relies on
 * role-based tokens (short publish privilege + server-side renewal) and the client.
 * Never throws.
 */
@Injectable()
export class CouncilAgoraModerationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly cache: RedisCacheService,
  ) {}

  private credentials(): { appId: string; auth: string } | null {
    const id = process.env.AGORA_CUSTOMER_ID?.trim();
    const secret = process.env.AGORA_CUSTOMER_SECRET?.trim();
    if (!id || !secret) return null;
    try {
      const { appId } = getAgoraConfig();
      return {
        appId,
        auth: Buffer.from(`${id}:${secret}`).toString('base64'),
      };
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    return this.credentials() !== null;
  }

  /** Removes the user from the Agora channel and blocks re-joining for `seconds`. */
  async blockJoin(councilId: string, userId: string, seconds: number) {
    await this.createRule(councilId, userId, 'join_channel', seconds);
  }

  /** Stops the user's audio publishing for `seconds` (demote / hard mute). */
  async blockPublish(councilId: string, userId: string, seconds: number) {
    await this.createRule(councilId, userId, 'publish_audio', seconds);
  }

  /** Lifts a previous publish/join rule (re-promotion / unmute / unban). */
  async lift(councilId: string, userId: string) {
    const creds = this.credentials();
    if (!creds) return;
    const key = ruleKey(councilId, userId);
    const id = await this.cache.get<number | string>(key);
    if (!id) return;
    await this.cache.del(key);
    await this.call(creds, 'DELETE', { appid: creds.appId, id });
  }

  private async createRule(
    councilId: string,
    userId: string,
    privilege: Privilege,
    seconds: number,
  ) {
    const creds = this.credentials();
    if (!creds) return;
    const body = {
      appid: creds.appId,
      cname: councilIdToChannel(councilId),
      uid: uidFromUserId(userId),
      time_in_seconds: Math.min(Math.max(Math.round(seconds), 10), 86_430),
      privileges: [privilege],
    };
    const json = await this.call(creds, 'POST', body);
    const ruleId = (json as { id?: number | string } | null)?.id;
    if (ruleId !== undefined) {
      await this.cache.set(
        ruleKey(councilId, userId),
        ruleId,
        body.time_in_seconds,
      );
    }
  }

  private async call(
    creds: { auth: string },
    method: 'POST' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(KICKING_RULE_URL, {
        method,
        headers: {
          Authorization: `Basic ${creds.auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        this.logger.warn(
          { status: res.status, method },
          'Agora kicking-rule request failed',
        );
        return null;
      }
      return json;
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err), method },
        'Agora kicking-rule request error',
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
