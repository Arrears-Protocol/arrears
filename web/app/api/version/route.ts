/**
 * Which commit is live.
 *
 * A CLI-created Vercel project has NO GitHub link: pushes do not deploy, and Vercel injects no
 * VERCEL_GIT_* variables. So a CLI build has no idea what it was built from unless it is told,
 * and "is production stale?" becomes a guess. It gets told, with --build-env ARREARS_COMMIT,
 * and reports the answer here.
 *
 *   commitSource: "git-link"      the project is linked; pushes deploy automatically
 *   commitSource: "cli-build-env" deployed by hand; pushes do NOT deploy, redeploy manually
 *   commitSource: "none"          the build cannot say what it is. Treat production as unknown.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  const cliSha = process.env.ARREARS_COMMIT ?? process.env.NEXT_PUBLIC_COMMIT_SHA ?? '';
  const sha = gitSha || cliSha;
  const source = gitSha ? 'git-link' : cliSha ? 'cli-build-env' : 'none';

  return Response.json({
    commit: sha || null,
    commitShort: sha ? sha.slice(0, 7) : null,
    commitSource: source,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_COMMIT_REF ?? null,
    gitLinked: Boolean(gitSha),
    autoDeploysOnPush: Boolean(gitSha),
    repo: 'https://github.com/Arrears-Protocol/arrears',
    relayerConfigured: Boolean(process.env.RELAYER_PRIVATE_KEY),
    hint:
      source === 'git-link'
        ? 'Linked. A push to main deploys automatically; compare commitShort against origin/main.'
        : source === 'cli-build-env'
          ? 'Deployed by CLI. Pushes do NOT deploy — this build is frozen at commitShort until someone redeploys by hand.'
          : 'This build cannot say which commit it came from. Treat production as unknown and redeploy.',
    builtAt: new Date().toISOString(),
  });
}
