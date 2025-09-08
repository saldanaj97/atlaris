import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options?: { template?: string }) => Promise<string | null>;
      };
    };
  }
}

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      // Attach a Clerk session token to Supabase requests using the native integration.
      // Token is fetched once and cached to avoid per-request fetching.
      fetch: async (url, options) => {
        const headers = new Headers(options?.headers);

        // Only add Authorization if not already present
        if (!headers.has("Authorization")) {
          const token = await getClerkToken();
          if (token) headers.set("Authorization", `Bearer ${token}`);
        }

        return fetch(url, { ...options, headers });
      },
    },
  });

let cachedClerkToken: string | null = null;

async function getClerkToken(): Promise<string | null> {
  if (cachedClerkToken) return cachedClerkToken;
  if (typeof window !== "undefined" && window.Clerk?.session) {
    cachedClerkToken = await window.Clerk.session.getToken();
  }
  return cachedClerkToken;
}
