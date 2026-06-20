/**
 * Quick smoke test: PubMed search + filter (no Gemini).
 * Run: npx tsx scripts/test-chd-brief-pubmed.ts
 */
import { getTopicForDate } from '../src/chdDailyBrief/topics.ts';
import { searchPubMedForTopic } from '../src/chdDailyBrief/pubmed.ts';
import { filterAndRankArticles } from '../src/chdDailyBrief/filterArticles.ts';

const topic = getTopicForDate(new Date());
console.log('Topic:', topic.topic);
console.log('Searching PubMed...');
const articles = await searchPubMedForTopic(topic);
console.log(`Found ${articles.length} raw articles`);
const selected = filterAndRankArticles(articles, 5);
console.log(`Selected ${selected.length} articles:`);
for (const a of selected) {
  console.log(`- [${a.pmid}] ${a.title.slice(0, 80)}... (${a.journal}, ${a.pubDate})`);
}
