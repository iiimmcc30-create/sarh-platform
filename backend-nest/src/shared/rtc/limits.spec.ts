import {
  clusterViewerCap,
  decideViewerAdmission,
  getRtcLimits,
  shouldAutostartHls,
} from './limits';

const base = {
  roomViewers: 0,
  clusterViewers: 0,
  hlsUrl: null,
  hlsStartable: false,
  alreadyInRoom: false,
};

describe('rtc limits', () => {
  it('reads limits from env with safe defaults', () => {
    expect(getRtcLimits({})).toEqual({
      maxViewersPerRoom: 250,
      maxCouncilParticipants: 200,
      maxParticipantsPerNode: 0,
      nodeCount: 1,
    });
    expect(
      getRtcLimits({
        LIVEKIT_MAX_VIEWERS_PER_ROOM: '100',
        LIVEKIT_MAX_PARTICIPANTS_PER_NODE: '400',
        LIVEKIT_NODE_COUNT: '3',
        LIVEKIT_MAX_COUNCIL_PARTICIPANTS: 'abc',
      }),
    ).toMatchObject({
      maxViewersPerRoom: 100,
      maxParticipantsPerNode: 400,
      nodeCount: 3,
      maxCouncilParticipants: 200,
    });
  });

  it('cluster cap is per-node x nodes, or off', () => {
    expect(
      clusterViewerCap({
        ...getRtcLimits({}),
        maxParticipantsPerNode: 400,
        nodeCount: 3,
      }),
    ).toBe(1200);
    expect(clusterViewerCap(getRtcLimits({}))).toBe(0);
  });

  it('admits via WebRTC below the caps', () => {
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 249,
        limits: getRtcLimits({}),
      }),
    ).toEqual({ mode: 'webrtc' });
  });

  it('sends viewers to HLS at the room cap when a playlist exists', () => {
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 250,
        hlsUrl: 'https://cdn/x.m3u8',
        limits: getRtcLimits({}),
      }),
    ).toEqual({ mode: 'hls', hlsUrl: 'https://cdn/x.m3u8' });
  });

  it('reports room_full (and whether HLS can be started) without a playlist', () => {
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 300,
        hlsStartable: true,
        limits: getRtcLimits({}),
      }),
    ).toEqual({ mode: 'full', reason: 'room_full', hlsStartable: true });
  });

  it('enforces the cluster budget even when the room has space', () => {
    const limits = getRtcLimits({
      LIVEKIT_MAX_PARTICIPANTS_PER_NODE: '100',
      LIVEKIT_NODE_COUNT: '2',
    });
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 5,
        clusterViewers: 200,
        limits,
      }),
    ).toEqual({ mode: 'full', reason: 'cluster_full', hlsStartable: false });
  });

  it('never bounces a viewer already in the room', () => {
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 999,
        alreadyInRoom: true,
        limits: getRtcLimits({}),
      }),
    ).toEqual({ mode: 'webrtc' });
  });

  it('0 disables the per-room cap', () => {
    expect(
      decideViewerAdmission({
        ...base,
        roomViewers: 100000,
        limits: getRtcLimits({ LIVEKIT_MAX_VIEWERS_PER_ROOM: '0' }),
      }),
    ).toEqual({ mode: 'webrtc' });
  });

  it('autostarts HLS only when a threshold is configured and reached', () => {
    expect(shouldAutostartHls(500, {})).toBe(false);
    expect(shouldAutostartHls(99, { LIVE_HLS_AUTOSTART_VIEWERS: '100' })).toBe(
      false,
    );
    expect(shouldAutostartHls(100, { LIVE_HLS_AUTOSTART_VIEWERS: '100' })).toBe(
      true,
    );
  });
});
