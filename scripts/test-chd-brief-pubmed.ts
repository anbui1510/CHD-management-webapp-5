/**
 * Quick smoke test: multi-source search + filter (no Gemini).
 * Run: npx tsx scripts/test-chd-brief-pubmed.ts
 */
import { getTopicForDate } from '../src/chdDailyBrief/topics.ts';
import { searchAllSourcesForTopic } from '../src/chdDailyBrief/literatureSearch.ts';
import { filterAndRankArticles } from '../src/chdDailyBrief/filterArticles.ts';

const topic = getTopicForDate(new Date());
console.log('Topic:', topic.topic);
console.log('Searching all literature sources...');
const { articles, sourcesHit } = await searchAllSourcesForTopic(topic);
console.log(`Sources hit: ${sourcesHit.join(', ') || '(none)'}`);
console.log(`Found ${articles.length} raw articles (deduped)`);
const selected = filterAndRankArticles(articles, 5);
console.log(`Selected ${selected.length} articles:`);
for (const a of selected) {
  const src = a.source ? `[${a.source}] ` : '';
  console.log(`- ${src}[${a.pmid}] ${a.title.slice(0, 80)}... (${a.journal}, ${a.pubDate})`);
}
