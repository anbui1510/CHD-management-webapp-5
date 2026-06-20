import type { DailyTopic } from './types';

/** Tách cụm từ khóa theo dấu phẩy từ topics.ts */
export function keywordTerms(topic: DailyTopic): string[] {
  return topic.keywords
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

const PHRASE_MAP: Record<string, string> = {
  'tetralogy of fallot': '("Tetralogy of Fallot"[MeSH Terms] OR tetralogy Fallot)',
  'arterial switch': '("Transposition of Great Vessels"[MeSH Terms] OR arterial switch operation OR Jatene)',
  'pulmonary regurgitation': '(pulmonary regurgitation OR pulmonary valve replacement)',
  'heart team': '("Heart Team"[Title/Abstract] OR multidisciplinary heart team)',
  'fontan': '(Fontan OR cavopulmonary connection OR single ventricle)',
  '3d echocardiography': '(three-dimensional echocardiography OR 3D echocardiography)',
  'ecmo': '(extracorporeal membrane oxygenation OR ECMO)',
  'fetal': '(fetal heart OR in utero cardiac OR fetal cardiology)',
};

function mapPhrase(term: string): string {
  const lower = term.toLowerCase();
  for (const [key, query] of Object.entries(PHRASE_MAP)) {
    if (lower.includes(key)) return query;
  }
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return `"${term}"[Title/Abstract]`;
  return `(${words.slice(0, 4).join(' ')}[Title/Abstract])`;
}

const CHD_CORE =
  '("congenital heart disease"[MeSH Terms] OR congenital heart disease OR pediatric cardiology OR CHD OR congenital heart defect*)';

const CHD_BROAD =
  '(congenit* OR pediatric* OR paediatric* OR heart defect* OR CHD OR neonatal heart OR infant heart)';

export function buildTopicQuery(topic: DailyTopic, level: 'strict' | 'normal' | 'broad'): string {
  const terms = keywordTerms(topic);
  const mapped = terms.map(mapPhrase).join(' OR ');
  const chd = level === 'broad' ? CHD_BROAD : CHD_CORE;

  if (level === 'strict') {
    return `(${mapped}) AND ${chd} AND (meta-analysis[pt] OR systematic review[pt] OR randomized controlled trial[pt] OR guideline[pt])`;
  }
  return `(${mapped}) AND ${chd}`;
}

export function buildPlainQuery(topic: DailyTopic): string {
  const terms = keywordTerms(topic)
    .map(t => t.split(/\s+/).slice(0, 3).join(' '))
    .join(' ');
  return `${terms} congenital heart disease pediatrics`;
}

export function buildEuropePmcQuery(topic: DailyTopic, cochraneOnly = false): string {
  const terms = keywordTerms(topic)
    .map(t => t.split(/\s+/).slice(0, 4).join(' '))
    .map(t => `(TITLE:"${t}" OR ABSTRACT:"${t}")`)
    .join(' OR ');
  const chd = '(congenital heart OR pediatric cardiology OR CHD)';
  if (cochraneOnly) {
    return `(${terms}) AND ${chd} AND (JOURNAL:"Cochrane Database of Systematic Reviews" OR SRC:COH)`;
  }
  return `(${terms}) AND ${chd}`;
}
