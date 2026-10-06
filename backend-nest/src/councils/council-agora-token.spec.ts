import {
  COUNCIL_JOIN_TOKEN_EXPIRE,
  COUNCIL_SPEAKER_PUBLISH_EXPIRE,
  councilIdToChannel,
  generateCouncilToken,
  generateHostToken,
  generateViewerToken,
  isAgoraConfigured,
  streamIdToChannel,
  uidFromUserId,
} from '../shared/lib/agora';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AccessToken2 } = require('agora-token/src/AccessToken2') as {
  AccessToken2: new () => {
    from_string(t: string): void;
    services: Record<
      number,
      {
        __channel_name: unknown;
        __uid: unknown;
        __privileges: Record<number, number>;
      }
    >;
  };
};

const JOIN = 1;
const PUB_AUDIO = 2;
const PUB_VIDEO = 3;
const PUB_DATA = 4;

function decode(token: string) {
  const t = new AccessToken2();
  t.from_string(token);
  const rtc = t.services[1];
  return {
    // Unpacked strings come back as Buffers.
    __channel_name: String(rtc.__channel_name),
    __uid: String(rtc.__uid),
    __privileges: { ...rtc.__privileges },
  };
}

describe('council Agora tokens (role-based, audio only)', () => {
  const env = { ...process.env };
  const councilId = '0f8fad5b-d9cb-469f-a165-70867728950e';

  beforeEach(() => {
    process.env.AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
    process.env.AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
  });
  afterAll(() => {
    process.env = env;
  });

  it('uses a namespaced channel that never collides with live streams', () => {
    expect(councilIdToChannel(councilId)).toBe(
      'council_0f8fad5bd9cb469fa16570867728950e',
    );
    expect(councilIdToChannel(councilId)).not.toBe(
      streamIdToChannel(councilId),
    );
    expect(councilIdToChannel(councilId).length).toBeLessThan(64);
  });

  it('listener (subscriber) token grants join only', () => {
    const t = generateCouncilToken(councilId, 'user-1', 'subscriber');
    const rtc = decode(t.token);
    expect(rtc.__channel_name).toBe(councilIdToChannel(councilId));
    expect(rtc.__uid).toBe(String(uidFromUserId('user-1')));
    expect(rtc.__privileges).toEqual({ [JOIN]: COUNCIL_JOIN_TOKEN_EXPIRE });
    expect(t).toMatchObject({ role: 'subscriber', publishExpiresIn: null });
  });

  it('speaker (publisher) token grants join + short publish-audio, never video/data', () => {
    const t = generateCouncilToken(councilId, 'user-2', 'publisher');
    const rtc = decode(t.token);
    expect(rtc.__privileges[JOIN]).toBe(COUNCIL_JOIN_TOKEN_EXPIRE);
    expect(rtc.__privileges[PUB_AUDIO]).toBe(COUNCIL_SPEAKER_PUBLISH_EXPIRE);
    expect(rtc.__privileges[PUB_VIDEO]).toBeUndefined();
    expect(rtc.__privileges[PUB_DATA]).toBeUndefined();
    expect(COUNCIL_SPEAKER_PUBLISH_EXPIRE).toBe(600);
    expect(COUNCIL_JOIN_TOKEN_EXPIRE).toBe(7200);
    expect(t.publishExpiresIn).toBe(600);
  });

  it('leaves the live-stream token helpers unchanged', () => {
    const host = decode(generateHostToken(councilId, 'h').token);
    expect(host.__channel_name).toBe(streamIdToChannel(councilId));
    expect(Object.keys(host.__privileges).sort()).toEqual(['1', '2', '3', '4']);
    const viewer = decode(generateViewerToken(councilId, 'v').token);
    expect(Object.keys(viewer.__privileges)).toEqual(['1']);
  });

  it('reports missing configuration instead of crashing callers', () => {
    delete process.env.AGORA_APP_ID;
    expect(isAgoraConfigured()).toBe(false);
    expect(() => generateCouncilToken(councilId, 'u', 'subscriber')).toThrow();
  });
});
