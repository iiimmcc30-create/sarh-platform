import type {
  AnimalType,
  Confidence,
  LivestockTermEntry,
  TermMeaning,
} from '../livestock-terms.types';

/**
 * Breeds and colour groups found in reviewed sources (see ./sources.ts).
 * A definition is recorded only when the cited source states it; otherwise
 * meaning = null and the entry is just an attested breed name.
 */

function breed(
  animal: AnimalType,
  meaning: string | null,
  sourceId: string,
  confidence: Confidence,
  extra: Partial<TermMeaning> = {},
): TermMeaning {
  return {
    meaning,
    category: 'breed',
    animalTypes: [animal],
    region: 'saudi',
    confidence,
    sourceId,
    searchable: true,
    ...extra,
  };
}

function camelColour(
  meaning: string | null,
  sourceId: string,
  confidence: Confidence = 'medium',
): TermMeaning {
  return {
    meaning,
    category: 'trait',
    animalTypes: ['camel'],
    attribute: 'لون',
    region: 'saudi',
    confidence,
    sourceId,
    searchable: true,
  };
}

function e(
  id: string,
  canonical: string,
  meanings: TermMeaning[],
  aliases: string[] = [],
): LivestockTermEntry {
  return { id: `breed-${id}`, canonical, aliases, meanings };
}

