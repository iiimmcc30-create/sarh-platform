import { KnowledgeSourceType } from '@prisma/client';

/** Default RSS sources seeded when Knowledge Center is activated. */
export const DEFAULT_KNOWLEDGE_SOURCES: Array<{
  name: string;
  url: string;
  type: KnowledgeSourceType;
}> = [
  {
    name: 'أخبار الثروة الحيوانية (Google News)',
    url: 'https://news.google.com/rss/search?q=%D8%AB%D8%B1%D9%88%D8%A9+%D8%AD%D9%8A%D9%88%D8%A7%D9%86%D9%8A%D8%A9&hl=ar&gl=SA&ceid=SA:ar',
    type: KnowledgeSourceType.RSS,
  },
  {
    name: 'أخبار الزراعة والماشية (Google News)',
    url: 'https://news.google.com/rss/search?q=%D8%B2%D8%B1%D8%A7%D8%B9%D8%A9+%D9%85%D8%A7%D8%B4%D9%8A%D8%A9&hl=ar&gl=SA&ceid=SA:ar',
    type: KnowledgeSourceType.RSS,
  },
  {
    name: 'FAO News (EN)',
    url: 'https://www.fao.org/newsroom/rss/news/en/',
    type: KnowledgeSourceType.RSS,
  },
];
