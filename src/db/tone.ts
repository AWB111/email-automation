import { supabase } from "./client.js";

export async function saveToneProfile(
  userEmail: string,
  profileText: string,
  emailsAnalyzed: number
) {
  const { error } = await supabase.from("tone_profiles").upsert(
    {
      user_email: userEmail,
      profile_text: profileText,
      emails_analyzed: emailsAnalyzed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" }
  );

  if (error) throw new Error(`Failed to save tone profile: ${error.message}`);
}

export async function getToneProfile(
  userEmail: string
): Promise<{ profile_text: string; emails_analyzed: number } | null> {
  const { data, error } = await supabase
    .from("tone_profiles")
    .select("profile_text, emails_analyzed")
    .eq("user_email", userEmail)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get tone profile: ${error.message}`);
  }

  return data;
}
