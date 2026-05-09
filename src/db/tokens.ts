import { supabase } from "./client.js";

interface TokenRow {
  user_email: string;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
}

/**
 * Saves the full token set (initial sign-in or refresh-token rotation).
 */
export async function saveTokens(
  userEmail: string,
  refreshToken: string,
  accessToken?: string,
  expiresAt?: Date
) {
  if (!refreshToken) {
    throw new Error("saveTokens requires a non-empty refresh token. Use updateAccessToken instead.");
  }

  const { error } = await supabase.from("auth_tokens").upsert(
    {
      user_email: userEmail,
      refresh_token: refreshToken,
      access_token: accessToken || null,
      expires_at: expiresAt?.toISOString() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" }
  );

  if (error) throw new Error(`Failed to save tokens: ${error.message}`);
}

/**
 * Updates only the access token without touching the refresh token.
 * Used after silent token refresh.
 */
export async function updateAccessToken(
  userEmail: string,
  accessToken: string,
  expiresAt?: Date
) {
  const { error } = await supabase
    .from("auth_tokens")
    .update({
      access_token: accessToken,
      expires_at: expiresAt?.toISOString() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_email", userEmail);

  if (error) throw new Error(`Failed to update access token: ${error.message}`);
}

export async function getTokens(
  userEmail: string
): Promise<TokenRow | null> {
  const { data, error } = await supabase
    .from("auth_tokens")
    .select("user_email, refresh_token, access_token, expires_at")
    .eq("user_email", userEmail)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get tokens: ${error.message}`);
  }

  return data;
}

export async function deleteTokens(userEmail: string) {
  const { error } = await supabase
    .from("auth_tokens")
    .delete()
    .eq("user_email", userEmail);

  if (error) throw new Error(`Failed to delete tokens: ${error.message}`);
}
