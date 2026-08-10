const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const REQUIRED_ARK_VARIABLES = ["ARK_API_KEY", "ARK_MODEL_ID"] as const;

export function getArkConfigStatus() {
  const apiKey = process.env.ARK_API_KEY?.trim();
  const modelId = process.env.ARK_MODEL_ID?.trim();
  const missingVariables = REQUIRED_ARK_VARIABLES.filter(name => !process.env[name]?.trim());

  return {
    configured: missingVariables.length === 0,
    missingVariables,
    apiKey,
    modelId,
    baseUrl: (process.env.ARK_BASE_URL?.trim() || DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
  };
}
