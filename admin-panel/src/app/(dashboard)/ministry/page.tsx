'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Pencil, Plus, Power, RefreshCw, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import {
  createMinistryPost,
  deleteMinistryPost,
  fetchMinistryPosts,
  fetchMinistryProfile,
  updateMinistryPost,
  updateMinistryProfile,
  type MinistryAccount,
  type MinistryPost,
} from '@/services/ministry.service';
import {
  OFFICIAL_SERVICE_CATEGORIES,
  createOfficialService,
  deleteOfficialService,
  fetchOfficialServicesAdmin,
  updateOfficialService,
  type OfficialServiceRecord,
} from '@/services/official-services.service';
import { uploadImageToFolder } from '@/services/upload.service';

type Tab = 'profile' | 'posts' | 'services';

const EMPTY_SERVICE = {
  title: '',
  description: '',
  category: 'veterinary',
  icon: 'link-outline',
  externalUrl: '',
  active: true,
  feeText: '',
  isFree: true,
  steps: '',
  conditions: '',
  documents: '',
  deliveryChannel: '',
  sortOrder: 0,
};

export default function MinistryAdminPage() {
  const [tab, setTab] = useState<Tab>('profile');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [account, setAccount] = useState<MinistryAccount | null>(null);
  const [profile, setProfile] = useState({
    arabicName: '',
    bio: '',
    about: '',
    website: '',
    publicPhone: '',
    publicEmail: '',
    verified: true,
  });

  const [posts, setPosts] = useState<MinistryPost[]>([]);
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState('');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const [services, setServices] = useState<OfficialServiceRecord[]>([]);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAccount, nextPosts, nextServices] = await Promise.all([
        fetchMinistryProfile(),
        fetchMinistryPosts(),
        fetchOfficialServicesAdmin(),
      ]);
      setAccount(nextAccount);
      setProfile({
        arabicName: nextAccount.arabicName ?? '',
        bio: nextAccount.bio ?? '',
        about: nextAccount.about ?? '',
        website: nextAccount.website ?? '',
        publicPhone: nextAccount.publicPhone ?? '',
        publicEmail: nextAccount.publicEmail ?? '',
        verified: nextAccount.verified,
      });
      setPosts(nextPosts);
      setServices(nextServices);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل بيانات الوزارة'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await updateMinistryProfile(profile);
      setAccount(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ الملف'));
    } finally {
      setBusy(false);
    }
  }

  async function onImage(kind: 'avatar' | 'coverImage', file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImageToFolder(file, 'posts');
      const next = await updateMinistryProfile({ [kind]: url });
      setAccount(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر رفع الصورة'));
    } finally {
      setBusy(false);
    }
  }

  async function savePost(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingPostId) {
        await updateMinistryPost(editingPostId, {
          content: postContent,
          image: postImage || undefined,
        });
      } else {
        await createMinistryPost({
          content: postContent,
          image: postImage || undefined,
        });
      }
      setPostContent('');
      setPostImage('');
      setEditingPostId(null);
      setPosts(await fetchMinistryPosts());
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ المنشور'));
    } finally {
      setBusy(false);
    }
  }

  async function saveService(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...serviceForm,
        sortOrder: Number(serviceForm.sortOrder) || 0,
      };
      if (editingServiceId) {
        await updateOfficialService(editingServiceId, payload);
      } else {
        await createOfficialService(payload);
      }
      setServiceForm(EMPTY_SERVICE);
      setEditingServiceId(null);
      setServices(await fetchOfficialServicesAdmin());
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ الخدمة'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="وزارة البيئة والمياه والزراعة"
        description="إدارة الحساب الرسمي والمنشورات والخدمات من مصدر واحد"
        actions={
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      <div className="mb-5 flex gap-2">
        {([
          ['profile', 'الملف'],
          ['posts', 'المنشورات'],
          ['services', 'الخدمات'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'rounded-full bg-emerald-700 px-4 py-1.5 text-sm text-white'
                : 'rounded-full bg-slate-800 px-4 py-1.5 text-sm text-slate-300'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-slate-400">جاري التحميل...</p> : null}

      {!loading && tab === 'profile' ? (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account?.coverImage || ''}
              alt=""
              className="h-36 w-full object-cover bg-emerald-950"
            />
            <div className="-mt-10 flex items-end gap-4 px-5 pb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={account?.avatar || ''}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-slate-950 object-cover bg-white"
              />
              <div className="flex gap-2">
                <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onImage('avatar', e.target.files?.[0])} />
                <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onImage('coverImage', e.target.files?.[0])} />
                <Button type="button" size="sm" variant="ghost" onClick={() => avatarInput.current?.click()}>
                  <Camera className="h-4 w-4" />
                  الصورة الشخصية
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => coverInput.current?.click()}>
                  <Upload className="h-4 w-4" />
                  صورة الغلاف
                </Button>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void saveProfile(e)} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:grid-cols-2">
            <label className="text-sm text-slate-400">
              اسم الوزارة
              <input
                value={profile.arabicName}
                onChange={(e) => setProfile({ ...profile, arabicName: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
            </label>
            <label className="text-sm text-slate-400">
              اسم المستخدم
              <input value={account?.username ?? 'mewa'} readOnly className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-500" dir="ltr" />
            </label>
            <label className="text-sm text-slate-400 md:col-span-2">
              النبذة
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="mt-1 min-h-[72px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-slate-400 md:col-span-2">
              الوصف في تبويب المعلومات
              <textarea
                value={profile.about}
                onChange={(e) => setProfile({ ...profile, about: e.target.value })}
                className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <input
              placeholder="الموقع الإلكتروني"
              value={profile.website}
              onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              dir="ltr"
            />
            <input
              placeholder="الهاتف"
              value={profile.publicPhone}
              onChange={(e) => setProfile({ ...profile, publicPhone: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              dir="ltr"
            />
            <input
              placeholder="البريد الإلكتروني"
              value={profile.publicEmail}
              onChange={(e) => setProfile({ ...profile, publicEmail: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              dir="ltr"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={profile.verified}
                onChange={(e) => setProfile({ ...profile, verified: e.target.checked })}
              />
              حساب موثّق
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy}>حفظ الملف</Button>
            </div>
          </form>
        </div>
      ) : null}

      {!loading && tab === 'posts' ? (
        <div className="space-y-5">
          <form onSubmit={(e) => void savePost(e)} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <textarea
              placeholder="نص المنشور"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="min-h-[120px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              required
            />
            <input
              placeholder="رابط الصورة (اختياري)"
              value={postImage}
              onChange={(e) => setPostImage(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              dir="ltr"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Plus className="h-4 w-4" />
                {editingPostId ? 'حفظ التعديل' : 'نشر'}
              </Button>
              {editingPostId ? (
                <Button type="button" variant="ghost" onClick={() => { setEditingPostId(null); setPostContent(''); setPostImage(''); }}>
                  إلغاء
                </Button>
              ) : null}
            </div>
          </form>
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="whitespace-pre-wrap text-sm text-slate-200">{post.content}</p>
                <p className="mt-2 text-xs text-slate-500">{post.isHidden ? 'مخفي' : 'ظاهر'}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingPostId(post.id); setPostContent(post.content); setPostImage(post.image ?? ''); }}>
                    <Pencil className="h-4 w-4" />
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await updateMinistryPost(post.id, { isHidden: !post.isHidden });
                      setPosts(await fetchMinistryPosts());
                    }}
                  >
                    <Power className="h-4 w-4" />
                    {post.isHidden ? 'إظهار' : 'إخفاء'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!confirm('حذف المنشور؟')) return;
                      await deleteMinistryPost(post.id);
                      setPosts(await fetchMinistryPosts());
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && tab === 'services' ? (
        <div className="space-y-5">
          <form onSubmit={(e) => void saveService(e)} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:grid-cols-2">
            <input placeholder="اسم الخدمة" value={serviceForm.title} onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" required />
            <select value={serviceForm.category} onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              {OFFICIAL_SERVICE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input placeholder="الأيقونة" value={serviceForm.icon} onChange={(e) => setServiceForm({ ...serviceForm, icon: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" required />
            <input placeholder="الرابط الرسمي" value={serviceForm.externalUrl} onChange={(e) => setServiceForm({ ...serviceForm, externalUrl: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" required dir="ltr" />
            <input placeholder="الرسوم" value={serviceForm.feeText} onChange={(e) => setServiceForm({ ...serviceForm, feeText: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input placeholder="قناة التقديم" value={serviceForm.deliveryChannel} onChange={(e) => setServiceForm({ ...serviceForm, deliveryChannel: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input type="number" placeholder="الترتيب" value={serviceForm.sortOrder} onChange={(e) => setServiceForm({ ...serviceForm, sortOrder: Number(e.target.value) })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={serviceForm.isFree} onChange={(e) => setServiceForm({ ...serviceForm, isFree: e.target.checked })} />
              مجانية
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={serviceForm.active} onChange={(e) => setServiceForm({ ...serviceForm, active: e.target.checked })} />
              ظاهرة في التطبيق
            </label>
            <textarea placeholder="الوصف" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} className="min-h-[88px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" required />
            <textarea placeholder="الخطوات (سطر لكل خطوة)" value={serviceForm.steps} onChange={(e) => setServiceForm({ ...serviceForm, steps: e.target.value })} className="min-h-[88px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" />
            <textarea placeholder="الشروط" value={serviceForm.conditions} onChange={(e) => setServiceForm({ ...serviceForm, conditions: e.target.value })} className="min-h-[88px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" />
            <textarea placeholder="المستندات المطلوبة" value={serviceForm.documents} onChange={(e) => setServiceForm({ ...serviceForm, documents: e.target.value })} className="min-h-[88px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" />
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={busy}>{editingServiceId ? 'حفظ التعديل' : 'إضافة خدمة'}</Button>
              {editingServiceId ? (
                <Button type="button" variant="ghost" onClick={() => { setEditingServiceId(null); setServiceForm(EMPTY_SERVICE); }}>إلغاء</Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-3">
            {services.map((service) => (
              <div key={service.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{service.title}</p>
                    <p className="text-xs text-slate-500">ترتيب {service.sortOrder ?? 0} · {service.active ? 'ظاهرة' : 'مخفية'}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{service.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingServiceId(service.id);
                      setServiceForm({
                        title: service.title,
                        description: service.description,
                        category: service.category,
                        icon: service.icon,
                        externalUrl: service.externalUrl,
                        active: service.active,
                        feeText: service.feeText ?? '',
                        isFree: service.isFree !== false,
                        steps: service.steps ?? '',
                        conditions: service.conditions ?? '',
                        documents: service.documents ?? '',
                        deliveryChannel: service.deliveryChannel ?? '',
                        sortOrder: service.sortOrder ?? 0,
                      });
                    }}>
                      <Pencil className="h-4 w-4" />
                      تعديل
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await updateOfficialService(service.id, { active: !service.active });
                      setServices(await fetchOfficialServicesAdmin());
                    }}>
                      <Power className="h-4 w-4" />
                      {service.active ? 'إخفاء' : 'إظهار'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={async () => {
                      if (!confirm('حذف الخدمة؟')) return;
                      await deleteOfficialService(service.id);
                      setServices(await fetchOfficialServicesAdmin());
                    }}>
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
