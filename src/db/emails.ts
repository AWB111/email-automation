import { supabase } from "./client.js";

export type Classification =
  | "respond"
  | "marketing"
  | "invitation"
  | "notification"
  | "fyi";

export interface ProcessedEmail {
  email_id: string;
  user_email: string;
  sender: string | null;
  subject: string | null;
  classification: Classification;
  skipped_by_rule: boolean;
  draft_created: boolean;
  draft_id: string | null;
  error: string | null;
}

export async function logProcessedEmail(email: ProcessedEmail) {
  const { error } = await supabase.from("processed_emails").upsert(
    {
      ...email,
      processed_at: new Date().toISOString(),
    },
    { onConflict: "email_id" }
  );

  if (error)
    throw new Error(`Failed to log processed email: ${error.message}`);
}

export async function isEmailProcessed(emailId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("processed_emails")
    .select("email_id, error")
    .eq("email_id", emailId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to check email: ${error.message}`);
  }

  // If previously logged with an error, allow retry
  if (data && data.error) return false;

  return !!data;
}

export async function getProcessedEmails(limit = 50) {
  const { data, error } = await supabase
    .from("processed_emails")
    .select("*")
    .order("processed_at", { ascending: false })
    .limit(limit);

  if (error)
    throw new Error(`Failed to get processed emails: ${error.message}`);

  return data;
}
