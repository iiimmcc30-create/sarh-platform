'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Plus,
  RefreshCw,
  Power,
  Trash2,
  Check,
  X,
  Upload,
  Sparkles,
  User,
  PenLine,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import {
  activateKnowledgeCenter,
  createKnowledgePost,
  createKnowledgeSource,
  deleteKnowledgeSource,
  fetchKnowledgeArticles,
  fetchKnowledgeLogs,
  fetchKnowledgeProfile,
  fetchKnowledgeSources,
  publishKnowledgeArticle,
  approveKnowledgeArticle,
  rejectKnowledgeArticle,
  setKnowledgeSourceEnabled,
  syncKnowledge,
  syncKnowledgeSource,
  updateKnowledgeProfile,
  type KnowledgeArticle,
  type KnowledgeProfile,
  type KnowledgeSource,
  type KnowledgeSyncLog,
} from '@/services/knowledge.service';
import {
  uploadImageToFolder,
  uploadKnowledgeCenterAvatar,
} from '@/services/upload.service';

type Tab = 'sources' | 'articles' | 'logs' | 'profile' | 'post';

export default function KnowledgeCenterPage() {
  const [tab, setTab] = useState<Tab>('sources');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [logs, setLogs] = useState<KnowledgeSyncLog[]>([]);
  const [profile, setProfile] = useState<KnowledgeProfile>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceForm, setSourceForm] = useState({
    name: '',
    url: '',
    type: 'RSS' as 'RSS' | 'API',
  });

  // Profile state
  const [profileBio, setProfileBio] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Direct post state
  const [postContent, setPostContent] = useState('');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const postImageInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'sources') {
        setSources(await fetchKnowledgeSources());
      } else if (tab === 'articles') {
        const data = await fetchKnowledgeArticles({
          status: statusFilter || undefined,
          pageSize: 50,
        });
        setArticles(data.items);
      } else if (tab === 'logs') {
        const data = await fetchKnowledgeLogs({ pageSize: 50 });
        setLogs(data.items);
      } else if (tab === 'profile') {
        const p = await fetchKnowledgeProfile();
        setProfile(p);
        setProfileBio(p?.bio ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التحميل');
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateSource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createKnowledgeSource(sourceForm);
      setSourceForm({ name: '', url: '', type: 'RSS' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء المصدر');
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const url = await uploadKnowledgeCenterAvatar(file);
      const updated = await updateKnowledgeProfile({ avatar: url });
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تغيير الصورة');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function onSaveBio(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setError(null);
    try {
      const updated = await updateKnowledgeProfile({ bio: profileBio });
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ النبذة');
    } finally {
      setProfileSaving(false);
    }
  }

  async function onPostImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImageUploading(true);
    setError(null);
    try {
      const url = await uploadImageToFolder(file, 'posts');
      setPostImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setPostImageUploading(false);
      if (postImageInputRef.current) postImageInputRef.current.value = '';
    }
  }

  async function onSubmitPost(e: FormEvent) {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPostSubmitting(true);
    setError(null);
    setPostSuccess(false);
    try {
      await createKnowledgePost({
        content: postContent.trim(),
        imageUrl: postImageUrl || undefined,
      });
      setPostContent('');
      setPostImageUrl('');
      setPostSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل نشر المنشور');
    } finally {
      setPostSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-100">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            مركز المعرفة
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            إدارة الحساب، نشر المحتوى، المصادر والأخبار الموثوقة
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await activateKnowledgeCenter({ sync: true });
                await load();
                setError(
                  `تم التفعيل: مصادر ${result.sources.total} · متابعات جديدة ${result.follows.followsCreated}` +
                    (result.sync
                      ? ` · نُشر ${result.sync.published ?? 0}`
                      : ''),
                );
              } catch (err) {
                setError(err instanceof Error ? err.message : 'فشل التفعيل');
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            <Sparkles className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
            تفعيل الحساب والنشر
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await syncKnowledge();
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'فشلت المزامنة');
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            إعادة مزامنة الكل
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(
          [
            ['profile', 'الحساب', User],
            ['post', 'نشر منشور', PenLine],
            ['sources', 'المصادر', BookOpen],
            ['articles', 'الأخبار', RefreshCw],
            ['logs', 'سجل العمليات', RefreshCw],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${
              tab === id
                ? 'bg-emerald-600/20 text-emerald-300'
                : 'text-slate-400 hover:bg-slate-900'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Feedback banner ──────────────────────────────────── */}
      {error ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error.startsWith('تم التفعيل')
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border-rose-800 bg-rose-950/40 text-rose-300'
          }`}
        >
          {error}
        </div>
      ) : null}

      {postSuccess && tab === 'post' ? (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          ✅ تم نشر المنشور بنجاح باسم مركز المعرفة
        </div>
      ) : null}

      {loading ? (
        <p className="text-slate-400">جاري التحميل...</p>
      ) : null}

      {/* ══════════════════════════════════════════════════════
          Tab: الحساب — profile management
         ══════════════════════════════════════════════════════ */}
      {!loading && tab === 'profile' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Avatar card */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-100">
              <Camera className="h-4 w-4 text-emerald-400" />
              صورة الحساب
            </h2>

            <div className="flex items-center gap-4">
              {profile?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt="avatar"
                  className="h-20 w-20 rounded-full object-cover border-2 border-slate-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-3xl">
                  📚
                </div>
              )}
              <div className="space-y-1 text-sm text-slate-400">
                <p className="font-medium text-slate-200">
                  {profile?.arabicName ?? 'مركز المعرفة'}
                </p>
                <p>@{profile?.username ?? 'knowledge_center'}</p>
                <p className="text-xs">
                  {profile?.verified ? '✅ موثّق' : ''}{' '}
                  {profile?.isAI ? '🤖 ذكاء اصطناعي' : ''}
                </p>
              </div>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onAvatarChange}
            />
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => avatarInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {avatarUploading ? 'جاري الرفع...' : 'تغيير الصورة'}
            </button>
          </div>

          {/* Bio card */}
          <form
            onSubmit={onSaveBio}
            className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5"
          >
            <h2 className="flex items-center gap-2 font-semibold text-slate-100">
              <User className="h-4 w-4 text-emerald-400" />
              النبذة التعريفية
            </h2>
            <textarea
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="اكتب نبذة عن مركز المعرفة..."
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {profileBio.length}/500
              </span>
              <button
                type="submit"
                disabled={profileSaving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {profileSaving ? 'جاري الحفظ...' : 'حفظ النبذة'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════
          Tab: نشر منشور — direct post form
         ══════════════════════════════════════════════════════ */}
      {!loading && tab === 'post' ? (
        <form
          onSubmit={onSubmitPost}
          className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5"
        >
          <h2 className="flex items-center gap-2 font-semibold text-slate-100">
            <PenLine className="h-4 w-4 text-emerald-400" />
            نشر منشور باسم مركز المعرفة
          </h2>
          <p className="text-xs text-slate-500">
            سيظهر المنشور في تغذية المتابعين ويُنسب لحساب مركز المعرفة.
          </p>

          <textarea
            rows={6}
            required
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="اكتب محتوى المنشور هنا..."
            value={postContent}
            onChange={(e) => {
              setPostContent(e.target.value);
              if (postSuccess) setPostSuccess(false);
            }}
            maxLength={2000}
          />
          <span className="block text-left text-xs text-slate-500">
            {postContent.length}/2000
          </span>

          {/* Image attachment */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">
              صورة مرفقة (اختياري)
            </p>
            {postImageUrl ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={postImageUrl}
                  alt="preview"
                  className="h-32 w-auto rounded-xl border border-slate-700 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPostImageUrl('')}
                  className="absolute -top-2 -left-2 rounded-full bg-rose-600 p-0.5 text-white hover:bg-rose-500"
                  title="إزالة الصورة"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={postImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPostImageChange}
                />
                <button
                  type="button"
                  disabled={postImageUploading}
                  onClick={() => postImageInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-700 px-4 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-50"
                >
                  <ImageIcon className="h-4 w-4" />
                  {postImageUploading ? 'جاري رفع الصورة...' : 'إرفاق صورة'}
                </button>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={postSubmitting || !postContent.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <PenLine className="h-4 w-4" />
            {postSubmitting ? 'جاري النشر...' : 'نشر المنشور'}
          </button>
        </form>
      ) : null}

      {/* ══════════════════════════════════════════════════════
          Tab: المصادر — sources management
         ══════════════════════════════════════════════════════ */}
      {!loading && tab === 'sources' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={onCreateSource}
            className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4"
          >
            <h2 className="flex items-center gap-2 font-semibold text-slate-100">
              <Plus className="h-4 w-4" /> إضافة مصدر
            </h2>
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="اسم المصدر"
              value={sourceForm.name}
              onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="رابط RSS أو API"
              value={sourceForm.url}
              onChange={(e) => setSourceForm((f) => ({ ...f, url: e.target.value }))}
              required
            />
            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              value={sourceForm.type}
              onChange={(e) =>
                setSourceForm((f) => ({ ...f, type: e.target.value as 'RSS' | 'API' }))
              }
            >
              <option value="RSS">RSS</option>
              <option value="API">API</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              حفظ المصدر
            </button>
          </form>

          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-100">{source.name}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{source.url}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {source.type} · {source.enabled ? 'مفعّل' : 'معطّل'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      title="مزامنة"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await syncKnowledgeSource(source.id);
                          await load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="rounded-lg p-2 text-slate-300 hover:bg-slate-900"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={source.enabled ? 'تعطيل' : 'تفعيل'}
                      onClick={async () => {
                        await setKnowledgeSourceEnabled(source.id, !source.enabled);
                        await load();
                      }}
                      className="rounded-lg p-2 text-slate-300 hover:bg-slate-900"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="حذف"
                      onClick={async () => {
                        if (!confirm('حذف المصدر؟')) return;
                        await deleteKnowledgeSource(source.id);
                        await load();
                      }}
                      className="rounded-lg p-2 text-rose-400 hover:bg-slate-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════
          Tab: الأخبار — articles moderation
         ══════════════════════════════════════════════════════ */}
      {!loading && tab === 'articles' ? (
        <div className="space-y-4">
          <select
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="PENDING">بانتظار</option>
            <option value="PUBLISHED">منشور</option>
            <option value="REJECTED">مرفوض</option>
          </select>

          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100">
                      {article.titleAr || article.originalTitle}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {article.source?.name} · {article.status}
                    </p>
                    <a
                      href={article.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block break-all text-xs text-emerald-400"
                    >
                      {article.originalUrl}
                    </a>
                    {article.summary ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                        {article.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      title="موافقة / نشر"
                      onClick={async () => {
                        await approveKnowledgeArticle(article.id);
                        await load();
                      }}
                      className="rounded-lg p-2 text-emerald-400 hover:bg-slate-900"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="نشر يدوي"
                      onClick={async () => {
                        await publishKnowledgeArticle(article.id);
                        await load();
                      }}
                      className="rounded-lg p-2 text-sky-400 hover:bg-slate-900"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="رفض"
                      onClick={async () => {
                        await rejectKnowledgeArticle(article.id);
                        await load();
                      }}
                      className="rounded-lg p-2 text-rose-400 hover:bg-slate-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════
          Tab: سجل العمليات — sync logs
         ══════════════════════════════════════════════════════ */}
      {!loading && tab === 'logs' ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={
                    log.level === 'error'
                      ? 'text-rose-400'
                      : log.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }
                >
                  {log.level}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(log.createdAt).toLocaleString('ar-SA')}
                </span>
              </div>
              <p className="mt-1 text-slate-200">{log.message}</p>
              {log.source?.name ? (
                <p className="mt-1 text-xs text-slate-500">{log.source.name}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
