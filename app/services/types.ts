// Powered by OnSpace.AI
// SAFAT — Type definitions and configuration metadata

export type Country = 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM' | 'EG';

export const countries: Record<Country, { en: string; ar: string; flag: string; phoneCode: string; currency: string }> = {
  SA: { en: 'Saudi Arabia', ar: 'السعودية', flag: '🇸🇦', phoneCode: '+966', currency: 'SAR' },
  AE: { en: 'UAE', ar: 'الإمارات', flag: '🇦🇪', phoneCode: '+971', currency: 'AED' },
  KW: { en: 'Kuwait', ar: 'الكويت', flag: '🇰🇼', phoneCode: '+965', currency: 'KWD' },
  QA: { en: 'Qatar', ar: 'قطر', flag: '🇶🇦', phoneCode: '+974', currency: 'QAR' },
  BH: { en: 'Bahrain', ar: 'البحرين', flag: '🇧🇭', phoneCode: '+973', currency: 'BHD' },
  OM: { en: 'Oman', ar: 'عُمان', flag: '🇴🇲', phoneCode: '+968', currency: 'OMR' },
  EG: { en: 'Egypt', ar: 'مصر', flag: '🇪🇬', phoneCode: '+20', currency: 'EGP' },
};

export function getCountryInfo(code?: string | null) {
  if (code && code in countries) return countries[code as Country];
  return countries.SA;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  coverImage?: string;
  verified: boolean;
  isAI?: boolean;
  followers: number;
  following: number;
  postsCount?: number;
  rating: number | null;
  reviewCount?: number;
  country: Country;
  bio: string;
  nameChangedAt?: string | null;
  usernameChangedAt?: string | null;
  nameNextAllowedAt?: string | null;
  usernameNextAllowedAt?: string | null;
}

export interface LiveStream {
  id: string;
  host: User;
  title: string;
  arabicTitle: string;
  thumbnail: string;
  viewers: number;
  likes: number;
  category: string;
  comments: LiveComment[];
  topic: string;
}

export interface LiveComment {
  id: string;
  user: string;
  arabicUser: string;
  message: string;
  avatar: string;
  isOffer?: boolean;
  amount?: number;
}

export interface Listing {
  id: string;
  title: string;
  arabicTitle: string;
  price: number;
  currency: string;
  category:
    | 'camels'
    | 'sheep'
    | 'goats'
    | 'cows'
    | 'horses'
    | 'birds'
    | 'feed'
    | 'equipment'
    | 'livestock'
    | 'transport'
    | 'slaughter';
  categoryId?: string;
  subcategoryId?: string;
  categoryNameAr?: string;
  subcategoryNameAr?: string;
  breed: string;
  age: string;
  location: string;
  arabicLocation: string;
  country: Country;
  contactPhone?: string;
  /** Weight in kg — required for ذبائح (slaughter) only */
  weightKg?: number;
  /** Parent category requires weight (ذبائح) */
  requiresWeight?: boolean;
  images: string[];
  /** Dedicated listing video — separate from the image gallery */
  videoUrl?: string;
  thumbnailUrl?: string;
  description: string;
  arabicDescription: string;
  /** USER listings keep a real seller. ADMIN_MANAGED has display identity and an empty seller id. */
  origin?: 'USER' | 'ADMIN_MANAGED';
  displayUsername?: string;
  displaySellerName?: string;
  displayPhone?: string;
  displayRegion?: string;
  seller: User;
  featured: boolean;
  pinned: boolean;
  promoted?: boolean;
  promotedUntil?: string;
  promotionWeight?: number;
  postedAt: string;
  /** ISO timestamp for relative time (Haraj-style: قبل ٢٤ دقيقة) */
  createdAt?: string;
  /** View count from API when available */
  views?: number;
  /** Owner edits used — regular users may edit once */
  editCount?: number;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  arabicContent: string;
  image?: string;
  /** Multiple images (carousel) — falls back to [image] when only a single image exists */
  images?: string[];
  /** Post video, if present — rendered full-width in place of the image gallery */
  video?: string;
  likes: number;
  reposts: number;
  comments: number;
  /** View count, when tracked by the backend */
  views?: number;
  postedAt: string;
  /** ISO timestamp — used to merge posts + listings into one timeline on profile pages */
  createdAt?: string;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
}

export interface PostComment {
  id: string;
  content: string;
  author: User;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  user: User;
  lastMessage: string;
  lastArabic: string;
  time: string;
  unread: number;
}

export interface ActivityItem {
  id: string;
  type: 'like' | 'follow' | 'comment' | 'repost' | 'live' | 'market';
  user: User;
  text: string;
  arabicText: string;
  time: string;
}

export interface Story {
  id: string;
  user: User;
  thumbnail: string;
  mediaUrl?: string;
  caption?: string;
  captionAr?: string;
  location?: string;
  seen: boolean;
  isLive?: boolean;
  liveStreamId?: string;
  listingId?: string;
  viewsCount?: number;
  reactionsCount?: number;
  myReaction?: string | null;
  duration: number;
}

export const users: User[] = [];
export const liveStreams: LiveStream[] = [];
export const listings: Listing[] = [];
export const posts: Post[] = [];
export const chats: ChatThread[] = [];
export const activity: ActivityItem[] = [];
export const stories: Story[] = [];
