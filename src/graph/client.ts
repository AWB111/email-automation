import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import { getAccessToken } from "../auth/msal.js";

export function getGraphClient(): Client {
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await getAccessToken();
        done(null, token);
      } catch (err) {
        done(err as Error, null);
      }
    },
  });
}
