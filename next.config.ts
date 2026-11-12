import type { NextConfig } from "next";

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
  // Adjunta @tailwindcss/turbopack al pipeline global CSS de Webpack sin desactivar el soporte CSS integrado de Next.js
  webpack: (config) => {
    for (const rule of config.module?.rules ?? []) {
      if (rule && typeof rule === "object" && Array.isArray(rule.oneOf)) {
        for (const sub of rule.oneOf) {
          if (
            sub &&
            typeof sub === "object" &&
            Array.isArray(sub.use) &&
            sub.test instanceof RegExp &&
            sub.test.test("globals.css") &&
            !sub.test.test("globals.module.css")
          ) {
            sub.use.push({ loader: "@tailwindcss/turbopack" });
          }
        }
      }
    }
    return config;
  },
};

export default nextConfig;
