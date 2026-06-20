import { GoogleGenAI } from '@google/genai';

import type { ChdBriefContent, PubMedArticle } from './types';

import type { DailyTopic } from './types';

import { formatDateISO, formatDateVN } from './topics';

import {

  formatGeminiUserError,

  isGeminiQuotaError,

  parseRetryDelayMs,

  resolveGeminiModels,

  sleep,

} from './geminiModels';



function buildPrompt(topic: DailyTopic, articles: PubMedArticle[], date: Date): string {

  const articlesJson = articles.map(a => ({

    pmid: a.pmid,

    title: a.title,

    abstract: a.abstract.slice(0, 1500),

    authors: a.authors.slice(0, 5),

    journal: a.journal,

    pubDate: a.pubDate,

    doi: a.doi || `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,

    pubTypes: a.pubTypes,

  }));



  return `Bạn là trợ lý y khoa chuyên tim mạch nhi. Tạo nội dung CHD Daily Brief từ 5 bài PubMed sau.



Chủ đề hôm nay: ${topic.topic}

Mục đích: ${topic.purpose}



Dữ liệu bài báo:

${JSON.stringify(articlesJson, null, 2)}



Trả về JSON thuần (không markdown, không giải thích) với cấu trúc:

{

  "DATE_VN": "${formatDateVN(date)}",

  "DATE_ISO": "${formatDateISO(date)}",

  "TOPIC": "${topic.topic}",

  "articles": [

    {

      "titleNews": "tiêu đề báo chí hấp dẫn, tối đa 12 từ, KHÔNG dịch thẳng tên gốc",

      "hook": "2-3 câu lôi cuốn, nêu điểm WOW hoặc con số ấn tượng",

      "body": "4-5 câu: thiết kế + cỡ mẫu (1 câu), kết quả cốt lõi kèm con số (1-2 câu), ý nghĩa lâm sàng (1-2 câu). Ưu tiên số liệu lâm sàng thay vì p-value",

      "titleOriginal": "tên bài gốc tiếng Anh",

      "author": "Tác giả cuối et al.",

      "journal": "tên tạp chí",

      "date": "Tháng/Năm",

      "doi": "https://doi.org/...",

      "pmid": "PMID"

    }

  ]

}



Quy tắc:

- Đúng 5 bài, mỗi bài tương ứng 1 PMID đầu vào

- KHÔNG dùng emdash (—), dùng dấu phẩy hoặc gạch ngang ngắn

- Luôn có DOI và titleOriginal

- Viết tiếng Việt y khoa chính xác`;

}



function extractJson(text: string): string {

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');

  const end = text.lastIndexOf('}');

  if (start >= 0 && end > start) return text.slice(start, end + 1);

  return text.trim();

}



function validateContent(data: unknown): ChdBriefContent {

  if (!data || typeof data !== 'object') throw new Error('Invalid JSON from Gemini');

  const obj = data as ChdBriefContent;

  if (!obj.DATE_VN || !obj.DATE_ISO || !obj.TOPIC || !Array.isArray(obj.articles)) {

    throw new Error('Missing required fields in Gemini response');

  }

  if (obj.articles.length < 1) throw new Error('No articles in Gemini response');

  for (const a of obj.articles) {

    if (!a.titleNews || !a.hook || !a.body || !a.titleOriginal) {

      throw new Error('Incomplete article in Gemini response');

    }

    a.hook = a.hook.replace(/\u2014/g, '-');

    a.body = a.body.replace(/\u2014/g, '-');

  }

  return obj;

}



async function generateWithModel(

  ai: GoogleGenAI,

  model: string,

  prompt: string

): Promise<ChdBriefContent> {

  const response = await ai.models.generateContent({

    model,

    contents: prompt,

    config: { responseMimeType: 'application/json' },

  });

  const text = response.text ?? '';

  const parsed = JSON.parse(extractJson(text));

  return validateContent(parsed);

}



export async function generateBriefContent(

  topic: DailyTopic,

  articles: PubMedArticle[],

  date: Date = new Date(),

  options?: { apiKey?: string; model?: string }

): Promise<ChdBriefContent> {

  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');



  const models = resolveGeminiModels(options?.model || process.env.GEMINI_MODEL);

  const ai = new GoogleGenAI({ apiKey });

  const prompt = buildPrompt(topic, articles, date);



  const errors: string[] = [];



  for (const model of models) {

    for (let attempt = 0; attempt < 2; attempt++) {

      try {

        return await generateWithModel(ai, model, prompt);

      } catch (err) {

        const friendly = formatGeminiUserError(err, model);

        errors.push(friendly);



        if (isGeminiQuotaError(err)) {

          const delay = parseRetryDelayMs(err);

          if (delay > 0 && delay <= 15000 && attempt === 0) {

            await sleep(delay);

            continue;

          }

          break;

        }

      }

    }

  }



  throw new Error(errors[errors.length - 1] ?? 'Gemini generation failed');

}


