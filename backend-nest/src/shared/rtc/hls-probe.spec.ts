import { playlistHasSegments } from './hls-probe';

const res = (status: number, body: string) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('playlistHasSegments', () => {
  it('false for 404 / empty playlists / network errors, true once a segment is listed', async () => {
    await expect(
      playlistHasSegments('https://c/x.m3u8', res(404, '')),
    ).resolves.toBe(false);
    await expect(
      playlistHasSegments(
        'https://c/x.m3u8',
        res(200, '#EXTM3U\n#EXT-X-VERSION:3\n'),
      ),
    ).resolves.toBe(false);
    await expect(
      playlistHasSegments('https://c/x.m3u8', (async () => {
        throw new Error('dns');
      }) as never),
    ).resolves.toBe(false);
    await expect(
      playlistHasSegments(
        'https://c/x.m3u8',
        res(
          200,
          '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg_00000.ts\n',
        ),
      ),
    ).resolves.toBe(true);
  });
});
