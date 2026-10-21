import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useState, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import {
  REVIEW_COMMENT_MAX,
  canSubmitReview,
  reviewOathText,
  reviewPurchaseQuestion,
  reviewRecommendQuestion,
} from '@/lib/reviewCopy';
import { rtlInputText } from '@/lib/rtl';
import type { CreateReviewInput } from '@/services/reviews';


type Props = {
  visible: boolean;
  targetName: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateReviewInput) => void;
};

export function AddReviewDialog({ visible, targetName, submitting, onClose, onSubmit }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rating, setRating] = useState(0);
  const [oath, setOath] = useState(false);
  const [purchased, setPurchased] = useState<boolean | null>(null);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setRating(0);
      setOath(false);
      setPurchased(null);
      setRecommend(null);
      setComment('');
    }
  }

  const ready = canSubmitReview({ oath, purchased, recommend, comment, rating }) && !submitting;
  const name = targetName.trim() || 'هذا العضو';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={styles.card} accessibilityViewIsModal>
          <AppText style={styles.title}>إضافة تقييم</AppText>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${n} نجوم`}
              >
                <AppIcon name="star" variant={n <= rating ? 'sr' : 'rr'} size={28} color={n <= rating ? colors.tierGold : colors.borderStrong} />
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.oathRow}
            onPress={() => setOath((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: oath }}
          >
            <View style={[styles.checkbox, oath && styles.checkboxOn]}>
              {oath ? <AppIcon name="check" size={14} color={colors.onElectric} /> : null}
            </View>
            <AppText style={styles.oathText}>{reviewOathText(name)}</AppText>
          </Pressable>

          <Question
            title={reviewPurchaseQuestion(name)}
            value={purchased}
            onChange={setPurchased}
          />
          <Question
            title={reviewRecommendQuestion(name)}
            value={recommend}
            onChange={setRecommend}
          />

          <View style={styles.field}>
            <TextInput
              value={comment}
              onChangeText={(text) => setComment(text.slice(0, REVIEW_COMMENT_MAX))}
              placeholder="أضف تعليقك ..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={REVIEW_COMMENT_MAX}
              style={[styles.input, rtlInputText]}
              textAlignVertical="top"
            />
            <AppText style={styles.counter}>
              {comment.length}/{REVIEW_COMMENT_MAX}
            </AppText>
          </View>

          <Pressable
            style={[styles.send, !ready && styles.sendDisabled]}
            disabled={!ready}
            onPress={() => {
              if (purchased === null || recommend === null) return;
              onSubmit({
                rating,
                purchased,
                recommend,
                comment: comment.trim(),
                oathAccepted: true,
              });
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <AppText style={styles.sendText}>{submitting ? 'جارٍ الإرسال' : 'إرسال'}</AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Question({
  title,
  value,
  onChange,
}: {
  title: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.question}>
      <AppText style={styles.questionText}>{title}</AppText>
      <View style={styles.choices}>
        <Choice label="نعم" selected={value === true} onPress={() => onChange(true)} />
        <Choice label="لا" selected={value === false} onPress={() => onChange(false)} />
      </View>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={styles.choice} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <AppText style={styles.choiceLabel}>{label}</AppText>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: colors.bgOverlay,
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxHeight: '92%',
  },
  title: {
    textAlign: 'center',
    color: colors.electric,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  oathRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    marginTop: 2,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.electric,
  },
  oathText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 22,
  },
  question: {
    marginBottom: 14,
  },
  questionText: {
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  choices: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceLabel: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: colors.electric,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.electric,
  },
  field: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    backgroundColor: colors.bgField,
    minHeight: 110,
    marginBottom: 14,
  },
  input: {
    minHeight: 78,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  counter: {
    alignSelf: 'flex-start',
    color: colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  send: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: colors.borderStrong,
  },
  sendText: {
    color: colors.onElectric,
    fontSize: 18,
    fontWeight: '700',
  },
});
