export function requireGoogleApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || key.length === 0) {
    throw new Error(
      "GOOGLE_API_KEY not set. Expected via --env-file ../../tooldi-agent-runtime/.env.local",
    );
  }
  return key;
}
