import sharp from 'sharp';

describe('sharp 0.35 image processing', () => {
  async function sample(format: 'jpeg' | 'png' | 'webp') {
    return sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .toFormat(format)
      .toBuffer();
  }

  it.each(['jpeg', 'png', 'webp'] as const)(
    'resizes and converts %s without API breakage',
    async (format) => {
      const input = await sample(format);
      const out = await sharp(input)
        .resize(32, 32, { fit: 'cover' })
        .toFormat('webp')
        .toBuffer();
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(32);
      expect(meta.height).toBe(32);
    },
  );
});
