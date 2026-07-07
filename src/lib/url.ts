export function getAppUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}
