export function getApiBaseUrl(): string {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "API_BASE_URL is not set. Point it at the Auth/Validation/Stock backend " +
        "described in phase-1/05_api-contract.md (e.g. http://localhost:8080)."
    );
  }
  return baseUrl;
}
