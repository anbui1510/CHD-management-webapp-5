import type { PubMedArticle } from './types';

const TOP_JOURNALS = [
  'circulation', 'journal of the american college of cardiology', 'jacc', 'jama pediatrics',
  'pediatrics', 'journal of thoracic and cardiovascular surgery', 'european journal of cardio-thoracic surgery',
  'pediatric cardiology', 'cardiology in the young', 'world journal for pediatric and congenital heart surgery',
  'annals of pediatric cardiology', 'heart', 'european heart journal',
];

const EXCLUDE_PATTERNS = [
  /case report/i, /case series/i, /letter to the editor/i, /comment on/i,
  /corrigendum/i, /erratum/i, /study protocol/i,
  /gene expression profiling/i, /proteomics/i, /transcriptome/i,
];

function combinedText(article: PubMedArticle): string {
  return `${article.title} ${article.abstract} ${article.pubTypes.join(' ')}`.toLowerCase();
}

function shouldExclude(article: PubMedArticle): boolean {
  const text = combinedText(article);
  if (!text.includes('congenit') && !text.includes('pediatr') && !text.includes('fontan') && !text.includes('fetal')) {
    return true;
  }
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

function parseYear(pubDate: string): number {
  const match = pubDate.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function isRecent(pubDate: string, months = 6): boolean {
  const year = parseYear(pubDate);
  if (!year) return false;
  const now = new Date();
  const articleDate = new Date(year, 5, 1);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return articleDate >= cutoff;
}

function scoreArticle(article: PubMedArticle): number {
  let score = 0;
  const text = combinedText(article);
  const journalLower = article.journal.toLowerCase();
  const pubTypeText = article.pubTypes.join(' ').toLowerCase();

  if (/randomized controlled trial/.test(pubTypeText)) score += 100;
  if (/systematic review/.test(pubTypeText)) score += 90;
  if (/meta-analysis/.test(pubTypeText)) score += 85;
  if (/guideline|consensus|recommendation/.test(text)) score += 80;
  if (/clinical trial/.test(pubTypeText)) score += 60;
  if (/multicenter|multi-center|registry/.test(text)) score += 40;
  if (/cohort/.test(text)) score += 30;
  if (TOP_JOURNALS.some(j => journalLower.includes(j))) score += 50;
  if (isRecent(article.pubDate, 6)) score += 25;

  const year = parseYear(article.pubDate);
  if (year >= new Date().getFullYear()) score += 20;
  else if (year >= new Date().getFullYear() - 1) score += 10;
  if (article.abstract.length > 200) score += 5;
  if (article.doi) score += 3;
  return score;
}

export function filterAndRankArticles(articles: PubMedArticle[], count = 5): PubMedArticle[] {
  const seen = new Set<string>();
  const candidates = articles.filter(a => { if (seen.has(a.pmid)) return false; seen.add(a.pmid); return true; });

  let filtered = candidates.filter(a => !shouldExclude(a));
  if (filtered.length < count) {
    filtered = candidates.filter(a => !/case report|study protocol/i.test(combinedText(a)));
  }
  if (filtered.length < count) filtered = candidates;

  return filtered
    .map(a => ({ article: a, score: scoreArticle(a) }))
    .sort((a, b) => {
      const yearDiff = parseYear(b.article.pubDate) - parseYear(a.article.pubDate);
      if (yearDiff !== 0) return yearDiff;
      return b.score - a.score;
    })
    .slice(0, count)
    .map(x => x.article);
}
