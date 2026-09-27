import { Injectable } from '@nestjs/common';
import { throwApi } from '../../common/exceptions/api.exception';
import { MessagesRepository } from '../repositories/messages.repository';

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

  async assertCanSendMessage(params: {
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const { senderId, receiverId } = params;
    if (receiverId === senderId) {
      throwApi(400, 'invalid_action', 'لا يمكنك مراسلة نفسك');
    }

    await this.assertNotBlocked(senderId, receiverId);

    await this.assertDirectPrivacy(senderId, receiverId);
  }
}
