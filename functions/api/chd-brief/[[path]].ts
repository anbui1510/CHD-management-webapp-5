import { handleChdBriefRequest, type ChdBriefEnv } from '../../../src/chdDailyBrief/cloudflareApi';

export const onRequest = async (context: {
  request: Request;
  env: ChdBriefEnv;
}): Promise<Response> => {
  return handleChdBriefRequest(context.request, context.env);
};
