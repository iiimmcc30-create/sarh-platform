'use client';

import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchPosts, setPostHidden, deletePost } from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';

type PostRow = {
  id: string;
  content: string;
  arabicContent?: string;
  isHidden: boolean;
  createdAt: string;
  author?: { arabicName?: string; username?: string };
};

export default function PostsPage() {
  return (
    <ResourcePage<PostRow>
      title="إدارة المنشورات"
      description="عرض وإخفاء وحذف المنشورات"
      fetchPage={({ page, search }) => fetchPosts({ page, search })}
      columns={[
        {
          key: 'content',
          label: 'المحتوى',
          render: (r) => (
            <span className="line-clamp-2 max-w-md">{r.content || r.arabicContent}</span>
          ),
        },
        {
          key: 'author',
          label: 'الكاتب',
          render: (r) => r.author?.arabicName ?? '—',
        },
        {
          key: 'isHidden',
          label: 'الحالة',
          render: (r) => (
            <Badge tone={r.isHidden ? 'warning' : 'success'}>{r.isHidden ? 'مخفي' : 'ظاهر'}</Badge>
          ),
        },
      ]}
      actions={(row, reload) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await setPostHidden(row.id, !row.isHidden);
              reload();
            }}
          >
            {row.isHidden ? 'إظهار' : 'إخفاء'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (!confirm('أرشفة المنشور؟ سيختفي من التطبيق.')) return;
              try {
                await deletePost(row.id);
                reload();
              } catch (err) {
                alert(getApiErrorMessage(err, 'فشل أرشفة المنشور'));
              }
            }}
          >
            أرشفة
          </Button>
        </div>
      )}
    />
  );
}
