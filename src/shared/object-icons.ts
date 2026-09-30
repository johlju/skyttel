// Fixed Lucide catalog. See icon-assets/SOURCE.md for provenance and identifier policy.
import source from './icon-assets/lucide-icons.json' with { type: 'json' };

export type IconNode = [
  'path' | 'circle' | 'rect' | 'line' | 'ellipse' | 'polyline' | 'polygon',
  Record<string, string>,
];

export type ObjectIcon = {
  id: string;
  label: string;
  keywords: string[];
  nodes: IconNode[];
};

const labels: Record<string, string> = {
  music: 'Musik',
  'music-2': 'Musiknoter',
  house: 'Hus',
  'house-plug': 'Hus med elanslutning',
  car: 'Bil',
  bike: 'Cykel',
  bus: 'Buss',
  train: 'Tåg',
  plane: 'Flygplan',
  user: 'Person',
  'user-round': 'Person (rund)',
  users: 'Personer',
  key: 'Nyckel',
  'key-round': 'Nyckel (rund)',
  laptop: 'Bärbar dator',
  monitor: 'Bildskärm',
  computer: 'Dator',
  phone: 'Telefon',
  smartphone: 'Mobiltelefon',
  'credit-card': 'Betalkort',
  calendar: 'Kalender',
  'calendar-clock': 'Kalender och klocka',
  'calendar-sync': 'Återkommande kalender',
  receipt: 'Kvitto',
  'file-text': 'Dokument',
  'file-signature': 'Undertecknat dokument',
  landmark: 'Bank',
  wallet: 'Plånbok',
  mail: 'E-post',
  headphones: 'Hörlurar',
  tv: 'TV',
  building: 'Byggnad',
  'building-2': 'Byggnader',
  shield: 'Sköld',
  'shield-check': 'Skydd',
  plug: 'Kontakt',
  'solar-panel': 'Solpanel',
  wrench: 'Verktyg',
  briefcase: 'Portfölj',
  heart: 'Hjärta',
  dog: 'Hund',
  cat: 'Katt',
  baby: 'Barn',
  book: 'Bok',
  'shopping-cart': 'Kundvagn',
};

const swedishTerms: Record<string, string[]> = {
  music: ['musik', 'låt', 'sång', 'noter'],
  note: ['musik', 'not'],
  audio: ['ljud', 'musik'],
  headphones: ['hörlurar', 'musik', 'ljud'],
  house: ['hus', 'hem', 'bostad'],
  home: ['hem', 'hus', 'bostad'],
  building: ['byggnad', 'hus', 'bostad'],
  garage: ['garage', 'bil'],
  car: ['bil', 'fordon'],
  vehicle: ['fordon', 'bil'],
  bike: ['cykel', 'fordon'],
  user: ['person', 'människa', 'användare'],
  users: ['personer', 'familj', 'hushåll'],
  person: ['person', 'människa'],
  key: ['nyckel', 'lås'],
  lock: ['lås', 'säkerhet'],
  computer: ['dator'],
  laptop: ['dator', 'bärbar'],
  monitor: ['dator', 'skärm', 'bildskärm'],
  smartphone: ['telefon', 'mobil', 'mobiltelefon'],
  phone: ['telefon', 'samtal'],
  card: ['kort', 'betalkort'],
  credit: ['kredit', 'kort'],
  payment: ['betalning', 'betalningsmedel'],
  bank: ['bank', 'bankkonto'],
  wallet: ['plånbok', 'pengar'],
  calendar: ['kalender', 'datum', 'abonnemang'],
  repeat: ['återkommande', 'abonnemang'],
  subscription: ['abonnemang'],
  receipt: ['kvitto', 'avtal', 'abonnemang'],
  contract: ['avtal'],
  document: ['dokument', 'avtal'],
  signature: ['underskrift', 'avtal'],
  mail: ['e-post', 'epost', 'brev'],
  shield: ['skydd', 'försäkring'],
  plug: ['el', 'elavtal', 'kontakt'],
  solar: ['sol', 'solpanel', 'solceller'],
  tools: ['verktyg'],
  wrench: ['verktyg', 'service'],
  briefcase: ['arbete', 'företag'],
  dog: ['hund', 'djur'],
  cat: ['katt', 'djur'],
  baby: ['barn', 'familj'],
  shopping: ['köp', 'handel', 'butik'],
  book: ['bok', 'läsning'],
  heart: ['hjärta', 'hälsa'],
};

