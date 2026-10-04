import type {
  AnimalType,
  Confidence,
  Gender,
  LivestockTermEntry,
  TermCategory,
  TermMeaning,
} from '../livestock-terms.types';

/**
 * Core marketplace vocabulary (animal types, gendered nouns, trade words).
 * Source: 'sarh-core' (INTERNAL) - common Arabic livestock words curated by
 * Sarh to link searches. No definitions are claimed (meaning = null); only the
 * structural mapping (animal type / gender) is recorded, at medium confidence.
 */

const CORE = 'sarh-core';

function core(
  id: string,
  canonical: string,
  aliases: string[],
  category: TermCategory,
  extra: Partial<TermMeaning> = {},
): LivestockTermEntry {
  return {
    id: `core-${id}`,
    canonical,
    aliases,
    meanings: [
      {
        meaning: null,
        category,
        region: 'unspecified',
        confidence: 'medium',
        sourceId: CORE,
        searchable: true,
        ...extra,
      },
    ],
  };
}

function animal(
  id: string,
  canonical: string,
  aliases: string[],
  a: AnimalType,
  related: string[] = [],
) {
  return core(id, canonical, aliases, 'animal_type', {
    animalTypes: [a],
    related,
  });
}

function gendered(
  id: string,
  canonical: string,
  aliases: string[],
  a: AnimalType,
  gender: Gender | undefined,
  extra: Partial<TermMeaning> = {},
) {
  return core(id, canonical, aliases, gender ? 'gender' : 'age_stage', {
    animalTypes: [a],
    gender,
    ...extra,
  });
}

/** A second, non-livestock sense - stored so it is never auto-assumed. */
function generalSense(
  note: string,
  confidence: Confidence = 'low',
): TermMeaning {
  return {
    meaning: null,
    category: 'general',
    region: 'unspecified',
    confidence,
    sourceId: CORE,
    searchable: false,
    note,
  };
}

