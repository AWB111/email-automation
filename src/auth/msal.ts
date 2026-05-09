import {
  ConfidentialClientApplication,
  Configuration,
  CryptoProvider,
} from "@azure/msal-node";
import { env } from "../config/env.js";
import { supabase } from "../db/client.js";
import { getTokens, saveTokens, updateAccessToken } from "../db/tokens.js";
import { log } from "../utils/logger.js";

const msalConfig: Configuration = {
  auth: {
    clientId: env.microsoftClientId,
    authority: `https://login.microsoftonline.com/${env.microsoftTenantId}`,
    clientSecret: env.microsoftClientSecret,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);
const cryptoProvider = new CryptoProvider();

const SCOPES = [
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
  "MailboxSettings.ReadWrite",
  "offline_access",
];

const PKCE_KEY_PREFIX = "pkce:";
const PKCE_TTL_MS = 10 * 60 * 1000;

async function savePkceVerifier(state: string, verifier: string): Promise<void> {
  const { error } = await supabase.from("app_state").upsert(
    {
      key: `${PKCE_KEY_PREFIX}${state}`,
      value: verifier,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`Failed to save PKCE verifier: ${error.message}`);
}

async function consumePkceVerifier(state: string): Promise<string> {
  const key = `${PKCE_KEY_PREFIX}${state}`;
  const { data, error } = await supabase
    .from("app_state")
    .select("value, updated_at")
    .eq("key", key)
    .single();

  if (error || !data) {
    throw new Error("PKCE state not found or expired. Please retry sign-in.");
  }

  await supabase.from("app_state").delete().eq("key", key);

  const ageMs = Date.now() - new Date(data.updated_at).getTime();
  if (ageMs > PKCE_TTL_MS) {
    throw new Error("PKCE state expired. Please retry sign-in.");
  }

  return data.value;
}

/**
 * Extracts the most recent refresh token from MSAL's in-memory cache.
 */
function extractRefreshTokenFromCache(): string | null {
  try {
    const cache = msalClient.getTokenCache().serialize();
    const cacheData = JSON.parse(cache);
    const refreshTokens = cacheData.RefreshToken || {};
    const tokens = Object.values(refreshTokens) as { secret: string }[];
    return tokens[0]?.secret || null;
  } catch {
    return null;
  }
}

export async function getAuthUrl(): Promise<string> {
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = cryptoProvider.createNewGuid();

  await savePkceVerifier(state, verifier);

  const authUrl = await msalClient.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: env.microsoftRedirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
  });

  return authUrl;
}

export async function handleCallback(code: string, state: string) {
  const verifier = await consumePkceVerifier(state);

  const result = await msalClient.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: env.microsoftRedirectUri,
    codeVerifier: verifier,
  });

  if (!result) throw new Error("No token response from Microsoft");

  const refreshToken = extractRefreshTokenFromCache();
  if (!refreshToken) {
    throw new Error("No refresh token found in MSAL cache");
  }

  await saveTokens(
    env.userEmail,
    refreshToken,
    result.accessToken,
    result.expiresOn ? new Date(result.expiresOn) : undefined
  );

  log.info("Auth tokens saved", { email: env.userEmail });
  return result;
}

/**
 * Gets a valid access token, hydrating MSAL's cache from the DB if needed
 * and refreshing if the current access token is expired.
 * Never asks for re-sign-in unless the refresh token itself has been revoked.
 */
export async function getAccessToken(): Promise<string> {
  // 1. Try in-memory MSAL cache first (fast path)
  const accounts = await msalClient.getTokenCache().getAllAccounts();

  if (accounts.length > 0) {
    try {
      const result = await msalClient.acquireTokenSilent({
        account: accounts[0],
        scopes: SCOPES,
      });
      if (result?.accessToken) {
        await updateAccessToken(
          env.userEmail,
          result.accessToken,
          result.expiresOn ? new Date(result.expiresOn) : undefined
        );

        // Refresh token may have rotated — sync to DB
        const newRefreshToken = extractRefreshTokenFromCache();
        if (newRefreshToken) {
          const stored = await getTokens(env.userEmail);
          if (stored && stored.refresh_token !== newRefreshToken) {
            await saveTokens(
              env.userEmail,
              newRefreshToken,
              result.accessToken,
              result.expiresOn ? new Date(result.expiresOn) : undefined
            );
          }
        }

        return result.accessToken;
      }
    } catch (err) {
      log.info("Silent token acquisition failed, falling back to DB refresh token", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Fall back to stored refresh token
  const tokens = await getTokens(env.userEmail);
  if (!tokens?.refresh_token) {
    throw new Error("No auth tokens found. Please sign in at /auth/login");
  }

  const result = await msalClient.acquireTokenByRefreshToken({
    refreshToken: tokens.refresh_token,
    scopes: SCOPES,
  });

  if (!result?.accessToken) {
    throw new Error("Failed to refresh access token");
  }

  // Save the (possibly rotated) refresh token + new access token
  const newRefreshToken = extractRefreshTokenFromCache() || tokens.refresh_token;
  await saveTokens(
    env.userEmail,
    newRefreshToken,
    result.accessToken,
    result.expiresOn ? new Date(result.expiresOn) : undefined
  );

  return result.accessToken;
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens(env.userEmail);
  return !!tokens?.refresh_token;
}
