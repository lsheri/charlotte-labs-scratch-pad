// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const LOVABLE_CLOUD_URL = "https://nvxokbnrivmqlxqdmlrm.supabase.co";
const LOVABLE_CLOUD_PUBLISHABLE_KEY = "sb_publishable_S4oUXcDGgJ4MZcmIZ3Cr4w_AncZSAlp";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? LOVABLE_CLOUD_URL;
const supabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  LOVABLE_CLOUD_PUBLISHABLE_KEY;

const publicCloudEnv = {
  ...(supabaseUrl
    ? {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
        "process.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
      }
    : {}),
  ...(supabasePublishableKey
    ? {
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
        "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      }
    : {}),
};

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: publicCloudEnv,
  },
});
