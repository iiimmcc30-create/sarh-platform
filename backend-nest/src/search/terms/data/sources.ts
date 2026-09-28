import type { TermSource } from '../livestock-terms.types';

/**
 * Sources referenced by the dictionary. URLs live here (data/config) only -
 * search logic never reads them. A source is only cited for what it states.
 */
export const TERM_SOURCES: readonly TermSource[] = [
  {
    id: 'badia-sham-2024',
    type: 'COMMUNITY',
    name: 'بادية الشام',
    date: '2024-02-16',
    note: 'بعض التسميات في عالم المواشي - مصدر مجتمعي/تراثي غير رسمي، أغلبه في سياق الأغنام والماعز. ينبه المصدر إلى أن التسميات تختلف من منطقة لأخرى.',
  },
  {
    id: 'badia-sham-2024-comment',
    type: 'COMMUNITY',
    name: 'بادية الشام (تعليق على المنشور)',
    date: '2024-02-16',
    note: 'إضافة وردت في تعليق على المصدر، وليست من نص المنشور نفسه.',
  },
  {
    id: 'sarh-core',
    type: 'INTERNAL',
    name: 'مفردات سرح الأساسية',
    note: 'مفردات عربية شائعة لأنواع المواشي والجنس ومصطلحات البيع، منسقة داخلياً لربط البحث فقط. لا تُنسب لها تعريفات.',
  },
  {
    id: 'scipub-sheep-2013',
    type: 'ACADEMIC',
    name: 'Study of Some Sheep Breeds in Saudi Arabia (American Journal of Biochemistry and Biotechnology, 2013)',
    date: '2013',
    url: 'https://thescipub.com/pdf/ajbbsp.2013.183.194.pdf',
    note: 'Naemi, Heri, Najdi (native) and Sawakni (introduced from Sudan); Naemi also called desert Awassi.',
  },
  {
    id: 'idosi-goats-2013',
    type: 'ACADEMIC',
    name: 'Najdi, Harri and Aradi Saudi Goat Breeds (World Applied Sciences Journal 26(7), 2013)',
    date: '2013-11-27',
    url: 'https://www.idosi.org/wasj/wasj26%287%2913/4.pdf',
  },
  {
    id: 'springer-ardi-2018',
    type: 'ACADEMIC',
    name: 'Simulated genetic gain of a close breeding program for Ardi goat in Saudi Arabia (JSSAS, 2018)',
    date: '2018',
    url: 'https://link.springer.com/article/10.1016/j.jssas.2018.02.001',
    note: 'Main goat breeds in KSA: Ardi, Jabili, Bishi, Habsi, Harri.',
  },
  {
    id: 'ajol-ardi',
    type: 'ACADEMIC',
    name: 'Genetic diversity of Ardi goat based on microsatellite (African Journal of Biotechnology)',
    url: 'https://www.ajol.info/index.php/ajb/article/download/129990/119551',
    note: 'Native goat populations: Ardi, Bishi, Jabaly, Hejazy, Najrani, Tohami.',
  },
  {
    id: 'jksus-goats',
    type: 'ACADEMIC',
    name: 'Molecular characterization of goats from Saudi Arabia using microsatellite markers (JKSUS)',
    url: 'https://jksus.org/molecular-characterization-of-goats-from-saudi-arabia-using-microsatellite-markers/',
    note: 'Ardi, Hollandi and Shami goats; Damascus goat also known as Shami, introduced mainly for milk.',
  },
  {
    id: 'cambridge-cattle-2015',
    type: 'ACADEMIC',
    name: 'Current situation and diversity of indigenous cattle breeds of Saudi Arabia (Animal Genetic Resources, 2015)',
    date: '2015',
    url: 'https://www.cambridge.org/core/journals/animal-genetic-resources-resources-genetiques-animales-recursos-geneticos-animales/article/abs/current-situation-and-diversity-of-indigenous-cattle-breeds-of-saudi-arabia/96516F9283E6816463E9C1B63E83F269',
    note: 'Zebu breeds Hassawi (eastern region, declining) and Janobi (south-west).',
  },
  {
    id: 'almuheet-camels',
    type: 'COMMERCIAL',
    name: 'المُحيط - ألوان الإبل وسلالاتها: المجاهيم والمغاتير',
    url: 'https://almuheet.net/post/592300',
  },
  {
    id: 'hagenetics-camels',
    type: 'ACADEMIC',
    name: 'Hasan Alhaddad Genetics Lab - Jamalid Report',
    url: 'https://hagenetics.org/?cat=16',
    note: 'المغاتير خمسة ألوان رئيسية: الصفر، الشعل، الحمر، الشقح، الوضح.',
  },
  {
    id: 'marefa-camels',
    type: 'COMMUNITY',
    name: 'المعرفة - سلالات الإبل وألوانها',
    url: 'https://www.marefa.org/%D8%B3%D9%84%D8%A7%D9%84%D8%A7%D8%AA_%D8%A7%D9%84%D8%A5%D8%A8%D9%84_%D9%88%D8%A3%D9%84%D9%88%D8%A7%D9%86%D9%87%D8%A7',
  },
  {
    id: 'hummmyyummmy-sheep-2024',
    type: 'COMMERCIAL',
    name: 'متجر هامي يامي - أنواع الغنم في السعودية 2024',
    date: '2024',
    url: 'https://hummmyyummmy.com/ar/blog/%D8%A3%D9%86%D9%88%D8%A7%D8%B9-%D8%A7%D9%84%D8%BA%D9%86%D9%85-%D9%81%D9%8A-%D8%A7%D9%84%D8%B3%D8%B9%D9%88%D8%AF%D9%8A%D8%A9/a-1546491741',
  },
];
