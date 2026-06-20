export interface ChdArticle {
  titleNews: string;
  hook: string;
  body: string;
  titleOriginal: string;
  author: string;
  journal: string;
  date: string;
  doi: string;
  pmid?: string;
}

export interface ChdBriefContent {
  DATE_VN: string;
  DATE_ISO: string;
  TOPIC: string;
  articles: ChdArticle[];
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  doi: string;
  pubTypes: string[];
  /** Nguồn tra cứu: PubMed/MEDLINE, PMC, Europe PMC, Cochrane, Semantic Scholar, OpenAlex, … */
  source?: string;
}

export interface DailyTopic {
  weekday: number; // 0=Sunday, 1=Monday, ...
  topic: string;
  keywords: string;
  purpose: string;
  preferredTypes: string;
}

export interface BriefIndexEntry {
  date: string;
  topic: string;
  createdAt: string;
  status: 'success' | 'error';
  error?: string;
}

export interface BriefIndex {
  entries: BriefIndexEntry[];
  lastAutoRunDate?: string;
}

export type PipelineStage =
  | 'idle'
  | 'pubmed'
  | 'filter'
  | 'generate'
  | 'docx'
  | 'done'
  | 'error';

export interface PipelineStatus {
  stage: PipelineStage;
  message: string;
  date: string;
  running: boolean;
  error?: string;
}

export interface PipelineResult {
  success: boolean;
  content?: ChdBriefContent;
  jsonPath?: string;
  docxPath?: string;
  skipped?: boolean;
  error?: string;
}
