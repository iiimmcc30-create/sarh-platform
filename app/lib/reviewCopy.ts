export const REVIEW_COMMENT_MAX = 1000;

export function reviewOathText(name: string): string {
  return `أتعهد وأقسم بالله أنني قمت بشراء سلعة من العضو ${name} وأن المعلومات التي أقدمها في التقييم هي معلومات صحيحة ودقيقة وأتحمل مسؤولية صحة هذه المعلومات`;
}

export function reviewPurchaseQuestion(name: string): string {
  return `هل قمت بشراء سلعة من ${name}؟`;
}

export function reviewRecommendQuestion(name: string): string {
  return `هل تنصح بالتعامل مع البائع ${name}؟`;
}

export function canSubmitReview(input: {
  oath: boolean;
  purchased: boolean | null;
  recommend: boolean | null;
  comment: string;
  rating: number;
}): boolean {
  const comment = input.comment.trim();
  return (
    input.oath &&
    input.purchased !== null &&
    input.recommend !== null &&
    comment.length > 0 &&
    comment.length <= REVIEW_COMMENT_MAX &&
    Number.isInteger(input.rating) &&
    input.rating >= 1 &&
    input.rating <= 5
  );
}
