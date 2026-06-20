import type { PubMedArticle } from './types';
import type { DailyTopic } from './types';

const ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

function getToolParams(): Record<string, string> {
  return {
    tool: process.env.PUBMED_TOOL || 'chd-daily-brief',
    email: process.env.PUBMED_EMAIL || 'chd-brief@example.com',
  };
}

async function esearch(
  query: string,
  options: { retmax: number; sort: string; mindate?: string }
): Promise<string[]> {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmode: 'json',
    retmax: String(options.retmax),
    sort: options.sort,
    ...getToolParams(),
  });
  if (options.mindate) {
    params.set('mindate', options.mindate.replace(/-/g, '/'));
    params.set('datetype', 'pdat');
  }

  const res = await fetch(`${ESEARCH_URL}?${params}`);
  if (!res.ok) throw new Error(`PubMed esearch failed: ${res.status}`);
  const data = await res.json();
  return data?.esearchresult?.idlist ?? [];
}

function parsePubMedXml(xml: string): PubMedArticle[] {
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

    articles.push({ pmid: pmidMatch[1], title, abstract, authors, journal, pubDate, doi, pubTypes });
  }

  return articles;
}

async function efetchMetadata(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    ...getToolParams(),
  });
  const res = await fetch(`${EFETCH_URL}?${params}`);
  if (!res.ok) throw new Error(`PubMed efetch failed: ${res.status}`);
  return parsePubMedXml(await res.text());
}

export async function searchPubMedForTopic(topic: DailyTopic): Promise<PubMedArticle[]> {
  const currentYear = new Date().getFullYear();
  const query1 = `(${topic.keywords}) AND congenital heart disease AND pediatrics`;
  const query2 = `(${topic.keywords}) AND (randomized controlled trial OR systematic review OR meta-analysis) AND congenital heart disease`;

  const [ids1, ids2] = await Promise.all([
    esearch(query1, { retmax: 10, sort: 'pub_date', mindate: `${currentYear - 1}/01/01` }),
    esearch(query2, { retmax: 8, sort: 'relevance', mindate: '2023/01/01' }),
  ]);

  const uniqueIds = [...new Set([...ids1, ...ids2])].slice(0, 12);
  return efetchMetadata(uniqueIds);
}
