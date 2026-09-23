import {
  assertJoinFileAcceptable,
  assertRequiredJoinFiles,
  flattenJoinFiles,
} from '../../helpers/joinFiles';
import { ButcherApplicationError } from '../../errors';
import { MAX_DOCUMENT_FILE_BYTES } from '../../constants';

function file(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'commercial_license',
    originalname: 'license.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-1.4 test'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  };
}

describe('join file helpers', () => {
  it('flattens uploaded document fields', () => {
    const parts = flattenJoinFiles({
      commercial_license: [file()],
      national_id: [file({ originalname: 'id.jpg', mimetype: 'image/jpeg' })],
    });
    expect(parts.map((p) => p.type)).toEqual([
      'commercial_license',
      'national_id',
    ]);
  });

  it('rejects when a required document is missing', () => {
    expect(() =>
      assertRequiredJoinFiles([{ type: 'commercial_license', file: file() }]),
    ).toThrow(ButcherApplicationError);
    try {
      assertRequiredJoinFiles([{ type: 'commercial_license', file: file() }]);
    } catch (err) {
      expect(err).toMatchObject({ code: 'DOCUMENT_REQUIRED' });
    }
  });

  it('rejects unsupported mime and oversized files', () => {
    expect(() =>
      assertJoinFileAcceptable({
        type: 'commercial_license',
        file: file({ mimetype: 'text/plain', buffer: Buffer.from('hello') }),
      }),
    ).toThrow(ButcherApplicationError);
    expect(() =>
      assertJoinFileAcceptable({
        type: 'commercial_license',
        file: file({ size: MAX_DOCUMENT_FILE_BYTES + 1 }),
      }),
    ).toThrow(ButcherApplicationError);
  });
});
