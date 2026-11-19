import { useRouter } from 'expo-router';
import { AppText } from '@/design-system/components';
import type { AppTextColor, AppTextVariant } from '@/design-system/components/resolvers';
import type { StyleProp, TextStyle } from 'react-native';
import { tokenizeRichText } from '@/lib/mentions';

const MENTION = '#1D9BF0';

type Props = {
  text: string;
  variant?: AppTextVariant;
  color?: AppTextColor;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

/** Renders @username as a tappable profile link. Hashtags stay colored. */
export function MentionText({ text, variant = 'body', color, style, numberOfLines }: Props) {
  const router = useRouter();
  const tokens = tokenizeRichText(text);
  return (
    <AppText variant={variant} color={color} style={style} numberOfLines={numberOfLines}>
      {tokens.map((token, index) => {
        if (token.kind === 'text') return token.text;
        if (token.kind === 'hashtag') {
          return (
            <AppText key={index} variant={variant} style={[style, { color: MENTION }]}>
              {token.text}
            </AppText>
          );
        }
        return (
          <AppText
            key={index}
            variant={variant}
            style={[style, { color: MENTION }]}
            onPress={() =>
              router.push({ pathname: '/u/[username]', params: { username: token.username } } as never)
            }
          >
            {token.text}
          </AppText>
        );
      })}
    </AppText>
  );
}
