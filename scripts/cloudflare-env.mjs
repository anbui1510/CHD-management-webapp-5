export function readGoogleScriptConfigFromEnv(env = process.env) {
  return {
    scriptUrl: String(env.GOOGLE_SCRIPT_URL || env.VITE_GOOGLE_SCRIPT_URL || '').trim(),
    scriptSecret: String(
      env.GOOGLE_SCRIPT_SECRET ||
      env.VITE_GOOGLE_SCRIPT_SECRET ||
      env.GOOGLE_SCRIPT_API_KEY ||
      env.VITE_GOOGLE_SCRIPT_API_KEY ||
      ''
    ).trim(),
  };
}
