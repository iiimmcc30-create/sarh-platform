import type {
  AnimalType,
  LivestockTermEntry,
  TermCategory,
  TermMeaning,
} from '../livestock-terms.types';

/**
 * Reference source: "بادية الشام - بعض التسميات في عالم المواشي" (2024-02-16).
 * Community / heritage source - NOT official. Mostly sheep & goats context.
 *
 * - Definitions are stored exactly as the source describes them.
 * - Terms the source lists without a clear definition (age lists, trait
 *   lists): meaning = null, confidence = low.
 * - The source warns names differ by region -> region = 'unspecified'.
 * - Shepherding terms (wages, food, water holes, land) are kept for knowledge
 *   but searchable = false: they are not livestock-sale vocabulary and would
 *   only add noise to marketplace search / suggestions.
 */

const SRC = 'badia-sham-2024';
const SRC_COMMENT = 'badia-sham-2024-comment';
const SG: AnimalType[] = ['sheep', 'goat'];

type Extra = Partial<Omit<TermMeaning, 'meaning' | 'category'>>;

function m(
  meaning: string | null,
  category: TermCategory,
  extra: Extra = {},
): TermMeaning {
  return {
    meaning,
    category,
    animalTypes: SG,
    region: 'unspecified',
    confidence: meaning ? 'medium' : 'low',
    sourceId: SRC,
    searchable: true,
    ...extra,
  };
}

function term(
  id: string,
  canonical: string,
  meanings: TermMeaning[],
  aliases: string[] = [],
): LivestockTermEntry {
  return { id: `badia-${id}`, canonical, aliases, meanings };
}

/** Terms listed by the source without a definition (meaning null, low). */
function listed(
  idPrefix: string,
  terms: Array<string | [string, string[], Extra?]>,
  category: TermCategory,
  extra: Extra,
  note: string,
): LivestockTermEntry[] {
  return terms.map((t, i) => {
    const [canonical, aliases, own] = Array.isArray(t) ? t : [t, [], undefined];
    return term(
      `${idPrefix}-${i + 1}`,
      canonical,
      [
        m(null, category, {
          ageStage: category === 'age_stage' ? canonical : undefined,
          attribute: category === 'trait' ? canonical : undefined,
          ...extra,
          ...own,
          note: `${note} (${i + 1} من ${terms.length})`,
        }),
      ],
      aliases,
    );
  });
}

const SHEPHERDING: Extra = { searchable: false, animalTypes: undefined };