const swedishCategories: Record<string, string> = {
  accessibility: 'tillgänglighet',
  account: 'konto',
  animals: 'djur',
  arrows: 'pilar',
  buildings: 'byggnader',
  charts: 'diagram',
  communication: 'kommunikation',
  connectivity: 'anslutning',
  cursors: 'pekare',
  design: 'formgivning',
  development: 'utveckling',
  devices: 'enheter',
  emoji: 'känslor',
  files: 'filer',
  finance: 'ekonomi',
  'food-beverage': 'mat dryck',
  gaming: 'spel',
  home: 'hem',
  layout: 'layout',
  mail: 'post',
  math: 'matematik',
  medical: 'medicin hälsa',
  multimedia: 'media',
  nature: 'natur',
  navigation: 'navigering',
  notifications: 'meddelanden',
  people: 'människor',
  photography: 'fotografi',
  science: 'vetenskap',
  seasons: 'årstider',
  security: 'säkerhet',
  shapes: 'former',
  shopping: 'handel',
  social: 'socialt',
  sports: 'sport',
  sustainability: 'hållbarhet',
  text: 'text',
  time: 'tid',
  tools: 'verktyg',
  transportation: 'transport',
  travel: 'resor',
  weather: 'väder',
};

// SVG-element och attribut valideras när det låsta underlaget importeras.
const rawCatalog = source as unknown as {
  id: string;
  tags: string[];
  categories: string[];
  aliases: string[];
  nodes: IconNode[];
}[];

export const objectIcons: ObjectIcon[] = rawCatalog.map((icon) => {
  const english = [icon.id, ...icon.tags, ...icon.categories, ...icon.aliases];
  const words = new Set(english.flatMap((value) => value.toLocaleLowerCase('en').split(/[\s-]+/)));
  const aliases = Object.entries(swedishTerms).flatMap(([term, terms]) =>
    words.has(term) ? terms : [],
  );
  return {
    id: icon.id,
    label: labels[icon.id] ?? icon.id.replaceAll('-', ' '),
    keywords: [
      ...new Set([
        ...english,
        ...aliases,
        ...icon.categories.map((category) => swedishCategories[category]),
      ]),
    ],
    nodes: icon.nodes,
  };
});

const byId = new Map(objectIcons.map((icon) => [icon.id, icon]));

export function findObjectIcon(id: string | null | undefined) {
  return id ? byId.get(id) : undefined;
}

export function isObjectIconId(value: unknown): value is string {
  return typeof value === 'string' && byId.has(value);
}

export function objectIconLabel(id: string | null | undefined, typeName?: string) {
  return findObjectIcon(id)?.label ?? `Typens standardikon${typeName ? ` (${typeName})` : ''}`;
}

function searchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('sv');
}
const searchableIcons = objectIcons.map((icon) => ({
  icon,
  name: searchText(icon.label),
  id: searchText(icon.id),
  text: searchText([icon.id, icon.label, ...icon.keywords].join(' ')),
}));
export function searchObjectIcons(query: string) {
  const normalized = searchText(query).trim();
  const terms = normalized.split(/\s+/).filter(Boolean);
  function rank(icon: (typeof searchableIcons)[number]) {
    if (!normalized) return 2;
    if (icon.name === normalized || icon.id === normalized) return 0;
    return icon.name.startsWith(normalized) || icon.id.startsWith(normalized) ? 1 : 2;
  }
  return searchableIcons
    .filter(({ text }) => terms.every((term) => text.includes(term)))
    .sort((left, right) => rank(left) - rank(right))
    .map(({ icon }) => icon);
}
