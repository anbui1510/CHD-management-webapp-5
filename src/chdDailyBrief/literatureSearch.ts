import type { PubMedArticle } from './types';
import type { DailyTopic } from './types';
import { buildEuropePmcQuery, buildPlainQuery, buildTopicQuery } from './buildQuery';
import { searchPubMedForTopic, searchPmcQuery, searchPubMedQuery } from './pubmed';
import {
  searchCochraneEuropePmc,
  searchEuropePmcMedlinePmcEmbase,
  searchEuropePMC,
} from './sources/europePmc';
import { searchSemanticScholar } from './sources/semanticScholar';
import { searchOpenAlex } from './sources/openAlex';

export const LITERATURE_SOURCES = [
  'PubMed / MEDLINE',
  'PubMed Central (PMC)',
  'Embase (via Europe PMC)',
  'Cochrane Library',
  'Europe PMC',
  'Semantic Scholar',
  'OpenAlex (Web of Science / Scopus overlap)',
  'Google Scholar (via Semantic Scholar / OpenAlex index)',
] as const;

function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/doi\.org\//i, '').toLowerCase().trim();
}

export function articleDedupeKey(a: PubMedArticle): string {
  if (a.pmid && /^\d+$/.test(a.pmid)) return `pmid:${a.pmid}`;
  if (a.doi) return `doi:${normalizeDoi(a.doi)}`;
  return `title:${a.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 100)}`;
}

function mergeArticles(batches: PubMedArticle[][]): PubMedArticle[] {
  const seen = new Set<string>();
  const merged: PubMedArticle[] = [];
  for (const batch of batches) {
    for (const a of batch) {
      const key = articleDedupeKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(a);
    }
  }
  return merged;
}

async function runSource<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export interface LiteratureSearchResult {
  articles: PubMedArticle[];
  sourcesHit: string[];
}

export async function searchAllSourcesForTopic(
  topic: DailyTopic,
  config?: { email?: string; tool?: string }
): Promise<LiteratureSearchResult> {
  const plain = buildPlainQuery(topic);
  const epmcQuery = buildEuropePmcQuery(topic);
  const cochraneQuery = buildEuropePmcQuery(topic, true);
  const pubmedBroad = buildTopicQuery(topic, 'broad');

  const [pubmed, pmc, europePmc, cochrane, semantic, openAlex, pubmedBroadResults, tripStyle] =
    await Promise.all([
      runSource(() => searchPubMedForTopic(topic, config)),
      runSource(() => searchPmcQuery(pubmedBroad, config)),
      runSource(() => searchEuropePmcMedlinePmcEmbase(epmcQuery)),
      runSource(() => searchCochraneEuropePmc(cochraneQuery)),
      runSource(() => searchSemanticScholar(plain)),
      runSource(() => searchOpenAlex(plain)),
      runSource(() =>
        searchPubMedQuery(pubmedBroad, { ...config, mindate: undefined, retmax: 20 })
      ),
      runSource(() =>
        searchEuropePMC(
          `(TITLE:"${plain}" OR ABSTRACT:"${plain}") AND (clinical OR systematic review OR meta-analysis)`,
          { pageSize: 10, sourceLabel: 'TRiP Database (Europe PMC clinical filter)' }
        )
      ),
    ]);

  const batches: PubMedArticle[][] = [];
  const sourcesHit: string[] = [];

  const add = (label: string, data: PubMedArticle[] | null) => {
    if (data && data.length > 0) {
      batches.push(data);
      sourcesHit.push(label);
    }
  };

  add('PubMed / MEDLINE', pubmed);
  add('PubMed Central (PMC)', pmc);
  add('Europe PMC (MEDLINE/PMC/Embase)', europePmc);
  add('Cochrane Library', cochrane);
  add('Semantic Scholar', semantic);
  add('OpenAlex', openAlex);
  add('PubMed (mở rộng)', pubmedBroadResults);
  add('TRiP-style (Europe PMC)', tripStyle);

  let articles = mergeArticles(batches);

  if (articles.length < 5) {
    const fallbackPlain = await searchPubMedQuery(
      `"congenital heart disease" AND (${topic.keywords.split(',')[0]?.trim() || 'pediatric cardiology'})`,
      { ...config, mindate: undefined, retmax: 25 }
    );
    articles = mergeArticles([articles, fallbackPlain]);
    if (fallbackPlain.length) sourcesHit.push('PubMed fallback');
  }

  return { articles, sourcesHit: [...new Set(sourcesHit)] };
}

export { searchPubMedForTopic };
