import {
  documentFileUrl,
  documentPreviewKind,
  isSensitiveCredentialKey,
} from '@/lib/butcherApplicationDocuments';

describe('admin butcher application documents', () => {
  it('previews images and marks PDFs as openable files', () => {
    expect(documentPreviewKind('image/jpeg', 'id.jpg')).toBe('image');
    expect(documentPreviewKind('application/pdf', 'license.pdf')).toBe('pdf');
    expect(documentFileUrl({ fileUrl: 'https://cdn.example/doc.pdf' })).toBe(
      'https://cdn.example/doc.pdf',
    );
    expect(documentFileUrl({ fileKey: 'butcher-applications/u/a.pdf' })).toBe('');
  });

  it('never treats password fields as displayable document metadata', () => {
    expect(isSensitiveCredentialKey('accountPasswordHash')).toBe(true);
    expect(isSensitiveCredentialKey('password')).toBe(true);
    expect(isSensitiveCredentialKey('fileUrl')).toBe(false);
  });
});
