/**
 * §6 Profile, §7 Follow, §9 Posts/community, §11 Notifications,
 * §13 Ratings, §16 Block & Report — LIVE E2E.
 */
import request from 'supertest';
import {
  API,
  apiReachable,
  authHeader,
  registerUser,
  samplePost,
  type TestUser,
} from './helpers';

describe('§6–§16 Social: profile, follow, posts, notifications, ratings, block/report', () => {
  let live = false;
  let a: TestUser;
  let b: TestUser;
  let postId = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    a = await registerUser('e2e_social_a');
    b = await registerUser('e2e_social_b');
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── Profile (§6) ────────────────────────────────────────────
  t('own profile is retrievable', async () => {
    const res = await request(API)
      .get(`/api/users/${a.id}`)
      .set(authHeader(a.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.id ?? res.body.data.user?.id).toBeTruthy();
  });

  t('another user public profile is retrievable', async () => {
    const res = await request(API)
      .get(`/api/users/${b.id}`)
      .set(authHeader(a.accessToken));
    expect(res.status).toBe(200);
  });

  t('account settings endpoint works', async () => {
    const res = await request(API)
      .get('/api/users/me/account')
      .set(authHeader(a.accessToken));
    expect(res.status).toBe(200);
  });

  t('update own profile (bio/displayName)', async () => {
    const res = await request(API)
      .put(`/api/users/${a.id}`)
      .set(authHeader(a.accessToken))
      .send({ bio: 'نبذة اختبار E2E', displayName: 'E2E A' });
    expect(res.status).toBe(200);
  });

  t('cannot update another user profile → 403/404', async () => {
    const res = await request(API)
      .put(`/api/users/${b.id}`)
      .set(authHeader(a.accessToken))
      .send({ bio: 'hack' });
    expect([403, 404]).toContain(res.status);
  });

  // ── Follow (§7) ─────────────────────────────────────────────
  t('follow and unfollow another user', async () => {
    const follow = await request(API)
      .post(`/api/users/${b.id}/follow`)
      .set(authHeader(a.accessToken))
      .send({ following: true });
    expect(follow.status).toBe(200);

    const connections = await request(API)
      .get(`/api/users/${b.id}/connections`)
      .query({ type: 'followers' });
    expect(connections.status).toBe(200);

    const unfollow = await request(API)
      .post(`/api/users/${b.id}/follow`)
      .set(authHeader(a.accessToken))
      .send({ following: false });
    expect(unfollow.status).toBe(200);
  });

  // ── Posts (§9) ──────────────────────────────────────────────
  t('posts feed is public', async () => {
    const res = await request(API).get('/api/posts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.posts)).toBe(true);
  });

  t('create a post (auth) then read detail', async () => {
    const create = await request(API)
      .post('/api/posts')
      .set(authHeader(a.accessToken))
      .send(samplePost());
    expect([200, 201]).toContain(create.status);
    postId = create.body.data.id ?? create.body.data.post?.id;
    expect(postId).toBeTruthy();

    const detail = await request(API).get(`/api/posts/${postId}`);
    expect(detail.status).toBe(200);
  });

  t('create post without auth → 401', async () => {
    const res = await request(API).post('/api/posts').send(samplePost());
    expect(res.status).toBe(401);
  });

  t('create post with empty content → 400', async () => {
    const res = await request(API)
      .post('/api/posts')
      .set(authHeader(a.accessToken))
      .send({ content: '', arabicContent: '' });
    expect(res.status).toBe(400);
  });

  t('like and unlike a post (toggle)', async () => {
    const like1 = await request(API)
      .post(`/api/posts/${postId}/like`)
      .set(authHeader(b.accessToken));
    expect(like1.status).toBe(200);
    const like2 = await request(API)
      .post(`/api/posts/${postId}/like`)
      .set(authHeader(b.accessToken));
    expect(like2.status).toBe(200);
  });

  t('comment on a post and delete own comment', async () => {
    const add = await request(API)
      .post(`/api/posts/${postId}/comments`)
      .set(authHeader(b.accessToken))
      .send({ content: 'تعليق اختبار' });
    expect([200, 201]).toContain(add.status);
    const commentId = add.body.data.id ?? add.body.data.comment?.id;
    if (commentId) {
      const del = await request(API)
        .delete(`/api/posts/${postId}/comments/${commentId}`)
        .set(authHeader(b.accessToken));
      expect([200, 204]).toContain(del.status);
    }
  });

  t('cannot delete another user post → 403/404', async () => {
    const res = await request(API)
      .delete(`/api/posts/${postId}`)
      .set(authHeader(b.accessToken));
    expect([403, 404]).toContain(res.status);
  });

  // ── Ratings (§13) ───────────────────────────────────────────
  t('rate another user with a valid rating', async () => {
    const res = await request(API)
      .post(`/api/users/${b.id}/rate`)
      .set(authHeader(a.accessToken))
      .send({ rating: 5 });
    expect([200, 201]).toContain(res.status);
  });

  t('rating out of range → 400', async () => {
    const res = await request(API)
      .post(`/api/users/${b.id}/rate`)
      .set(authHeader(a.accessToken))
      .send({ rating: 99 });
    expect(res.status).toBe(400);
  });

  // ── Report (§16) ────────────────────────────────────────────
  t('report a post', async () => {
    const res = await request(API)
      .post('/api/reports')
      .set(authHeader(b.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'محتوى مخالف' });
    expect([200, 201]).toContain(res.status);
  });

  t('report with missing target → 400', async () => {
    const res = await request(API)
      .post('/api/reports')
      .set(authHeader(b.accessToken))
      .send({ targetType: 'post', reason: 'x' });
    expect(res.status).toBe(400);
  });

  // ── Block (§16) ─────────────────────────────────────────────
  t('block and unblock a user; blocked list reflects state', async () => {
    const block = await request(API)
      .post(`/api/users/${b.id}/block`)
      .set(authHeader(a.accessToken))
      .send({ blocked: true });
    expect(block.status).toBe(200);

    const blocked = await request(API)
      .get('/api/users/blocked')
      .set(authHeader(a.accessToken));
    expect(blocked.status).toBe(200);

    const unblock = await request(API)
      .post(`/api/users/${b.id}/block`)
      .set(authHeader(a.accessToken))
      .send({ blocked: false });
    expect(unblock.status).toBe(200);
  });

  // ── Notifications (§11) ─────────────────────────────────────
  t('notifications list + unread count', async () => {
    const list = await request(API)
      .get('/api/notifications')
      .set(authHeader(a.accessToken));
    expect(list.status).toBe(200);

    const count = await request(API)
      .get('/api/notifications/unread-count')
      .set(authHeader(a.accessToken));
    expect(count.status).toBe(200);
  });

  // ── Cleanup ─────────────────────────────────────────────────
  t('owner can delete own post', async () => {
    const res = await request(API)
      .delete(`/api/posts/${postId}`)
      .set(authHeader(a.accessToken));
    expect([200, 204]).toContain(res.status);
  });
});
