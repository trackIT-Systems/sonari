/** @type {import('next').NextConfig} */
const { execSync } = require("child_process");
const { version: pkgVersion } = require("./package.json");

/**
 * Get app version for cache invalidation.
 * Priority: CI env var > git describe > package.json
 */
function getAppVersion() {
  // 1. CI/CD environment variable (GitHub Actions: NEXT_PUBLIC_APP_VERSION=${{ github.ref_name }})
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }
  // 2. Git describe (for local dev - shows tag + commits since)
  try {
    // stdio: "pipe" suppresses error output when git fails (e.g., no .git directory in Docker)
    return execSync("git describe --tags --always", { stdio: "pipe" }).toString().trim();
  } catch {
    // 3. Fallback to package.json version
    return pkgVersion;
  }
}

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "",
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
