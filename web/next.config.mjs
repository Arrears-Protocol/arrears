/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // demo/manifest.json is the single source of truth and lives outside web/.
  // Vercel's Root Directory is the repository root so the import resolves.
  outputFileTracingRoot: process.cwd(),
  env: {
    // Vercel injects these; locally they stay undefined and /api/version says so.
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
    NEXT_PUBLIC_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? '',
  },
};
export default nextConfig;
