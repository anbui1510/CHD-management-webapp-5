import {
  handleConsultSlideRequest,
  type ConsultSlideEnv,
} from '../../../src/consultSlide/cloudflareApi';

export const onRequest = async (context: {
  request: Request;
  env: ConsultSlideEnv;
}): Promise<Response> => {
  return handleConsultSlideRequest(context.request, context.env);
};
