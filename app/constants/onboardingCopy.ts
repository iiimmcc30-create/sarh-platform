export type OnboardingSlide = {
  id: string;
  title: string;
  description: string;
  image: number;
};

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'livestock',
    title: 'كل ما يخص الثروة الحيوانية في مكان واحد',
    description: 'من المواشي إلى السوق، ومن الأخبار إلى العروض، كل ما تحتاجه تجده هنا.',
    image: require('../assets/images/onboarding/slide-1.jpg'),
  },
  {
    id: 'market',
    title: 'سوق المواشي بكل سهولة',
    description: 'تصفح الإعلانات، تواصل مع البائعين، وابحث عن ما يناسبك بخطوات بسيطة.',
    image: require('../assets/images/onboarding/slide-2.jpg'),
  },
  {
    id: 'community',
    title: 'مجتمع ومحتوى يلهمك ويثري معرفتك',
    description: 'تابع آخر الأخبار والمقالات، وشارك خبراتك مع مجتمع يهتم مثلك.',
    image: require('../assets/images/onboarding/slide-3.jpg'),
  },
];

export const ONBOARDING_SKIP_LABEL = 'تخطي';
export const ONBOARDING_NEXT_LABEL = 'التالي';
export const ONBOARDING_START_LABEL = 'ابدأ الآن';
