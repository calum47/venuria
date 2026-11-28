import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// No locale-prefixed URLs: the language lives in a cookie (see src/i18n/request.ts), so routes stay /planner, /editor…
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
