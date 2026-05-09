import { supabase } from "./client.js";

export async function setState(key: string, value: string) {
  const { error } = await supabase.from("app_state").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) throw new Error(`Failed to set state '${key}': ${error.message}`);
}

export async function getState(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", key)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get state '${key}': ${error.message}`);
  }

  return data?.value ?? null;
}
