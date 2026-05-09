import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

const setupSQL = `
-- Auth tokens for Microsoft OAuth
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tone profiles (one per user)
CREATE TABLE IF NOT EXISTS tone_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  profile_text text NOT NULL,
  emails_analyzed int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Processed emails audit trail
CREATE TABLE IF NOT EXISTS processed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id text UNIQUE NOT NULL,
  user_email text NOT NULL,
  sender text,
  subject text,
  classification text NOT NULL,
  skipped_by_rule boolean DEFAULT false,
  draft_created boolean DEFAULT false,
  draft_id text,
  error text,
  processed_at timestamptz DEFAULT now()
);

-- Simple key-value state store
CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
`;

async function setup() {
  console.log("Creating database tables...");

  const { error } = await supabase.rpc("exec_sql", { sql: setupSQL });

  if (error) {
    // rpc exec_sql may not exist — fall back to running each statement
    console.log(
      "RPC not available, please run this SQL directly in the Supabase SQL editor:\n"
    );
    console.log(setupSQL);
    console.log(
      "\nGo to: Supabase Dashboard > SQL Editor > New Query > paste and run the SQL above."
    );
    return;
  }

  console.log("Tables created successfully.");
}

setup().catch(console.error);