export const CORE_LIVESTOCK_TERMS: readonly LivestockTermEntry[] = [
  // Animal types
  animal(
    'sheep',
    'أغنام',
    ['غنم', 'ضأن', 'ضان', 'خراف', 'خرفان', 'خروف'],
    'sheep',
    ['حلال'],
  ),
  animal('goat', 'ماعز', ['معز', 'معزى'], 'goat', ['حلال']),
  animal('camel', 'إبل', ['جمال', 'بعير', 'بعارين'], 'camel'),
  animal('cattle', 'أبقار', ['بقر'], 'cattle'),
  animal('horse', 'خيل', ['خيول', 'أحصنة'], 'horse'),
  core('livestock', 'مواشي', ['ماشية', 'أنعام'], 'animal_group', {
    animalTypes: ['sheep', 'goat', 'camel', 'cattle'],
  }),

  // Gendered / young nouns
  gendered('ewe', 'نعجة', ['نعاج'], 'sheep', 'female', { adCombo: true }),
  gendered('ram', 'كبش', ['كباش'], 'sheep', 'male'),
  gendered('she-goat', 'عنز', ['عنوز', 'عنزة'], 'goat', 'female', {
    adCombo: true,
  }),
  gendered('billy', 'تيس', ['تيوس'], 'goat', 'male'),
  gendered('kid', 'جدي', ['جديان'], 'goat', undefined, { ageStage: 'جدي' }),
  gendered('she-camel', 'ناقة', ['نوق'], 'camel', 'female', { adCombo: true }),
  gendered('he-camel', 'جمل', [], 'camel', 'male'),
  gendered('young-camel', 'حاشي', ['حواشي'], 'camel', undefined, {
    ageStage: 'حاشي',
  }),
  gendered('qaoud', 'قعود', ['قعدان'], 'camel', 'male', { ageStage: 'قعود' }),
  {
    id: 'core-bakra',
    canonical: 'بكرة',
    aliases: ['بكار'],
    meanings: [
      {
        meaning: null,
        category: 'gender',
        animalTypes: ['camel'],
        gender: 'female',
        ageStage: 'بكرة',
        region: 'unspecified',
        confidence: 'medium',
        sourceId: CORE,
        searchable: true,
      },
      generalSense(
        'قد تأتي بمعنى "غداً" بالعامية؛ لا تُفسَّر كعمر دون سياق حيوان.',
      ),
    ],
  },
  gendered('cow', 'بقرة', [], 'cattle', 'female'),
  gendered('bull', 'ثور', ['ثيران'], 'cattle', 'male'),
  gendered('calf', 'عجل', ['عجول', 'عجلة'], 'cattle', undefined, {
    ageStage: 'عجل',
  }),
  gendered('mare', 'فرس', [], 'horse', 'female'),
  gendered('stallion', 'حصان', [], 'horse', 'male'),
  gendered('foal', 'مهر', ['مهرة', 'أمهار'], 'horse', undefined, {
    ageStage: 'مهر',
  }),

  // Common market age / state words (structure only, no definitions claimed).
  gendered('hawar', 'حوار', ['حيران'], 'camel', undefined, {
    ageStage: 'حوار',
  }),
  gendered('mafrood', 'مفرود', ['مفاريد'], 'camel', undefined, {
    ageStage: 'مفرود',
  }),
  gendered('laboon', 'لبون', ['بنت لبون', 'ابن لبون'], 'camel', undefined, {
    ageStage: 'لبون',
  }),
  {
    id: 'core-hiq',
    canonical: 'حق',
    aliases: ['حقة', 'حقايق'],
    meanings: [
      {
        meaning: null,
        category: 'age_stage',
        region: 'unspecified',
        confidence: 'medium',
        sourceId: CORE,
        searchable: true,
        animalTypes: ['camel'],
        ageStage: 'حق',
      },
      generalSense(
        'بمعناها العام (الحق) خارج سياق الإبل؛ لا تُفسَّر كعمر دون سياق حيوان.',
      ),
    ],
  },
  {
    id: 'core-lagi',
    canonical: 'لقي',
    aliases: ['لقية', 'لقايا'],
    meanings: [
      {
        meaning: null,
        category: 'age_stage',
        region: 'unspecified',
        confidence: 'medium',
        sourceId: CORE,
        searchable: true,
        animalTypes: ['camel'],
        ageStage: 'لقي',
      },
      generalSense('قد تأتي بمعنى "وجد/لقِي"؛ لا تُفسَّر كعمر دون سياق حيوان.'),
    ],
  },
  core('fateem', 'فطيم', [], 'age_stage', {
    animalTypes: ['sheep', 'goat', 'camel', 'cattle'],
    ageStage: 'فطيم',
  }),
  core('radee', 'رضيع', ['رضع'], 'age_stage', {
    animalTypes: ['sheep', 'goat', 'camel', 'cattle'],
    ageStage: 'رضيع',
  }),
  core('sakhl', 'سخل', ['سخلة', 'سخال'], 'age_stage', {
    animalTypes: ['sheep', 'goat'],
    ageStage: 'سخل',
  }),
  core('hawli', 'حولي', [], 'age_stage', {
    animalTypes: ['sheep', 'goat', 'camel'],
    ageStage: 'حولي',
  }),
  core('sedees', 'سديس', [], 'age_stage', {
    animalTypes: ['sheep', 'goat', 'camel'],
    ageStage: 'سديس',
  }),
  core('khalfa', 'خلفة', ['خلفات'], 'reproductive_status', {
    animalTypes: ['camel'],
    gender: 'female',
  }),
  core('ashra', 'عشراء', ['عشار'], 'reproductive_status', {
    animalTypes: ['camel'],
    gender: 'female',
  }),
  core('thalool', 'ذلول', ['ذلل'], 'trait', { animalTypes: ['camel'] }),
  core('hejn', 'هجن', ['هجين'], 'trait', { animalTypes: ['camel'] }),

  // Trade / ad vocabulary
  core('for-sale', 'للبيع', ['بيع'], 'trade', { adCombo: true }),
  core('wanted', 'مطلوب', ['شراء'], 'trade'),
  core('auction', 'مزاد', ['مزادات'], 'trade'),
  core('haraj', 'حراج', [], 'trade'),
  core('slaughter', 'ذبيحة', ['ذبايح', 'ذبائح'], 'trade'),
  core('udhiya', 'أضحية', ['اضحية', 'أضاحي', 'اضاحي'], 'trade'),

  // Second senses for words that also exist outside livestock.
  {
    id: 'core-halal-general',
    canonical: 'حلال',
    meanings: [generalSense('بمعناها العام (المباح) خارج سياق المواشي.')],
  },
  {
    id: 'core-hayel-place',
    canonical: 'حايل',
    aliases: ['حائل'],
    meanings: [
      generalSense(
        'قد تشير إلى منطقة/مدينة حائل؛ لا تُفسَّر كحالة حمل دون سياق حيوان.',
      ),
    ],
  },
];
