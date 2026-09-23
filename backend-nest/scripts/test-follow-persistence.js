/* eslint-disable no-console */
require('dotenv').config();

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apiBase = process.env.FOLLOW_TEST_API_BASE || 'http://localhost:3001/api';
const viewerUsername = process.env.FOLLOW_TEST_VIEWER_USERNAME || 'sarh';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function accessTokenFor(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      passwordVersion: user.passwordVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  );
}

async function api(path, token, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(
      `${init.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(json)}`,
    );
  }
  return json.data;
}

async function main() {
  assert(process.env.JWT_SECRET, 'JWT_SECRET is required');

  const viewer = await prisma.user.findFirst({
    where: {
      username: { equals: viewerUsername, mode: 'insensitive' },
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      username: true,
      role: true,
      passwordVersion: true,
    },
  });
  assert(viewer, `Active viewer @${viewerUsername} was not found`);

  const suffix = crypto.randomBytes(6).toString('hex');
  const target = await prisma.user.create({
    data: {
      username: `follow_test_${suffix}`,
      passwordHash: 'integration-test-account-not-loginable',
      displayName: 'Follow Persistence Test',
      arabicName: 'اختبار ثبات المتابعة',
      isActive: true,
    },
    select: { id: true, username: true },
  });

  try {
    const token = accessTokenFor(viewer);

    const followed = await api(`/users/${target.id}/follow`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ following: true }),
    });
    assert(followed.following === true, 'Follow mutation did not return true');

    const dbFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewer.id,
          followingId: target.id,
        },
      },
    });
    assert(dbFollow, 'PostgreSQL did not persist the follow relationship');

    const repeatedFollow = await api(`/users/${target.id}/follow`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ following: true }),
    });
    assert(repeatedFollow.following === true, 'Repeated follow was not idempotent');
    const duplicateCount = await prisma.follow.count({
      where: { followerId: viewer.id, followingId: target.id },
    });
    assert(duplicateCount === 1, 'Repeated follow created a duplicate relationship');

    const profileAfterFollow = await api(`/users/${target.id}`, token);
    assert(
      typeof profileAfterFollow.isFollowing === 'boolean',
      'Profile endpoint did not return boolean isFollowing',
    );
    assert(profileAfterFollow.isFollowing === true, 'Profile returned false after follow');

    const followingList = await api(
      `/users/${viewer.id}/connections?type=following`,
      token,
    );
    const targetInList = followingList.users.find((user) => user.id === target.id);
    assert(targetInList, 'Target is missing from the Following list');
    assert(
      targetInList.isFollowing === true,
      'Following list did not resolve viewer relationship',
    );

    // Simulate a cold app start: create a fresh token and make a new profile
    // request with no client-side follow state.
    const freshSessionToken = accessTokenFor(viewer);
    const profileAfterColdStart = await api(`/users/${target.id}`, freshSessionToken);
    assert(
      profileAfterColdStart.isFollowing === true,
      'Fresh authenticated profile request lost the follow relationship',
    );

    const unfollowed = await api(`/users/${target.id}/follow`, freshSessionToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ following: false }),
    });
    assert(unfollowed.following === false, 'Unfollow mutation did not return false');

    const deletedFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewer.id,
          followingId: target.id,
        },
      },
    });
    assert(!deletedFollow, 'PostgreSQL still contains the relationship after unfollow');

    const repeatedUnfollow = await api(`/users/${target.id}/follow`, freshSessionToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ following: false }),
    });
    assert(repeatedUnfollow.following === false, 'Repeated unfollow was not idempotent');

    const profileAfterUnfollow = await api(
      `/users/${target.id}`,
      accessTokenFor(viewer),
    );
    assert(
      typeof profileAfterUnfollow.isFollowing === 'boolean',
      'Profile endpoint omitted boolean isFollowing after unfollow',
    );
    assert(profileAfterUnfollow.isFollowing === false, 'Profile returned true after unfollow');

    const listAfterUnfollow = await api(
      `/users/${viewer.id}/connections?type=following`,
      accessTokenFor(viewer),
    );
    assert(
      !listAfterUnfollow.users.some((user) => user.id === target.id),
      'Following list still contains target after unfollow',
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          viewer: viewer.username,
          checks: [
            'follow persisted in PostgreSQL',
            'repeated follow remained idempotent with no duplicate',
            'profile isFollowing=true',
            'following list refreshed',
            'cold-start profile isFollowing=true',
            'unfollow removed from PostgreSQL',
            'repeated unfollow remained idempotent',
            'cold-start profile isFollowing=false',
            'following list removed target',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    // Give asynchronous notification work a moment to settle, then remove all
    // temporary rows through the User cascade relations.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await prisma.user.delete({ where: { id: target.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
