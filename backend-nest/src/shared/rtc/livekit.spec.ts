import { TokenVerifier } from 'livekit-server-sdk';
import {
  councilIdFromRoom,
  councilRoomName,
  createLivekitToken,
  liveRoomName,
  receiveLivekitWebhook,
  signLivekitWebhook,
  streamIdFromRoom,
} from './livekit';

const KEY = 'devkey';
const SECRET = 'secretsecretsecretsecretsecretsecret';
const STREAM = '11111111-2222-4333-8444-555555555555';
const COUNCIL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('LiveKit tokens and rooms', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.LIVEKIT_URL = 'wss://rtc.getsarh.com';
    process.env.LIVEKIT_API_KEY = KEY;
    process.env.LIVEKIT_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('derives stable room names and parses them back', () => {
    expect(liveRoomName(STREAM)).toBe('11111111222243338444555555555555');
    expect(streamIdFromRoom(liveRoomName(STREAM))).toBe(STREAM);
    expect(councilRoomName(COUNCIL)).toBe(
      'council_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee',
    );
    expect(councilIdFromRoom(councilRoomName(COUNCIL))).toBe(COUNCIL);
    expect(streamIdFromRoom(councilRoomName(COUNCIL))).toBeNull();
    expect(councilIdFromRoom(liveRoomName(STREAM))).toBeNull();
  });

  it('host can publish camera and mic; viewer is subscribe-only', async () => {
    const host = await createLivekitToken({
      identity: 'host-1',
      room: liveRoomName(STREAM),
      ttlSeconds: 60,
      publish: 'av',
    });
    const viewer = await createLivekitToken({
      identity: 'viewer-1',
      room: liveRoomName(STREAM),
      ttlSeconds: 60,
      publish: 'none',
    });
    const verifier = new TokenVerifier(KEY, SECRET);
    const hostGrant = (await verifier.verify(host)).video;
    const viewerGrant = (await verifier.verify(viewer)).video;
    expect(hostGrant).toMatchObject({
      room: liveRoomName(STREAM),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    expect(hostGrant?.canPublishSources).toEqual([
      'camera',
      'microphone',
    ]);
    expect(viewerGrant).toMatchObject({
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
    expect(viewerGrant?.canPublishSources).toEqual([]);
  });

  it('council speakers publish microphone only', async () => {
    const speaker = await createLivekitToken({
      identity: 'speaker-1',
      room: councilRoomName(COUNCIL),
      ttlSeconds: 60,
      publish: 'audio',
    });
    const grant = (await new TokenVerifier(KEY, SECRET).verify(speaker)).video;
    expect(grant?.canPublishSources).toEqual(['microphone']);
    expect(grant?.canPublish).toBe(true);
  });

  it('rejects a webhook whose signature does not match the body', async () => {
    const body = JSON.stringify({ event: 'room_finished', room: { name: 'x' } });
    const auth = await signLivekitWebhook(body, KEY, SECRET);
    await expect(receiveLivekitWebhook(body, auth)).resolves.toMatchObject({
      event: 'room_finished',
    });
    await expect(
      receiveLivekitWebhook(body, 'not-a-token'),
    ).rejects.toThrow();
    await expect(
      receiveLivekitWebhook('{"event":"room_finished"}', auth),
    ).rejects.toThrow(/sha256/);
  });
});
