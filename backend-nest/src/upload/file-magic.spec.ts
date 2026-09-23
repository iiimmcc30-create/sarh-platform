import { mimeMatchesMagic, sniffFileKind } from './file-magic';

describe('file-magic', () => {
  it('detects jpeg/png/gif/webp/pdf/mp4 headers', () => {
    expect(sniffFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(
      sniffFileKind(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('png');
    expect(sniffFileKind(Buffer.from('GIF89a....'))).toBe('gif');
    expect(
      sniffFileKind(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBP'),
        ]),
      ),
    ).toBe('webp');
    expect(sniffFileKind(Buffer.from('%PDF-1.4'))).toBe('pdf');
    const mp4 = Buffer.alloc(12);
    Buffer.from('ftyp').copy(mp4, 4);
    expect(sniffFileKind(mp4)).toBe('mp4');
  });

  it('rejects mismatched mime vs magic', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(mimeMatchesMagic('image/png', png)).toBe(true);
    expect(mimeMatchesMagic('image/jpeg', png)).toBe(false);
    expect(
      mimeMatchesMagic('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])),
    ).toBe(true);
  });
});
