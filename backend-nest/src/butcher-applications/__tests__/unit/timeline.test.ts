import {
  LEGACY_DAFTRA_CRON_ACTOR_ID,
  SYSTEM_TIMELINE_ACTOR_LABEL,
  appendTimelineEvent,
  resolveTimelineCreatedBy,
} from '../../helpers/timeline';
import { toTimelineEventDto } from '../../mappers';

describe('appendTimelineEvent', () => {
  it('creates a timeline row with a real admin actor', async () => {
    const created = {
      id: 'event-1',
      action: 'COMMENT',
      createdBy: 'user-1',
      actor: { id: 'user-1', username: 'admin' },
    };
    const create = jest.fn().mockResolvedValue(created);
    const tx = {
      butcherApplicationTimelineEvent: { create },
    };

    const result = await appendTimelineEvent(tx as never, {
      applicationId: 'app-1',
      action: 'COMMENT',
      createdBy: 'user-1',
      comment: 'note',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        applicationId: 'app-1',
        action: 'COMMENT',
        createdBy: 'user-1',
        comment: 'note',
        metadata: {},
      },
      include: {
        actor: { select: { id: true, username: true } },
      },
    });
    expect(result).toBe(created);
  });

  it('stores automated Daftra events without a User FK', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'event-sys',
      createdBy: null,
      actor: null,
    });
    const tx = {
      butcherApplicationTimelineEvent: { create },
    };

    await appendTimelineEvent(tx as never, {
      applicationId: 'app-1',
      action: 'COMMENT',
      createdBy: null,
      comment: 'daftra_product_sync',
      metadata: { kind: 'DAFTRA_PRODUCT_SYNC', automated: true },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: null,
          comment: 'daftra_product_sync',
        }),
      }),
    );
  });

  it('never writes the legacy synthetic Daftra cron id as createdBy', async () => {
    expect(resolveTimelineCreatedBy(LEGACY_DAFTRA_CRON_ACTOR_ID)).toBeNull();
    const create = jest.fn().mockResolvedValue({ id: 'e', createdBy: null });
    const tx = {
      butcherApplicationTimelineEvent: { create },
    };

    await appendTimelineEvent(tx as never, {
      applicationId: 'app-1',
      action: 'COMMENT',
      createdBy: LEGACY_DAFTRA_CRON_ACTOR_ID,
    });

    expect(create.mock.calls[0][0].data.createdBy).toBeNull();
    expect(create.mock.calls[0][0].data.createdBy).not.toBe(
      LEGACY_DAFTRA_CRON_ACTOR_ID,
    );
  });
});

describe('toTimelineEventDto', () => {
  it('keeps a real admin username', () => {
    const dto = toTimelineEventDto({
      id: 'e1',
      applicationId: 'app-1',
      action: 'COMMENT',
      comment: 'ok',
      createdBy: 'admin-1',
      metadata: {},
      createdAt: new Date(),
      actor: { id: 'admin-1', username: 'ops' },
    } as never);
    expect(dto.createdBy).toBe('admin-1');
    expect(dto.actorUsername).toBe('ops');
  });

  it('labels automated events without inventing a User id', () => {
    const dto = toTimelineEventDto({
      id: 'e2',
      applicationId: 'app-1',
      action: 'COMMENT',
      comment: 'daftra_product_sync',
      createdBy: null,
      metadata: { automated: true },
      createdAt: new Date(),
      actor: null,
    } as never);
    expect(dto.createdBy).toBeNull();
    expect(dto.actorUsername).toBe(SYSTEM_TIMELINE_ACTOR_LABEL);
  });
});