export const BADIA_SHAM_2024_TERMS: readonly LivestockTermEntry[] = [
  term('halal', 'حلال', [
    m(
      'تسمية تطلق على الأغنام والماعز بشكل عام، ويقال للسوق الذي تباع به المواشي سوق الحلال.',
      'animal_group',
      { related: ['غنم', 'أغنام', 'ماعز'] },
    ),
  ]),
  term('souq-halal', 'سوق الحلال', [m('السوق الذي تباع به المواشي.', 'trade')]),
  term('awar', 'العوار', [
    m('نعجة تائهة في قطيع الغير، وتسمى أيضًا ضالة وذاهبة.', 'herd_role', {
      gender: 'female',
      animalTypes: ['sheep'],
    }),
  ]),
  term('lajba', 'اللجبة', [
    m('نعجة فقدت رضيعها.', 'reproductive_status', {
      gender: 'female',
      animalTypes: ['sheep'],
    }),
  ]),
  term('hayel', 'حايل', [
    m('لم تلد.', 'reproductive_status', {
      gender: 'female',
      adCombo: true,
      note: 'الجمع: حيل (لم يُضف كمرادف لأنه يتقاطع مع كلمة عامية شائعة).',
    }),
  ]),
  term(
    'musaghar',
    'مصغر',
    [m('ولدت حديثًا.', 'reproductive_status', { gender: 'female' })],
    ['مصاغير'],
  ),
  term('haloub', 'حلوب', [
    m('حلوب وخلفها رضيع.', 'reproductive_status', { gender: 'female' }),
  ]),
  term('raghouth', 'رغوث', [
    m(null, 'reproductive_status', {
      gender: 'female',
      note: 'تسمية لاحقة في سياق المذكور بالمصدر دون تعريف واضح.',
    }),
  ]),
  term(
    'mutli',
    'متلي',
    [m('على وشك الولادة.', 'reproductive_status', { gender: 'female' })],
    ['متالي'],
  ),
  term('shal3a', 'شالعة', [
    m('بداية الحمل.', 'reproductive_status', { gender: 'female' }),
  ]),
  term('hatta', 'حاطة', [
    m('نهاية الحمل.', 'reproductive_status', { gender: 'female' }),
  ]),

  // Male age terms, in the order the source gives them (no definitions).
  ...listed(
    'male-age',
    [
      ['طلي', ['طليان']],
      ['وردي', ['هرفي']],
      'عكش',
      'دغلي',
      ['ثني', [], { adCombo: true }],
      ['جذع', [], { adCombo: true }],
      'قحم',
      'كبش',
    ],
    'age_stage',
    { gender: 'male' },
    'من أسماء الذكور حسب العمر كما وردت بترتيب المصدر: طلي، وردي أو هرفي، عكش، دغلي، ثني، جذع، قحم، كبش',
  ),
  // Female terms as listed (no definitions).
  ...listed(
    'female-age',
    [
      'فطيمة',
      'قرقورة',
      ['ثنية', [], { adCombo: true }],
      ['جذعة', [], { adCombo: true }],
      'أم ثالث',
      'رباع',
      'جل',
      'دق',
      'هرمة',
    ],
    'age_stage',
    { gender: 'female' },
    'من أسماء الإناث كما وردت بالمصدر: فطيمة، قرقورة، ثنية / جذعة، أم ثالث، رباع، جل، دق، هرمة',
  ),
  // Face / colour traits (no definitions).
  ...listed(
    'face',
    [
      ['الدرعا', ['الدرعاء']],
      'العبسة',
      'القرحة',
      ['الشقرا', ['الشقراء']],
      ['الرخما', ['الرخماء']],
      'القرطة',
      'البرشة',
      'البقعاء',
      'الرزية',
      'البقعة',
      'الوزرة',
      ['الكرحا', ['الكرحاء']],
      'الشعلة',
      ['الحمرا', ['الحمراء']],
      'الغرة',
      'الدعمة',
      'السحمة',
    ],
    'trait',
    {},
    'من صفات الوجه واللون كما وردت بالمصدر',
  ),
  // Ear traits (no definitions). Note: "قرطة" is also listed as a face trait.
  ...listed(
    'ear',
    ['مطربشة', 'قرطة', 'جومة'],
    'trait',
    {},
    'من صفات الأذن كما وردت بالمصدر',
  ),
  // Tail-fat (لية) traits (no definitions).
  ...listed(
    'tail',
    ['رطلة', 'زعرة'],
    'trait',
    {},
    'من صفات اللية كما وردت بالمصدر',
  ),

  term('shatra', 'الشطرة', [
    m('لها بز واحد والثاني عاطل.', 'trait', { gender: 'female' }),
  ]),
  term('akoul', 'الأكول', [
    m('كبش ليس له قرون.', 'trait', { gender: 'male', animalTypes: ['sheep'] }),
  ]),
  term('miryaa', 'المرياع', [
    m(
      'كبش يتم خصيه في الصغر وتربيته ليبقى قريبًا من الراعي ويتبع الراعي ويقود القطيع، وتوضع على رقبته الأجراس ويزين بالخرز والمرايا والودع والسفايف.',
      'herd_role',
      { gender: 'male', animalTypes: ['sheep'] },
    ),
  ]),
  term('shatour', 'شطور', [
    m('لها شطر عاطل لا يحلب.', 'trait', { gender: 'female' }),
  ]),
  term('nakour', 'نكور', [m('تجفل عند الاقتراب منها.', 'behaviour')]),
  term('nafour', 'نفور', [
    m('تنفر رضيعها وترفض إرضاعه.', 'behaviour', { gender: 'female' }),
  ]),
  term(
    'hazla',
    'الهزلة',
    [
      m(
        'أردى القطيع وتكون عادة ماشية خلف القطيع بسبب عجزها عن المشي، وتسمى أيضًا عويكة (ج عوك).',
        'condition',
      ),
    ],
    ['عويكة', 'عوك'],
  ),
  term('fatma', 'الفطمة', [
    m('الطليان مواليد السنة التي تفطم عن الرضاع.', 'age_stage', {
      ageStage: 'الفطمة',
    }),
  ]),
  term('mahajeel', 'المهاجيل', [
    m('الطليان التي لم تفطم وتركت مع أمهاتها.', 'age_stage', {
      ageStage: 'المهاجيل',
    }),
  ]),
  term('lakoush', 'لكوش', [m('طلي يرضع من غير أمه.', 'behaviour')]),
  term('jild', 'جلد', [
    m(null, 'general', {
      note: 'جلد / رغث: تقسيم ورد في المصدر للحلال، دون تعريف واضح لـ"جلد".',
    }),
  ]),
  term('ragheth', 'رغث', [
    m(
      'تقسيم ورد في المصدر للحلال، ويذكر المصدر أن الرغث تكون وراءها طليان.',
      'reproductive_status',
      { gender: 'female' },
    ),
  ]),
  term('musallah', 'مصلاح', [
    m('وصف للراعي الخبير الهادئ الرزين.', 'shepherding', SHEPHERDING),
  ]),
  term('shart', 'الشرط', [
    m(
      'راتب الراعي السنوي النقدي المحدد، وقد تضاف إليه منافع عينية.',
      'shepherding',
      SHEPHERDING,
    ),
  ]),
  term('mutalla3a', 'مطلعة', [
    m(null, 'shepherding', {
      ...SHEPHERDING,
      note: 'وردت في سياق اتفاقات الراعي على غنم الراعي، دون تعريف واضح.',
    }),
  ]),
  term('shakkara', 'شكارة', [
    m(
      'قطعة أرض يبذرها الراعي حنطة أو شعير وينتظر موسمها.',
      'shepherding',
      SHEPHERDING,
    ),
  ]),
  term(
    'zahab',
    'الزهاب',
    [m('الطعام الذي يصطحبه الراعي.', 'shepherding', SHEPHERDING)],
    ['الزوادة'],
  ),
  term('mizwada', 'المزودة', [
    m('ما يحمل فيه الطعام.', 'shepherding', SHEPHERDING),
  ]),
  term('sun3', 'صنع', [
    m('حفر في الصخور تتجمع فيها مياه المطر.', 'shepherding', SHEPHERDING),
  ]),
  term(
    'basham',
    'البشم',
    [
      m('تخمة تصاب بها الأغنام نتيجة الأكل الزائد.', 'condition', {
        attribute: 'البشم / الحمر',
      }),
    ],
    ['الحمر', 'مبشومة', 'محمورة'],
  ),
  term(
    'aima',
    'العيمة',
    [m('حالة تجعل الأغنام تعاف العلف والمرعى.', 'condition')],
    ['معيومة'],
  ),
  term('sroub', 'السروب', [
    m(
      'معالجة للغنم بمبيد حشري يحل بالماء ويوضع على ظهورها لحمايتها من الحشرات والديدان.',
      'husbandry',
    ),
  ]),
  term('matafeel', 'المطافيل', [
    m('الوالدات حديثًا.', 'reproductive_status', {
      gender: 'female',
      sourceId: SRC_COMMENT,
      note: 'من تعليق على المصدر، وليس من نص المنشور.',
    }),
  ]),
];
