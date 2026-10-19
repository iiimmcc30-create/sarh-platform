import { LivekitWebhookService } from './livekit-webhook.service';
import { signLivekitWebhook } from '../shared/rtc/livekit';

const KEY = 'devkey';
const SECRET = 'secretsecretsecretsecretsecretsecret';
const STREAM = '11111111-2222-4333-8444-555555555555';
const ROOM = '11111111222243338444555555555555';

describe('LivekitWebhookService', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.LIVEKIT_URL = 'wss://rtc.example.test';
    process.env.LIVEKIT_API_KEY = KEY;
    process.env.LIVEKIT_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  function service(overrides?: {
    endStreamBySystem?: jest.Mock;
    setViewerCountFromIdentities?: jest.Mock;
  }) {
    const livestreams = {
      endStreamBySystem: overrides?.endStreamBySystem ?? jest.fn(),
      setViewerCountFromIdentities:
        overrides?.setViewerCountFromIdentities ?? jest.fn(),
    };
    const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    return {
      svc: new LivekitWebhookService(livestreams as never, logger as never),
      livestreams,
      logger,
    };
  }

  it('ends a live room when LiveKit reports room_finished', async () => {
    const body = JSON.stringify({
      event: 'room_finished',
      room: { name: ROOM, sid: 'RM_x' },
    });
    const auth = await signLivekitWebhook(body, KEY, SECRET);
    const { svc, livestreams } = service();
    await expect(svc.handle(body, auth)).resolves.toEqual({ ok: true });
    expect(livestreams.endStreamBySystem).toHaveBeenCalledWith(STREAM);
  });

  it('ignores council rooms', async () => {
    const body = JSON.stringify({
      event: 'room_finished',
      room: { name: 'council_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee' },
    });
    const auth = await signLivekitWebhook(body, KEY, SECRET);
    const { svc, livestreams } = service();
    await svc.handle(body, auth);
    expect(livestreams.endStreamBySystem).not.toHaveBeenCalled();
  });

  it('rejects a bad signature', async () => {
    const { svc } = service();
    await expect(
      svc.handle('{"event":"room_finished"}', 'nope'),
    ).rejects.toMatchObject({ status: 401, error: 'invalid_webhook' });
  });
});
