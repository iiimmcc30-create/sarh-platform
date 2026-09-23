'use client';

import { useRef } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Props = {
  imageUrl: string;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
};

export function EditorialStoryImagePicker({
  imageUrl,
  uploading,
  onPick,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="md:col-span-2">
      <label className="mb-1 block text-sm text-slate-400">صورة الستوري</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />

      {imageUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="h-36 w-28 shrink-0 rounded-xl object-cover bg-slate-800"
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? 'جارٍ الرفع…' : 'تغيير الصورة'}
            </Button>
            <Button type="button" variant="ghost" disabled={uploading} onClick={onClear}>
              <X className="h-4 w-4 text-rose-400" />
              إزالة
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/60 px-4 py-10 text-slate-400 transition hover:border-emerald-600/50 hover:text-emerald-300 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          ) : (
            <ImagePlus className="h-8 w-8" />
          )}
          <span className="text-sm font-medium">
            {uploading ? 'جارٍ رفع الصورة…' : 'اختر صورة من الألبوم'}
          </span>
          <span className="text-xs text-slate-500">JPEG · PNG · WebP — حتى 20 م.ب</span>
        </button>
      )}
    </div>
  );
}