export const BREED_TERMS: readonly LivestockTermEntry[] = [
  // Sheep
  e(
    'naemi',
    'نعيمي',
    [
      breed(
        'sheep',
        'من سلالات الأغنام المعروفة في السعودية، ويسمى أيضاً العواسي الصحراوي.',
        'scipub-sheep-2013',
        'high',
      ),
    ],
    ['نعيمية'],
  ),
  e(
    'najdi',
    'نجدي',
    [
      breed(
        'sheep',
        'سلالة أغنام محلية متعددة الأغراض (لحم وحليب وصوف)، من سماتها الغطاء الأسود مع رأس أبيض.',
        'scipub-sheep-2013',
        'high',
      ),
      breed('goat', 'من سلالات الماعز السعودية.', 'idosi-goats-2013', 'high'),
    ],
    ['نجدية'],
  ),
  e('harri', 'حري', [
    breed(
      'sheep',
      'سلالة أغنام محلية ترتبط تسميتها بالحرات البركانية شمال غرب الجزيرة العربية، وتنتشر في القصيم وسهول الحجاز وتهامة والسروات.',
      'scipub-sheep-2013',
      'high',
      { adCombo: true },
    ),
    breed('goat', 'من سلالات الماعز السعودية.', 'idosi-goats-2013', 'high'),
  ]),
  e(
    'sawakni',
    'سواكني',
    [
      breed(
        'sheep',
        'سلالة أغنام مستوردة إلى المملكة من السودان، وليست محلية.',
        'scipub-sheep-2013',
        'high',
      ),
    ],
    ['سواكنية'],
  ),
  e('awassi', 'عواسي', [
    breed(
      'sheep',
      'سلالة أغنام من جنوب غرب آسيا نشأت في بادية الشام.',
      'scipub-sheep-2013',
      'high',
      {
        region: 'levant',
        related: ['نعيمي'],
      },
    ),
  ]),
  e('assaf', 'عساف', [
    breed('sheep', null, 'hummmyyummmy-sheep-2024', 'low', {
      note: 'ورد اسماً ضمن أنواع الغنم في محتوى تجاري دون تعريف.',
    }),
  ]),

  // Goats
  e(
    'ardi',
    'عارضي',
    [
      breed(
        'goat',
        'أكبر سلالات الماعز في السعودية، ويربى في الظروف الصحراوية القاسية.',
        'springer-ardi-2018',
        'high',
      ),
    ],
    ['عارضية'],
  ),
  e(
    'hejazi',
    'حجازي',
    [
      breed(
        'goat',
        'ماعز غالباً أسود طويل الشعر، يربى أساساً لإنتاج اللحم.',
        'jksus-goats',
        'high',
      ),
    ],
    ['حجازية'],
  ),
  e('jabali', 'جبلي', [breed('goat', null, 'springer-ardi-2018', 'medium')]),
  e('bishi', 'بيشي', [breed('goat', null, 'springer-ardi-2018', 'medium')]),
  e('habsi', 'حبسي', [breed('goat', null, 'springer-ardi-2018', 'medium')]),
  e('tohami', 'تهامي', [breed('goat', null, 'ajol-ardi', 'medium')]),
  e('najrani', 'نجراني', [breed('goat', null, 'ajol-ardi', 'medium')]),
  e(
    'shami',
    'شامي',
    [
      breed(
        'goat',
        'الماعز الدمشقي، أُدخل إلى المملكة أساساً لإنتاج الحليب.',
        'jksus-goats',
        'high',
        { region: 'levant' },
      ),
    ],
    ['دمشقي'],
  ),

  // Cattle
  e('hassawi', 'حساوي', [
    breed(
      'cattle',
      'سلالة أبقار زيبو محلية في المنطقة الشرقية، وأعدادها في تناقص.',
      'cambridge-cattle-2015',
      'high',
    ),
  ]),
  e('janobi', 'جنوبي', [
    breed(
      'cattle',
      'سلالة أبقار زيبو محلية شائعة في جنوب غرب المملكة.',
      'cambridge-cattle-2015',
      'high',
    ),
    {
      meaning: null,
      category: 'general',
      region: 'unspecified',
      confidence: 'low',
      sourceId: 'sarh-core',
      searchable: false,
      note: 'كلمة عامة (نسبة إلى الجنوب) خارج سياق الأبقار.',
    },
  ]),

  // Camels - families and colour groups
  e(
    'majaheem',
    'مجاهيم',
    [
      breed(
        'camel',
        'إبل سوداء ضخمة الحجم، من أكثر الإبل إنتاجاً للحليب.',
        'almuheet-camels',
        'medium',
      ),
    ],
    ['المجاهيم'],
  ),
  e(
    'maghateer',
    'مغاتير',
    [
      breed(
        'camel',
        'الإبل الملونة من غير المجاهيم، وتقسم إلى ألوان رئيسية: الصفر والشعل والحمر والشقح والوضح.',
        'hagenetics-camels',
        'high',
      ),
    ],
    ['مغتر', 'ملاوين'],
  ),
  e(
    'wadh',
    'وضح',
    [breed('camel', 'من المغاتير، لونها أبيض.', 'almuheet-camels', 'medium')],
    ['وضحاء'],
  ),
  e('sufr', 'صفر', [
    breed(
      'camel',
      'من المغاتير، لونها مزيج بين الأصفر والبني الداكن.',
      'almuheet-camels',
      'medium',
    ),
    {
      meaning: null,
      category: 'general',
      region: 'unspecified',
      confidence: 'low',
      sourceId: 'sarh-core',
      searchable: false,
      note: 'قد تأتي بمعنى الرقم صفر.',
    },
  ]),
  e(
    'shu3l',
    'شعل',
    [
      breed(
        'camel',
        'من المغاتير، لونها بين الأبيض والأصفر.',
        'almuheet-camels',
        'medium',
      ),
    ],
    ['شعلاء'],
  ),
  e('humr', 'حمر', [
    breed('camel', 'من المغاتير، لونها بني محمر.', 'almuheet-camels', 'medium'),
  ]),
  e(
    'shuqh',
    'شقح',
    [
      breed(
        'camel',
        'من ألوان المغاتير الفاتحة.',
        'hagenetics-camels',
        'medium',
      ),
    ],
    ['شقحاء'],
  ),
  e(
    'omani',
    'عمانية',
    [breed('camel', 'مشهورة بالرحلات والركوب.', 'marefa-camels', 'medium')],
    ['باطنية'],
  ),
  e('kinaniya', 'كنانية', [
    breed(
      'camel',
      'منتشرة عند قبائل كنانة وبادية تهامة، سريعة وقصيرة الحجم.',
      'marefa-camels',
      'medium',
    ),
  ]),
  e('arkiya', 'آركية', [
    breed(
      'camel',
      'منتشرة في تهامة، غزيرة الحليب قصيرة الحجم.',
      'marefa-camels',
      'medium',
    ),
  ]),
  e('hara2er', 'حرائر', [breed('camel', null, 'marefa-camels', 'medium')]),
  // Majaheem colour shades (camel context only)
  e('ghouriya', 'غورية', [
    camelColour('من ألوان المجاهيم، شديدة السواد.', 'marefa-camels'),
  ]),
  e(
    'malha',
    'ملحاء',
    [camelColour('من ألوان المجاهيم، سوادها أخف من الغورية.', 'marefa-camels')],
    ['ملحا'],
  ),
  e('sahba', 'صهباء', [
    camelColour('من ألوان المجاهيم، سواد مع خيوط أصهب.', 'marefa-camels'),
  ]),
];
