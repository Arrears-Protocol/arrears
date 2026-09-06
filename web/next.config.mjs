/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // demo/manifest.json is the single source of truth and lives outside web/.
  // Vercel's Root Directory is the repository root so the import resolves.
  outputFileTracingRoot: process.cwd(),
  env: {
    // Two ways the live commit can be known, because a CLI deploy has neither git link nor
    // .git on the builder:
    //   VERCEL_GIT_COMMIT_SHA  — set automatically, but ONLY on a git-linked project
    //   ARREARS_COMMIT         — passed with --build-env at deploy time from the local shell
    // Without the second, a CLI-deployed build cannot say which commit it came from, and
    // "which commit is live" becomes a guess. That is the drift this exists to prevent.
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.ARREARS_COMMIT ?? '',
    NEXT_PUBLIC_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.ARREARS_BRANCH ?? '',
    NEXT_PUBLIC_COMMIT_SOURCE: process.env.VERCEL_GIT_COMMIT_SHA ? 'git-link' : (process.env.ARREARS_COMMIT ? 'cli-build-env' : 'none'),
  },
};
export default nextConfig;
