import "dotenv/config";

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env first.");
  }
  return value;
}

export function getApiPort(): number {
  const value = Number(process.env.API_PORT ?? "8787");
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("API_PORT must be a valid TCP port.");
  }
  return value;
}
