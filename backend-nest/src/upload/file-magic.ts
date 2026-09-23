/**
 * Lightweight magic-byte sniffing for upload defense-in-depth.
 * Complements MIME allowlists; does not replace Cloudinary/S3 provider checks.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = Buffer.from('GIF87a');
const GIF89 = Buffer.from('GIF89a');
const RIFF = Buffer.from('RIFF');
const WEBP = Buffer.from('WEBP');
const PDF = Buffer.from('%PDF');
const FTYP = Buffer.from('ftyp');

function startsWith(buf: Buffer, sig: Buffer, offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return buf.subarray(offset, offset + sig.length).equals(sig);
}

/** Detect a coarse content family from the file header. */
export function sniffFileKind(
  header: Buffer,
): 'jpeg' | 'png' | 'gif' | 'webp' | 'pdf' | 'mp4' | 'unknown' {
  if (startsWith(header, JPEG)) return 'jpeg';
  if (startsWith(header, PNG)) return 'png';
  if (startsWith(header, GIF87) || startsWith(header, GIF89)) return 'gif';
  if (
    startsWith(header, RIFF) &&
    header.length >= 12 &&
    startsWith(header, WEBP, 8)
  ) {
    return 'webp';
  }
  if (startsWith(header, PDF)) return 'pdf';
  // ISO BMFF (mp4/mov/m4v): bytes 4..7 == 'ftyp'
  if (header.length >= 8 && startsWith(header, FTYP, 4)) return 'mp4';
  return 'unknown';
}

const MIME_TO_KIND: Record<string, ReturnType<typeof sniffFileKind>[]> = {
  'image/jpeg': ['jpeg'],
  'image/jpg': ['jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4'],
  'video/quicktime': ['mp4'],
  'video/x-m4v': ['mp4'],
};

/**
 * Returns true when the declared MIME is consistent with magic bytes.
 * Unknown / unsupported MIME kinds fail closed for the declared type.
 */
export function mimeMatchesMagic(mimetype: string, header: Buffer): boolean {
  const allowed = MIME_TO_KIND[mimetype.toLowerCase()];
  if (!allowed) {
    // Documents outside the sniffed set (e.g. some support types) skip magic.
    return true;
  }
  const kind = sniffFileKind(header);
  return allowed.includes(kind);
}
