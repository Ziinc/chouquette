// withChouquette(nextConfig): a Next.js app built to run natively on
// chouquette's embedded Node. Client components render through
// @chouquette/react-dom; the server half runs in the same process.

/**
 * @param {Record<string, any>} [nextConfig]
 * @returns {Record<string, any>}
 */
export function withChouquette(nextConfig = {}) {
  return {
    ...nextConfig,
    // The server half with only the files it needs, for the app's bundle.
    output: "standalone",
    // chouquette's packages ship TypeScript.
    transpilePackages: [...(nextConfig.transpilePackages ?? []), "chouquette", "@chouquette/react-dom"],
    // No image optimizer: images load as they are.
    images: { ...nextConfig.images, unoptimized: true },
    webpack(config, context) {
      const out = nextConfig.webpack ? nextConfig.webpack(config, context) : config;
      if (!context.isServer) {
        out.resolve = out.resolve ?? {};
        out.resolve.alias = {
          ...out.resolve.alias,
          "react-dom$": "@chouquette/react-dom",
          "react-dom/client": "@chouquette/react-dom/client",
        };
      }
      return out;
    },
  };
}
