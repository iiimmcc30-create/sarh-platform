/** Actor fields stored on a notification so the inbox can stack avatars and names. */
export function actorNotificationData(
  userId: string,
  user: {
    arabicName?: string | null;
    displayName?: string | null;
    username?: string | null;
    avatar?: string | null;
  } | null,
  fallbackUsername?: string | null,
): Record<string, string> {
  const name =
    user?.arabicName ||
    user?.displayName ||
    user?.username ||
    fallbackUsername ||
    'مستخدم';
  const data: Record<string, string> = {
    actorId: userId,
    actorName: name,
  };
  const username = user?.username || fallbackUsername;
  if (username) data.actorUsername = username;
  if (user?.avatar) data.actorAvatar = user.avatar;
  return data;
}
