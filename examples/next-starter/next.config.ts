import type { NextConfig } from "next";
import { withChouquette } from "chouquette/next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// The one change to create-next-app's starter: it runs natively on chouquette.
export default withChouquette(nextConfig);
