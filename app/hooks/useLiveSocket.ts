import { useCallback, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket } from '@/lib/socket';

export interface LiveCommentPayload {
  id: string;
  userId?: string;
  username: string;
  arabicName?: string;
  message: string;
  isOffer?: boolean;
  offerAmount?: number;
  createdAt: string;
}

interface UseLiveSocketOptions {
  streamId: string | undefined;
  accessToken: string | null;
  enabled?: boolean;
  onComment?: (comment: LiveCommentPayload) => void;
  onViewers?: (count: number) => void;
  onLike?: () => void;
  onLikes?: (count: number) => void;
  onStats?: (stats: { viewers: number; likes: number; commentsCount: number }) => void;
}

export function useLiveSocket({
  streamId,
  accessToken,
  enabled = true,
  onComment,
  onViewers,
  onLike,
  onLikes,
  onStats,
}: UseLiveSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onCommentRef = useRef(onComment);
  const onViewersRef = useRef(onViewers);
  const onLikeRef = useRef(onLike);
  const onLikesRef = useRef(onLikes);
  const onStatsRef = useRef(onStats);

  onCommentRef.current = onComment;
  onViewersRef.current = onViewers;
  onLikeRef.current = onLike;
  onLikesRef.current = onLikes;
  onStatsRef.current = onStats;

  useEffect(() => {
    if (!enabled || !streamId || !accessToken) return;

    const socket = connectSocket(accessToken);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('live:join', streamId);
    });

    socket.on('live:comment', (comment: LiveCommentPayload) => {
      onCommentRef.current?.(comment);
    });

    socket.on('live:viewers', (count: number) => {
      onViewersRef.current?.(count);
    });

    socket.on('live:like', (payload: { userId?: string; likes?: number } | undefined) => {
      if (typeof payload?.likes === 'number') {
        onLikesRef.current?.(payload.likes);
      } else {
        onLikeRef.current?.();
      }
    });

    socket.on('live:likes', (likes: number) => {
      onLikesRef.current?.(likes);
    });

    socket.on('live:stats', (stats: { viewers: number; likes: number; commentsCount: number }) => {
      onStatsRef.current?.(stats);
      onViewersRef.current?.(stats.viewers);
      onLikesRef.current?.(stats.likes);
    });

    return () => {
      socket.emit('live:leave', streamId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [streamId, accessToken, enabled]);

  const sendComment = useCallback(
    (message: string, isOffer = false, offerAmount?: number) => {
      if (!streamId || !socketRef.current) return;
      socketRef.current.emit('live:comment', { streamId, message, isOffer, offerAmount });
    },
    [streamId]
  );

  const sendLike = useCallback(() => {
    if (!streamId || !socketRef.current) return;
    socketRef.current.emit('live:like', streamId);
  }, [streamId]);

  return { sendComment, sendLike };
}
