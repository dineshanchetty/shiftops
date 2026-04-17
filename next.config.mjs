/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Build CSP — slightly looser in dev (needs unsafe-eval for HMR).
const cspDirectives = [
  "default-src 'self'",
  // Tailwind / shadcn and some Next.js internals use inline styles
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
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
