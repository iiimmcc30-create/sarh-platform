'use client';

import { useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import { uploadButcherImage } from '@/services/upload.service';

const ALBUM_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/*';

function AlbumFileInput({
  inputRef,
  disabled,
  onFile,
  capture,
}: {
  inputRef: RefObject<HTMLInputElement>;
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
  capture?: boolean;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ALBUM_ACCEPT}
      capture={capture ? 'environment' : undefined}
      className="sr-only"
      disabled={disabled}
      onChange={(e) => {
        onFile(e.target.files?.[0]);
      }}
    />
  );
}

export function ImageUploadField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled?: boolean;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const shown = preview || value;

  const pickFromAlbum = () => {
    setError('');
    setSuccess('');
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setSuccess('');
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);
    try {
      const url = await uploadButcherImage(file);
      onChange(url);
      setSuccess('تم رفع الصورة من الألبوم');
    } catch (err) {
      setError(getApiErrorMessage(err, err instanceof Error ? err.message : 'فشل رفع الصورة'));
    } finally {
      URL.revokeObjectURL(localUrl);
      setPreview(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const clear = () => {
    setError('');
    setSuccess('تم حذف الصورة من الملف');
    setPreview(null);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">{label}</p>
      <AlbumFileInput inputRef={inputRef} disabled={disabled || busy} onFile={(file) => void onFile(file)} />
      <AlbumFileInput
        inputRef={cameraRef}
        disabled={disabled || busy}
        capture
        onFile={(file) => void onFile(file)}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={pickFromAlbum}
        className="block w-full overflow-hidden rounded-xl text-start disabled:opacity-60"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={label} className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 flex-col items-center justify-center gap-1 border border-dashed border-white/15 bg-canvas text-sm text-ink-muted">
            <span>اضغط لاختيار صورة من الألبوم</span>
            <span className="text-xs">JPEG / PNG / WebP / GIF</span>
          </div>
        )}
      </button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={disabled || busy} onClick={pickFromAlbum}>
          {shown ? 'استبدال من الألبوم' : 'اختيار من الألبوم'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => cameraRef.current?.click()}
        >
          كاميرا
        </Button>
        {shown ? (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={clear}>
            حذف
          </Button>
        ) : null}
      </div>
      {busy ? <p className="text-xs text-ink-muted">جارٍ الرفع...</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {success && !error && !busy ? <p className="text-xs text-brand">{success}</p> : null}
    </div>
  );
}

export function ProductImagesField({
  values,
  disabled,
  onChange,
}: {
  values: string[];
  disabled?: boolean;
  onChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const pickFromAlbum = (index: number | null) => {
    setReplaceIndex(index);
    setError('');
    setSuccess('');
    inputRef.current?.click();
  };

  const runUpload = async (file: File, index: number | null) => {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const url = await uploadButcherImage(file);
      if (index == null) {
        onChange([...values, url].slice(0, 5));
      } else {
        const next = [...values];
        next[index] = url;
        onChange(next);
      }
      setSuccess('تم رفع صورة المنتج من الألبوم');
    } catch (err) {
      setError(getApiErrorMessage(err, err instanceof Error ? err.message : 'فشل رفع الصورة'));
    } finally {
      setBusy(false);
      setReplaceIndex(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <p className="text-sm text-ink-muted">صور المنتج من الألبوم (حتى 5) — بدون رابط</p>
      <AlbumFileInput
        inputRef={inputRef}
        disabled={disabled || busy}
        onFile={(file) => {
          if (file) void runUpload(file, replaceIndex);
        }}
      />
      <div className="flex flex-wrap gap-3">
        {values.map((url, index) => (
          <div key={`${url}-${index}`} className="w-28 space-y-1">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => pickFromAlbum(index)}
              className="block overflow-hidden rounded-xl disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`صورة ${index + 1}`} className="h-24 w-28 object-cover" />
            </button>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || busy}
                onClick={() => pickFromAlbum(index)}
              >
                ألبوم
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || busy}
                onClick={() => {
                  onChange(values.filter((_, i) => i !== index));
                  setSuccess('تم حذف الصورة');
                }}
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
      {values.length < 5 ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => pickFromAlbum(null)}
        >
          اختيار من الألبوم
        </Button>
      ) : null}
      {busy ? <p className="text-xs text-ink-muted">جارٍ الرفع...</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {success && !error && !busy ? <p className="text-xs text-brand">{success}</p> : null}
    </div>
  );
}
