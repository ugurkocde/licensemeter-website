/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // The CSV import posts two admin-center exports (5 MB each, checked
      // server-side) through a server action; the default limit is 1 MB.
      bodySizeLimit: "8mb",
    },
  },
  // The floating dev badge sits exactly over the sidebar's sign-out button.
  devIndicators: false,
  async redirects() {
    return [
      {
        source:
          "/app/settings/:provider(microsoft|adobe|zoom|atlassian|salesforce|openai|anthropic|chatgpt|claude)",
        destination: "/app/connectors/:provider",
        permanent: false,
      },
    ];
  },
  // Serve the status page at status.licensemeter.com/ once the subdomain is
  // pointed at this project. Other paths on the subdomain fall through to the
  // normal app; the subdomain is only meant as an entry point to /status.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "status.licensemeter.com" }],
          destination: "/status",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://client.crisp.chat https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://client.crisp.chat; img-src 'self' data: https:; font-src 'self' data: https://client.crisp.chat; connect-src 'self' https://changelog.ugurlabs.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://client.crisp.chat https://storage.crisp.chat https://challenges.cloudflare.com wss://client.relay.crisp.chat wss://client.relay.rescue.crisp.chat; media-src 'self' https://client.crisp.chat https://storage.crisp.chat; frame-src https://challenges.cloudflare.com https://client.crisp.chat https://assets.crisp.chat https://*.crisp.help; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
        ],
      },
    ];
  },
};

export default config;
