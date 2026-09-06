/**
 * Reports the commit the live build came from, so drift between main and production is
 * detectable rather than silent. A CLI-created Vercel project has no git link and never
 * redeploys on push; if `sha` here stops matching origin/main, that is what happened.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_COMMIT_SHA ?? '';
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_COMMIT_REF ?? '';
  return Response.json({
    commit: sha || null,
    commitShort: sha ? sha.slice(0, 7) : null,
    branch: ref || null,
    repo: 'https://github.com/Arrears-Protocol/arrears',
    gitLinked: Boolean(sha),
    hint: sha
      ? 'Compare against origin/main. A mismatch means a push did not deploy.'
      : 'No commit SHA. Either a local build, or a Vercel project with no GitHub link — pushes will not deploy.',
    relayerConfigured: Boolean(process.env.RELAYER_PRIVATE_KEY),
    builtAt: new Date().toISOString(),
  });
}
