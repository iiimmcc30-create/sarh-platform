"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { fetchButcher, deleteButcher } from "@/services/admin.service";
import { getApiErrorMessage } from "@/services/api.client";
import { DaftraIntegrationPanel } from "@/components/butchers/DaftraIntegrationPanel";

function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("ar-SA");
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: unknown;
  children?: React.ReactNode;
}) {
  const content =
    children ?? (value == null || value === "" ? "—" : String(value));
  const isEmpty = content == null || content === "" || content === "—";
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">
        {isEmpty ? "—" : content}
      </dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-emerald-400">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

type Props = {
  butcherId: string | null;
  open: boolean;
  onClose: () => void;
  verifiedJustNow?: boolean;
  onEdit?: (id: string) => void;
  onDeleted?: () => void;
};

export function ButcherDetailModal({
  butcherId,
  open,
  onClose,
  verifiedJustNow,
  onEdit,
  onDeleted,
}: Props) {
  const [butcher, setButcher] = useState<Record<string, unknown> | null>(null);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!butcherId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchButcher(butcherId);
      setButcher(data.butcher);
      setUser(data.user);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل التفاصيل");
    } finally {
      setLoading(false);
    }
  }, [butcherId]);

  useEffect(() => {
    if (open && butcherId) load();
    if (!open) {
      setButcher(null);
      setUser(null);
      setError("");
    }
  }, [open, butcherId, load]);

  const counts = user?._count as Record<string, number> | undefined;
  const app = butcher?.sourceApplication as Record<string, unknown> | undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        butcher ? String(butcher.nameAr ?? "تفاصيل المسلخ") : "تفاصيل المسلخ"
      }
      description={
        verifiedJustNow
          ? "تم التوثيق بنجاح — مراجعة بيانات المسلخ والمالك"
          : "بيانات المسلخ والمستخدم المالك"
      }
      size="xl"
    >
      {loading && <p className="text-slate-400">جارٍ التحميل...</p>}
      {error && <p className="text-rose-400">{error}</p>}

      {!loading && !error && butcher && user && (
        <div className="space-y-4">
          {verifiedJustNow && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              ✓ تم توثيق المسلخ بنجاح
            </div>
          )}

          <Section title="بيانات المسلخ">
            <Field label="الاسم (عربي)" value={butcher.nameAr} />
            <Field label="الاسم (إنجليزي)" value={butcher.nameEn} />
            <Field label="المدينة" value={butcher.cityAr} />
            <Field label="العنوان" value={butcher.addressAr} />
            <Field label="الهاتف" value={butcher.phone} />
            <Field label="النوع">
              <Badge tone={butcher.type === "verified" ? "success" : "default"}>
                {String(butcher.type)}
              </Badge>
            </Field>
            <Field label="مفتوح الآن" value={butcher.isOpen ? "نعم" : "لا"} />
            <Field
              label="ساعات العمل"
              value={`${butcher.openTime} – ${butcher.closeTime}`}
            />
            <Field
              label="التقييم"
              value={`${butcher.rating} (${butcher.reviewCount} تقييم)`}
            />
            <Field label="إجمالي الطلبات" value={butcher.totalOrders} />
            <Field label="السجل التجاري" value={butcher.commercialReg} />
            <Field label="تاريخ التسجيل" value={fmtDate(butcher.createdAt)} />
            {app && (
              <Field
                label="طلب التسجيل"
                value={`#${app.applicationNumber} — ${app.status}`}
              />
            )}
          </Section>

          <Section title="المستخدم المالك">
            <Field label="الاسم" value={user.arabicName} />
            <Field label="اسم المستخدم" value={`@${user.username}`} />
            <Field label="البريد" value={user.email} />
            <Field label="الجوال" value={user.phone} />
            <Field label="الدور" value={user.role} />
            <Field label="الدولة" value={user.country} />
            <Field
              label="حالة الحساب"
              value={user.isActive ? "نشط" : "محظور"}
            />
            <Field label="موثّق" value={user.verified ? "نعم" : "لا"} />
            <Field
              label="البريد مُفعّل"
              value={user.emailVerified ? "نعم" : "لا"}
            />
            <Field label="آخر ظهور" value={fmtDate(user.lastSeenAt)} />
            <Field label="تاريخ الانضمام" value={fmtDate(user.createdAt)} />
            {user.bio ? <Field label="نبذة" value={user.bio} /> : null}
          </Section>

          {counts && (
            <Section title="إحصائيات المستخدم">
              <Field label="المنشورات" value={counts.posts} />
              <Field label="الإعلانات" value={counts.listings} />
              <Field label="المتابعون" value={counts.followers} />
              <Field label="يتابع" value={counts.following} />
              <Field label="البث المباشر" value={counts.liveStreams} />
            </Section>
          )}

          {butcherId ? <DaftraIntegrationPanel butcherId={butcherId} /> : null}

          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
            {onEdit && butcherId ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(butcherId)}
              >
                تعديل الملحمة
              </Button>
            ) : null}
            <Link href={`/users/${String(user.id)}`}>
              <Button variant="secondary" size="sm">
                صفحة المستخدم الكاملة
              </Button>
            </Link>
            {onDeleted && butcherId ? (
              <Button
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={async () => {
                  if (
                    !confirm(
                      `أرشفة الملحمة «${String(butcher.nameAr ?? "")}»؟ ستختفي من التطبيق مع منتجاتها وعروضها، وتُحفظ الطلبات التاريخية.`,
                    )
                  ) {
                    return;
                  }
                  setDeleting(true);
                  setError("");
                  try {
                    await deleteButcher(butcherId);
                    onDeleted();
                  } catch (e: unknown) {
                    setError(getApiErrorMessage(e, "تعذّر أرشفة الملحمة"));
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "جارٍ الحذف..." : "حذف / أرشفة"}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
