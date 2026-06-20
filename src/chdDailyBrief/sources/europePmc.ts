import type { PubMedArticle } from '../types';

const EUROPE_PMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

interface EuropePmcResult {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  abstractText?: string;
  pubType?: string;
  source?: string;
}

function mapEuropePmcRow(row: EuropePmcResult, label: string): PubMedArticle | null {
  if (!row.title?.trim()) return null;
  const authors = row.authorString
    ? row.authorString.split(',').map(a => a.trim()).filter(Boolean)
    : [];
  const doi = row.doi ? (row.doi.startsWith('http') ? row.doi : `https://doi.org/${row.doi}`) : '';
  const pubTypes = row.pubType ? row.pubType.split(',').map(t => t.trim()) : [];
  const srcLabel =
    label === 'Cochrane Library'
      ? 'Cochrane Library'
      : row.source === 'EMC' || row.source === 'EME'
        ? 'Embase (Europe PMC)'
        : row.source === 'PMC'
          ? 'PubMed Central (PMC)'
          : row.source === 'MED'
            ? 'PubMed / MEDLINE'
            : label;

  return {
    pmid: row.pmid || row.pmcid?.replace(/^PMC/i, '') || '',
    title: row.title.trim(),
    abstract: row.abstractText?.trim() || '',
    authors,
    journal: row.journalTitle?.trim() || '',
    pubDate: row.pubYear || '',
    doi,
    pubTypes,
    source: srcLabel,
  };
}

export async function searchEuropePMC(
  query: string,
  options: { pageSize?: number; sourceLabel?: string } = {}
): Promise<PubMedArticle[]> {
  const pageSize = options.pageSize ?? 20;
  const params = new URLSearchParams({
    query,
    format: 'json',
    pageSize: String(pageSize),
    sort: 'CITED desc',
  });

  const res = await fetch(`${EUROPE_PMC_SEARCH}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { resultList?: { result?: EuropePmcResult[] } };
  const rows = data?.resultList?.result ?? [];
  const label = options.sourceLabel ?? 'Europe PMC';

  return rows
    .map(r => mapEuropePmcRow(r, label))
    .filter((a): a is PubMedArticle => a !== null);
}

/** Europe PMC: MEDLINE + PMC + Embase (licensed) + preprints */
export async function searchEuropePmcMedlinePmcEmbase(query: string): Promise<PubMedArticle[]> {
  const q = `(SRC:MED OR SRC:PMC OR SRC:EMC OR SRC:EME) AND (${query})`;
  return searchEuropePMC(q, { pageSize: 25, sourceLabel: 'Europe PMC (MEDLINE/PMC/Embase)' });
}

export async function searchCochraneEuropePmc(query: string): Promise<PubMedArticle[]> {
  const q = `(JOURNAL:"Cochrane Database of Systematic Reviews" OR SRC:COH OR PUBLISHER:"Wiley") AND (${query})`;
  return searchEuropePMC(q, { pageSize: 10, sourceLabel: 'Cochrane Library' });
}
