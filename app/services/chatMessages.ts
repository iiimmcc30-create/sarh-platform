export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  video?: string;
  orderId?: string;
  createdAt: string;
  read: boolean;
};
