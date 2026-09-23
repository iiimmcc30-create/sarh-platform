"use client";

import { useState } from "react";
import { ResourcePage, Badge } from "@/components/ui/ResourcePage";
import { Button } from "@/components/ui/Button";
import { ButcherDetailModal } from "@/components/butchers/ButcherDetailModal";
import { ButcherEditModal } from "@/components/butchers/ButcherEditModal";
import {
  deleteButcher,
  fetchButchers,
  updateButcher,
} from "@/services/admin.service";
import { getApiErrorMessage } from "@/services/api.client";

type ButcherRow = {
  id: string;
  nameAr: string;
  cityAr: string;
  type: string;
  isOpen: boolean;
  user?: { id?: string; arabicName?: string; username?: string };
};

export default function ButchersPage() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [verifiedJustNow, setVerifiedJustNow] = useState(false);
  const [actionError, setActionError] = useState("");
  const [listVersion, setListVersion] = useState(0);

  const openDetails = (id: string, justVerified = false) => {
    setVerifiedJustNow(justVerified);
    setDetailId(id);
  };

  const closeDetails = () => {
    setDetailId(null);
    setVerifiedJustNow(false);
  };

  const bumpList = () => setListVersion((v) => v + 1);

  return (
    <>
      {actionError ? (
        <p className="mb-3 text-sm text-rose-400">{actionError}</p>
      ) : null}
      <ResourcePage<ButcherRow>
        key={listVersion}
        title="إدارة الملاحم"
        description="الملاحم المسجّلة في المنصة — تعديل البيانات أو أرشفة الملحمة"
        fetchPage={async ({ page, search }) => {
          const res = await fetchButchers({ page, search });
          return {
            ...res,
            items: res.items as ButcherRow[],
          };
        }}
        columns={[
          { key: "nameAr", label: "الاسم" },
          { key: "cityAr", label: "المدينة" },
          {
            key: "type",
            label: "النوع",
            render: (r) => (
              <Badge tone={r.type === "verified" ? "success" : "default"}>
                {r.type}
              </Badge>
            ),
          },
          {
            key: "isOpen",
            label: "مفتوح",
            render: (r) => (r.isOpen ? "نعم" : "لا"),
          },
          {
            key: "user",
            label: "المالك",
            render: (r) => r.user?.arabicName ?? r.user?.username ?? "—",
          },
        ]}
        actions={(row, reload) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openDetails(row.id)}
            >
              تفاصيل
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditId(row.id)}
            >
              تعديل
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setActionError("");
                try {
                  const willVerify = row.type !== "verified";
                  await updateButcher(row.id, {
                    type: willVerify ? "verified" : "regular",
                  });
                  reload();
                  openDetails(row.id, willVerify);
                } catch (err) {
                  setActionError(
                    getApiErrorMessage(err, "تعذّر تحديث التوثيق"),
                  );
                }
              }}
            >
              {row.type === "verified" ? "إلغاء التوثيق" : "توثيق"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (
                  !confirm(
                    `أرشفة الملحمة «${row.nameAr}»؟ ستختفي من التطبيق مع منتجاتها وعروضها، وتُحفظ الطلبات التاريخية.`,
                  )
                ) {
                  return;
                }
                setActionError("");
                try {
                  await deleteButcher(row.id);
                  if (detailId === row.id) closeDetails();
                  if (editId === row.id) setEditId(null);
                  reload();
                } catch (err) {
                  setActionError(
                    getApiErrorMessage(err, "تعذّر أرشفة الملحمة"),
                  );
                }
              }}
            >
              حذف
            </Button>
          </div>
        )}
      />

      <ButcherDetailModal
        butcherId={detailId}
        open={detailId !== null}
        onClose={closeDetails}
        verifiedJustNow={verifiedJustNow}
        onEdit={(id) => {
          closeDetails();
          setEditId(id);
        }}
        onDeleted={() => {
          closeDetails();
          bumpList();
        }}
      />

      <ButcherEditModal
        butcherId={editId}
        open={editId !== null}
        onClose={() => setEditId(null)}
        onSaved={bumpList}
      />
    </>
  );
}
