/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Build CSP — slightly looser in dev (needs unsafe-eval for HMR).
const cspDirectives = [
  "default-src 'self'",
  // Tailwind / shadcn and some Next.js internals use inline styles
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // `data:` is needed for inline (base64) fonts shipped by some bundles.
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
  "frame-src 'self' blob:", // allow PDF blob previews
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  // Scripts: unsafe-inline needed for Next.js script chunks; unsafe-eval only in dev
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
];

const nextConfig = {
  output: "standalone",

  // Server-only env vars that must be available at SSR runtime on Azure SWA.
  //
  // SWA's Application Settings don't reach the Next.js managed function in
  // this project's setup (verified via /diag/env). Build-time env vars
  // injected by the GitHub Actions workflow DO reach the build, so we use
  // `env` to inline them into the server bundle. The corresponding GitHub
  // repo secret is named the same.
  //
  // SAFETY: `env` inlines values into BOTH client and server bundles. Service
  // role keys must never be imported from a client component. The
  // `import "server-only"` guard at the top of src/lib/supabase/service.ts
  // makes that a build error if anyone tries.
  env: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Force HTTPS for 1 year, include subdomains, preload-ready
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Isolate browsing context group — mitigates Spectre-class attacks
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
        ],
      },
    ];
  },
};

export default nextConfig;
