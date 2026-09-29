/** Official message kinds (mirrors backend `MessageContentType`). */
export type ChatMessageKind = 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE';

/** Client-only delivery state for optimistic / uploading messages. */
export type ChatMessageStatus = 'sending' | 'uploading' | 'failed';

export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  video?: string;
  /** Voice note URL (VOICE messages). */
  audio?: string;
  /** Media duration in milliseconds (voice notes, optionally video). */
  durationMs?: number;
  kind?: ChatMessageKind;
  orderId?: string;
  createdAt: string;
  read: boolean;
  status?: ChatMessageStatus;
  /** 0..1 upload progress while `status === 'uploading'`. */
  progress?: number;
  /** Arabic failure reason while `status === 'failed'`. */
  error?: string;
};
