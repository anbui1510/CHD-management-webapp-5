import type { PubMedArticle } from '../types';

const OPENALEX = 'https://api.openalex.org/works';

interface OpenAlexWork {
  id?: string;
  title?: string;
  abstract_inverted_index?: Record<string, number[]>;
  publication_year?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  doi?: string;
  ids?: { pmid?: string; pmcid?: string };
  type?: string;
}

function invertedIndexToAbstract(idx: Record<string, number[]> | undefined): string {
  if (!idx) return '';
  const pairs: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) pairs.push([pos, word]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map(p => p[1]).join(' ');
}

export async function searchOpenAlex(query: string): Promise<PubMedArticle[]> {
  const currentYear = new Date().getFullYear();
  const params = new URLSearchParams({
    search: query,
    filter: `from_publication_date:${currentYear - 3}-01-01`,
    per_page: '15',
    mailto: 'chd-brief@example.com',
  });

  const res = await fetch(`${OPENALEX}?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'CHD-Daily-Brief/1.0 (mailto:chd-brief@example.com)' },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { results?: OpenAlexWork[] };
  return (data.results ?? [])
    .filter(w => w.title?.trim())
    .map(w => {
      const pmidRaw = w.ids?.pmid || '';
      const pmid = pmidRaw.replace(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '');
      return {
        pmid,
        title: w.title!.trim(),
        abstract: invertedIndexToAbstract(w.abstract_inverted_index),
        authors: (w.authorships ?? [])
          .map(a => a.author?.display_name || '')
          .filter(Boolean),
        journal: w.primary_location?.source?.display_name?.trim() || '',
        pubDate: w.publication_year ? String(w.publication_year) : '',
        doi: w.doi || '',
        pubTypes: w.type ? [w.type.replace(/_/g, ' ')] : [],
        source: 'OpenAlex (Web of Science / Scopus overlap)',
      };
    });
}
