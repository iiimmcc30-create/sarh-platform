/**
 * Livestock terms dictionary - data model.
 *
 * term (canonical + aliases) -> one or more MEANINGS, each carrying its own
 * context (animal type, region, category), confidence and source. A term is
 * never given one fixed meaning: "حري" is a sheep breed AND a goat breed,
 * "حمر" is a camel colour group AND (in a sheep context) a digestive ailment.
 *
 * Stored as versioned data modules (see ./data) loaded once into an in-memory
 * index by LivestockDictionaryService. Shape mirrors a relational design
 * (LivestockTerm / LivestockTermMeaning / LivestockTermSource) so it can move
 * into Prisma tables later without changing the service API.
 */

export type AnimalType =
  'sheep' | 'goat' | 'camel' | 'cattle' | 'horse' | 'livestock';

export type TermCategory =
  | 'animal_type' // غنم، ماعز، إبل ...
  | 'animal_group' // حلال، مواشي (several animal types)
  | 'breed' // نعيمي، حري، مجاهيم ...
  | 'gender' // نعجة، تيس، ناقة ...
  | 'age_stage' // طلي، ثني، جذع ...
  | 'reproductive_status' // حايل، متلي، شالعة ...
  | 'trait' // colours / face / ear / tail traits
  | 'condition' // البشم، العيمة ...
  | 'behaviour' // نكور، نفور ...
  | 'herd_role' // المرياع، العوار ...
  | 'husbandry' // السروب ...
  | 'trade' // للبيع، مزاد، سوق الحلال ...
  | 'shepherding' // الشرط، الزهاب ... (not a sale term)
  | 'general';

export type Gender = 'male' | 'female';

export type Confidence = 'high' | 'medium' | 'low';

/** Where a meaning comes from - never mixed up with official sources. */
export type SourceType =
  | 'OFFICIAL' // government / ministry
  | 'ACADEMIC' // agricultural-veterinary research
  | 'COMMUNITY' // community / heritage write-ups
  | 'LOCAL' // local usage write-ups
  | 'COMMERCIAL' // shops / ad-style content
  | 'INTERNAL'; // Sarh-curated vocabulary (no external definition claimed)

export type TermSource = {
  id: string;
  type: SourceType;
  name: string;
  /** ISO date (YYYY-MM-DD) when known. */
  date?: string;
  /** Kept in data/config only - never used by search logic. */
  url?: string;
  note?: string;
};

/** Region string, or the explicit "unspecified / non-uniform" marker. */
export type TermRegion = 'unspecified' | 'saudi' | 'gulf' | 'levant' | string;

export type TermMeaning = {
  /** Definition text exactly as the source states it; null if undefined. */
  meaning: string | null;
  category: TermCategory;
  animalTypes?: AnimalType[];
  gender?: Gender;
  /** Age/stage label (the term itself when the source gives no definition). */
  ageStage?: string;
  /** Trait/colour/condition label. */
  attribute?: string;
  region: TermRegion;
  confidence: Confidence;
  sourceId: string;
  /** false = stored for knowledge only (e.g. shepherd wages); not used in search. */
  searchable: boolean;
  /** Related (not identical) terms used for low-weight query expansion. */
  related?: string[];
  /**
   * Sarh ranking hint (not a definition): the term is commonly combined with
   * breed names in ad titles, so smart suggestions may pair it ("حري ثني").
   */
  adCombo?: boolean;
  note?: string;
};

export type LivestockTermEntry = {
  /** Stable id (kebab/latin) so corrections can target an entry. */
  id: string;
  canonical: string;
  /** Spelling variants / plurals / true synonyms of THIS term. */
  aliases?: string[];
  meanings: TermMeaning[];
};
