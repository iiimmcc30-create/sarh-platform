import { Injectable } from '@nestjs/common';
import { MessageThreadType } from '@prisma/client';
import { throwApi } from '../../common/exceptions/api.exception';
import { MessagesRepository } from '../repositories/messages.repository';

export const BUTCHER_DIRECT_CHAT_CLOSED_AR =
  'التواصل المباشر مع الملحمة غير متاح';

@Injectable()
export class MessagingPolicyService {
  constructor(private readonly repo: MessagesRepository) {}

  async assertNotBlocked(senderId: string, receiverId: string): Promise<void> {
    const [blockedBySender, blockedByReceiver] = await Promise.all([
      this.repo.findBlock(senderId, receiverId),
      this.repo.findBlock(receiverId, senderId),
    ]);
    if (blockedBySender || blockedByReceiver) {
      throwApi(403, 'blocked', 'لا يمكنك مراسلة هذا المستخدم');
    }
  }

  async assertDirectPrivacy(
    senderId: string,
    receiverId: string,
  ): Promise<void> {
    const receiver = await this.repo.findUserById(receiverId);
    if (!receiver) throwApi(404, 'not_found', 'المستخدم غير موجود');

    if (receiver.allowPrivateMessages === false) {
      throwApi(403, 'messages_disabled', 'هذا المستخدم لا يقبل الرسائل الخاصة');
    }
    if (receiver.privateMessagesAudience === 'following') {
      const allowed = await this.repo.findFollow(receiverId, senderId);
      if (!allowed) {
        throwApi(
          403,
          'messages_restricted',
          'هذا المستخدم يقبل الرسائل من الأشخاص الذين يتابعهم فقط',
        );
      }
    }
  }

  /**
   * Shop / customer↔butcher DMs are closed. Detects a butcher *shop owner*
   * via Butcher.userId, not JWT role alone.
   */
  async assertCustomerButcherChatClosed(
    senderId: string,
    receiverId: string,
    type: MessageThreadType,
    butcherId?: string | null,
  ): Promise<void> {
    if (type === 'BUTCHER' || butcherId) {
      throwApi(403, 'forbidden', BUTCHER_DIRECT_CHAT_CLOSED_AR);
    }

    const [senderShop, receiverShop] = await Promise.all([
      this.repo.findButcherByUserId(senderId),
      this.repo.findButcherByUserId(receiverId),
    ]);
    const senderIsShop = !!senderShop;
    const receiverIsShop = !!receiverShop;
    if (senderIsShop !== receiverIsShop) {
      throwApi(403, 'forbidden', BUTCHER_DIRECT_CHAT_CLOSED_AR);
    }
  }

  async assertCanSendMessage(params: {
    senderId: string;
    receiverId: string;
    type: MessageThreadType;
    butcherId?: string | null;
  }): Promise<void> {
    const { senderId, receiverId, type, butcherId } = params;
    if (receiverId === senderId) {
      throwApi(400, 'invalid_action', 'لا يمكنك مراسلة نفسك');
    }

    await this.assertNotBlocked(senderId, receiverId);
    await this.assertCustomerButcherChatClosed(
      senderId,
      receiverId,
      type,
      butcherId,
    );

    await this.assertDirectPrivacy(senderId, receiverId);
  }
}
