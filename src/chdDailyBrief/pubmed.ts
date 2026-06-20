import type { PubMedArticle } from './types';
import type { DailyTopic } from './types';
import { buildPlainQuery, buildTopicQuery } from './buildQuery';

const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

function getToolParams(config?: { email?: string; tool?: string }): Record<string, string> {
  return {
    tool: config?.tool || process.env.PUBMED_TOOL || 'chd-daily-brief',
    email: config?.email || process.env.PUBMED_EMAIL || 'chd-brief@example.com',
  };
}

async function esearch(
  query: string,
  db: 'pubmed' | 'pmc',
  options: { retmax: number; sort: string; mindate?: string },
  config?: { email?: string; tool?: string }
): Promise<string[]> {
  const params = new URLSearchParams({
    db,
    term: query,
    retmode: 'json',
    retmax: String(options.retmax),
    sort: options.sort,
    ...getToolParams(config),
  });
  if (options.mindate) {
    params.set('mindate', options.mindate.replace(/-/g, '/'));
    params.set('datetype', 'pdat');
  }

  const res = await fetch(`${ESEARCH_URL}?${params}`);
  if (!res.ok) throw new Error(`NCBI esearch (${db}) failed: ${res.status}`);
  const data = await res.json();
  return data?.esearchresult?.idlist ?? [];
}

function parsePubMedXml(xml: string, source: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  const articleBlocks = xml.split(/<PubmedArticle>/).slice(1);

  for (const block of articleBlocks) {
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) continue;

    const titleMatch = block.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const abstractParts: string[] = [];
    const abstractRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
    let absMatch;
    while ((absMatch = abstractRegex.exec(block)) !== null) {
      abstractParts.push(absMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    const abstract = abstractParts.join(' ');

    const authorMatches = [...block.matchAll(/<LastName>([\s\S]*?)<\/LastName>/g)];
    const authors = authorMatches.map(m => m[1].trim()).filter(Boolean);

    const journalMatch = block.match(/<Title>([\s\S]*?)<\/Title>/);
    const journal = journalMatch ? journalMatch[1].trim() : '';

    const yearMatch = block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const monthMatch = block.match(/<PubDate>[\s\S]*?<Month>([\w\d]+)<\/Month>/);
    const year = yearMatch?.[1] ?? '';
    const month = monthMatch?.[1] ?? '';
    const pubDate = month && year ? `${month}/${year}` : year;

    const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
    const doi = doiMatch ? `https://doi.org/${doiMatch[1].trim()}` : '';

    const pubTypes: string[] = [];
    const ptRegex = /<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(block)) !== null) {
      pubTypes.push(ptMatch[1].trim());
    }

    articles.push({ pmid: pmidMatch[1], title, abstract, authors, journal, pubDate, doi, pubTypes, source });
  }

  return articles;
}

async function efetchMetadata(
  pmids: string[],
  db: 'pubmed' | 'pmc',
  sourceLabel: string,
  config?: { email?: string; tool?: string }
): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db,
    id: pmids.join(','),
    retmode: 'xml',
    ...getToolParams(config),
  });
  const res = await fetch(`${EFETCH_URL}?${params}`);
  if (!res.ok) throw new Error(`NCBI efetch (${db}) failed: ${res.status}`);
  return parsePubMedXml(await res.text(), sourceLabel);
}

export async function searchPubMedQuery(
  query: string,
  config?: { email?: string; tool?: string; mindate?: string; retmax?: number }
): Promise<PubMedArticle[]> {
  const currentYear = new Date().getFullYear();
  const ids = await esearch(
    query,
    'pubmed',
    {
      retmax: config?.retmax ?? 15,
      sort: 'relevance',
      mindate: config?.mindate ?? `${currentYear - 2}/01/01`,
    },
    config
  );
  return efetchMetadata(ids, 'pubmed', 'PubMed / MEDLINE', config);
}

export async function searchPmcQuery(
  query: string,
  config?: { email?: string; tool?: string; retmax?: number }
): Promise<PubMedArticle[]> {
  const ids = await esearch(
    query,
    'pmc',
    { retmax: config?.retmax ?? 12, sort: 'relevance' },
    config
  );
  const articles = await efetchMetadata(ids.slice(0, 12), 'pmc', 'PubMed Central (PMC)', config);
  return articles.map(a => ({
    ...a,
    pmid: a.pmid || `pmc-${ids[articles.indexOf(a)]}`,
  }));
}

export async function searchPubMedForTopic(
  topic: DailyTopic,
  config?: { email?: string; tool?: string }
): Promise<PubMedArticle[]> {
  const currentYear = new Date().getFullYear();
  const mindate = `${currentYear - 2}/01/01`;

  const queries = [
    buildTopicQuery(topic, 'normal'),
    buildTopicQuery(topic, 'strict'),
    buildTopicQuery(topic, 'broad'),
    buildPlainQuery(topic),
  ];

  const idSets: string[] = [];
  for (const q of queries) {
    const ids = await esearch(q, 'pubmed', { retmax: 12, sort: 'relevance', mindate }, config);
    idSets.push(...ids);
    if (idSets.length >= 8) break;
  }

  if (idSets.length === 0) {
    const broadIds = await esearch(
      buildTopicQuery(topic, 'broad'),
      'pubmed',
      { retmax: 15, sort: 'relevance' },
      config
    );
    idSets.push(...broadIds);
  }

  const uniqueIds = [...new Set(idSets)].slice(0, 20);
  return efetchMetadata(uniqueIds, 'pubmed', 'PubMed / MEDLINE', config);
}
