'use client';

import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchLiveStreams, stopLiveStream, deleteLiveStream } from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';

type LiveRow = {
  id: string;
  arabicTitle: string;
  isLive: boolean;
  viewers: number;
  host?: { arabicName?: string };
};

export default function LivePage() {
  return (
    <ResourcePage<LiveRow>
      title="إدارة البث المباشر"
      description="مراقبة وإيقاف البثوث"
      fetchPage={({ page, search }) => fetchLiveStreams({ page, search })}
      columns={[
        { key: 'arabicTitle', label: 'العنوان' },
        {
          key: 'isLive',
          label: 'الحالة',
          render: (r) => (
            <Badge tone={r.isLive ? 'danger' : 'default'}>{r.isLive ? '● مباشر' : 'منتهي'}</Badge>
          ),
        },
        { key: 'viewers', label: 'المشاهدون' },
        { key: 'host', label: 'المضيف', render: (r) => r.host?.arabicName ?? '—' },
      ]}
      actions={(row, reload) => (
        <div className="flex gap-2">
          {row.isLive && (
            <Button variant="danger" size="sm" onClick={async () => { await stopLiveStream(row.id); reload(); }}>
              إيقاف
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={async () => {
            if (!confirm('أرشفة البث؟')) return;
            try {
              await deleteLiveStream(row.id);
              reload();
            } catch (err) {
              alert(getApiErrorMessage(err, 'فشل أرشفة البث'));
            }
          }}>
            أرشفة
          </Button>
        </div>
      )}
    />
  );
}
