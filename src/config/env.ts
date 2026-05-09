import dotenv from "dotenv";

dotenv.config();

const required = [
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_REDIRECT_URI",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "USER_EMAIL",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const env = {
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID!,
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID!,
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  userEmail: process.env.USER_EMAIL!,
  port: parseInt(process.env.PORT || "3000", 10),
  pollCron: process.env.POLL_CRON || "",
  cronSecret: process.env.CRON_SECRET || "",
};
