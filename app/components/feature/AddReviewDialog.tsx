import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { reviewPalette as palette } from '@/components/feature/reviews/reviewPalette';
import { AppText } from '@/design-system/components';
import { appFont } from '@/constants/fonts';
import {
  REVIEW_COMMENT_MAX,
  canSubmitReview,
  reviewOathText,
  reviewPurchaseQuestion,
  reviewRecommendQuestion,
} from '@/lib/reviewForm';
import { getRtlRow, getRtlText } from '@/lib/rtl';

type Props = {
  visible: boolean;
  targetName: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    rating: number;
    purchased: boolean;
    recommend: boolean;
    comment: string;
  }) => void;
};

function Radio({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[getRtlRow(), styles.radio]}
      hitSlop={8}
    >
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <AppText variant="body" style={styles.radioLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function AddReviewDialog({
  visible,
  targetName,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [oath, setOath] = useState(false);
  const [purchased, setPurchased] = useState<boolean | null>(null);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const ready = canSubmitReview({ oath, purchased, recommend, rating, comment }) && !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق">
          <Pressable style={styles.card} onPress={() => undefined} testID="add-review-dialog">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.cardBody}
              bounces={false}
            >
              <AppText variant="heading3" style={styles.title}>
                إضافة تقييم
              </AppText>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: oath }}
                onPress={() => setOath((value) => !value)}
                style={[getRtlRow(), styles.oathRow]}
                testID="add-review-oath"
              >
                <AppText variant="caption" style={styles.oathText}>
                  {reviewOathText(targetName)}
                </AppText>
                <View style={[styles.checkbox, oath && styles.checkboxOn]}>
                  {oath ? <AppIcon name="check" size={14} color={palette.onHeader} /> : null}
                </View>
              </Pressable>

              <Question
                title={reviewPurchaseQuestion(targetName)}
                value={purchased}
                onChange={setPurchased}
              />
              <Question
                title={reviewRecommendQuestion(targetName)}
                value={recommend}
                onChange={setRecommend}
              />

              <AppText variant="label" style={styles.starTitle}>
                تقييمك بالنجوم
              </AppText>
              <View style={[getRtlRow(), styles.stars]}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} من 5`}
                    onPress={() => setRating(n)}
                    hitSlop={6}
                    testID={`add-review-star-${n}`}
                  >
                    <AppIcon
                      name="star"
                      variant={n <= rating ? 'sr' : 'rr'}
                      size={32}
                      color={n <= rating ? palette.star : palette.starEmpty}
                    />
                  </Pressable>
                ))}
              </View>

              <View style={styles.field}>
                <TextInput
                  value={comment}
                  onChangeText={(value) => setComment(value.slice(0, REVIEW_COMMENT_MAX))}
                  placeholder="أضف تعليقك ..."
                  placeholderTextColor={palette.muted}
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, getRtlText(), { fontFamily: appFont.regular }]}
                  testID="add-review-comment"
                />
                <AppText variant="caption" style={styles.counter}>
                  {comment.length}/{REVIEW_COMMENT_MAX}
                </AppText>
              </View>

              {error ? (
                <AppText variant="caption" style={styles.error}>
                  {error}
                </AppText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                disabled={!ready}
                onPress={() => {
                  if (purchased === null || recommend === null) return;
                  onSubmit({
                    rating,
                    purchased,
                    recommend,
                    comment: comment.trim(),
                  });
                }}
                style={[styles.send, !ready && styles.sendOff]}
                testID="add-review-submit"
              >
                <AppText variant="button" style={[styles.sendText, !ready && styles.sendTextOff]}>
                  {submitting ? 'جارٍ الإرسال' : 'إرسال'}
                </AppText>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
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
  return (
    <View style={styles.question}>
      <AppText variant="body" style={styles.questionTitle}>
        {title}
      </AppText>
      <View style={[getRtlRow(), styles.answers]}>
        <Radio label="نعم" selected={value === true} onPress={() => onChange(true)} />
        <Radio label="لا" selected={value === false} onPress={() => onChange(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  cardBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },
  title: {
    color: palette.name,
    textAlign: 'center',
    marginBottom: 14,
  },
  oathRow: {
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  oathText: {
    flex: 1,
    color: palette.text,
    lineHeight: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#C5CAD3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: palette.header,
    borderColor: palette.header,
  },
  question: {
    marginBottom: 14,
  },
  questionTitle: {
    color: palette.text,
    marginBottom: 8,
  },
  answers: {
    justifyContent: 'center',
    gap: 36,
  },
  radio: {
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#C5CAD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: palette.header,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.header,
  },
  radioLabel: {
    color: palette.text,
  },
  starTitle: {
    color: palette.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  stars: {
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  field: {
    borderWidth: 1.5,
    borderColor: palette.header,
    borderRadius: 12,
    backgroundColor: palette.field,
    minHeight: 120,
    padding: 10,
    marginBottom: 12,
  },
  input: {
    minHeight: 78,
    color: palette.text,
    fontSize: 15,
    padding: 0,
  },
  counter: {
    color: palette.muted,
    alignSelf: 'flex-end',
  },
  error: {
    color: palette.negative,
    marginBottom: 8,
  },
  send: {
    height: 48,
    borderRadius: 10,
    backgroundColor: palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: {
    backgroundColor: palette.disabled,
  },
  sendText: {
    color: palette.onHeader,
  },
  sendTextOff: {
    color: palette.disabledText,
  },
});

export default AddReviewDialog;
