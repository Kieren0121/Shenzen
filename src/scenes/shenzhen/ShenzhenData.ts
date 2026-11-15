/**
 * Educational content for Simulation A, taken from the EBN Academy 2
 * Autumn 2 Week 3 "The world's factory" (Blue) worksheet.
 *
 * ONLY the two endpoint population values are historical data. Everything
 * between 1980 and 2020 in the 3D model is an illustrative visual
 * progression, and is labelled as such in the interface.
 */
import type { KeyWord } from '../../core/PresentationUI';

export const BIG_QUESTION = 'How did new factories change Shenzhen?';

export const POPULATION = {
  start: { year: 1980, label: 'about 330,000 people', short: '330,000' },
  end: { year: 2020, label: 'over 17 million people', short: 'over 17 million' },
  source: 'Worksheet figures: Shenzhen Statistical Yearbook (1980), Shenzhen census (2020).',
} as const;

/** China-wide statistic (NOT Shenzhen-only). Worksheet cites UN Statistics Division (2023). */
export const CHINA_FACT = {
  scope: 'CHINA (WHOLE COUNTRY)',
  text: 'China makes about 3 in 10 of the world’s manufactured goods.',
  filled: 3,
  of: 10,
  source: 'Worksheet figure: UN Statistics Division (2023).',
};

export const WORDS: Record<string, KeyWord> = {
  factory: { term: 'factory', def: 'where goods are made' },
  goods: { term: 'goods', def: 'things you can buy' },
  tax: { term: 'tax', def: 'money paid to the government' },
  sez: { term: 'Special Economic Zone', def: 'lower taxes help attract new factories' },
  nic: { term: 'NIC', def: 'Newly Industrialised Country' },
  migration: { term: 'migration', def: 'moving from one place to live in another' },
};

export type PresetId = 'overview' | 'factories' | 'housing' | 'skyline';

export interface TeachingMoment {
  id: PresetId;
  button: string;
  kicker: string;
  title: string;
  body: string;
  words: KeyWord[];
  /** The model year is eased to at least this value when the moment is chosen. */
  minYear: number;
}

export const MOMENTS: Record<Exclude<PresetId, 'overview'>, TeachingMoment> = {
  factories: {
    id: 'factories',
    button: 'Factories & jobs',
    kicker: 'A · Factories and jobs',
    title: 'Factories create jobs',
    body: 'Lower taxes attracted companies. New factories created jobs.',
    words: [WORDS.factory, WORDS.tax, WORDS.sez],
    minYear: 1992,
  },
  housing: {
    id: 'housing',
    button: 'Migration & homes',
    kicker: 'B · Migration and population',
    title: 'People move to Shenzhen',
    body: 'People moved to the city for work. More homes were needed.',
    words: [WORDS.migration],
    minYear: 2004,
  },
  skyline: {
    id: 'skyline',
    button: 'Modern Shenzhen',
    kicker: 'C · Modern Shenzhen',
    title: '330,000 → over 17 million',
    body: 'More jobs attracted more people. Shenzhen grew into a major city.',
    words: [WORDS.nic, WORDS.goods],
    minYear: 2020,
  },
};

/** Cause → effect sequence shown beside the model (an order of ideas, not dates). */
export const CHAIN = [
  { text: 'Lower taxes (Special Economic Zone)', at: 1980 },
  { text: 'Companies build factories', at: 1983 },
  { text: 'Factories create jobs', at: 1986 },
  { text: 'People move here for work', at: 1990 },
  { text: 'Population grows', at: 1995 },
  { text: 'The city expands', at: 2001 },
];

export const PHASES = [
  { from: 1980, name: 'Early change' },
  { from: 1986, name: 'Factories boom' },
  { from: 1996, name: 'City expands' },
  { from: 2010, name: 'Modern city' },
];

export function phaseName(year: number): string {
  let n = PHASES[0].name;
  for (const p of PHASES) if (year >= p.from) n = p.name;
  return n;
}

export function overviewBody(year: number): string {
  if (year < 1981) return '1980: about 330,000 people. Farms, fishing villages and a small town.';
  if (year < 1990) return 'New factories open. Roads and homes begin to spread.';
  if (year < 2003) return 'More jobs bring more people. Homes and offices spread fast.';
  if (year < 2019.5) return 'The city keeps growing, upwards and outwards.';
  return '2020: over 17 million people live in Shenzhen.';
}
