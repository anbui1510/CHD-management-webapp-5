import type { PubMedArticle } from '../types';

const S2_SEARCH = 'https://api.semanticscholar.org/graph/v1/paper/search';

interface S2Paper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  authors?: Array<{ name?: string }>;
  journal?: { name?: string };
  externalIds?: { DOI?: string; PubMed?: string };
  publicationTypes?: string[];
}

export async function searchSemanticScholar(query: string): Promise<PubMedArticle[]> {
  const params = new URLSearchParams({
    query,
    limit: '15',
    fields: 'title,abstract,year,authors,journal,externalIds,publicationTypes',
  });

  const res = await fetch(`${S2_SEARCH}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { data?: S2Paper[] };
  return (data.data ?? [])
    .filter(p => p.title?.trim())
    .map(p => ({
      pmid: p.externalIds?.PubMed || p.paperId || '',
      title: p.title!.trim(),
      abstract: p.abstract?.trim() || '',
      authors: (p.authors ?? []).map(a => a.name || '').filter(Boolean),
      journal: p.journal?.name?.trim() || '',
      pubDate: p.year ? String(p.year) : '',
      doi: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : '',
      pubTypes: p.publicationTypes ?? [],
      source: 'Semantic Scholar',
    }));
}
