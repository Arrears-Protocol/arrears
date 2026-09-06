'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Container } from '../ui/primitives';
import { ConnectButton } from './Wallet';
import { cn } from '../../lib/cn';

/** The dashboard shell. Same navbar structure, tokens and type as the landing
 *  page — harvested from nodus once and reused, so this reads as the same
 *  product rather than a bolt-on. */

const ROUTES = [
  ['/dashboard', 'Overview'],
  ['/dashboard/operator', 'Operator'],
  ['/dashboard/claim', 'Claimant'],
  ['/dashboard/o', 'Look up a record'],
];

function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  const dark = resolvedTheme === 'dark';
  return (
    <button onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle colour theme"
      className="mono grid h-8 w-8 place-items-center rounded-inner border border-line text-[11px] text-fg-2 hover:border-fg-3 hover:text-fg">
      {m ? (dark ? '☾' : '☀') : '·'}
    </button>
  );
}

export function DashShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-divide bg-bg/85 backdrop-blur-md">
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="display text-[21px] leading-none">Arrears</Link>
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-fg-3">dashboard</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/" className="mono hidden text-[11.5px] text-fg-3 hover:text-fg sm:block">← the argument</Link>
            <ConnectButton />
            <ModeToggle />
          </div>
        </Container>
      </header>

      <Container className="py-10">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          <nav className="mb-8 lg:mb-0">
            <div className="mono mb-3 text-[10px] uppercase tracking-[0.12em] text-fg-3">roles</div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:block">
              {ROUTES.map(([href, label]) => {
                // segment-aware: '/dashboard/operator' must not light up '/dashboard/o'
                const active = href === '/dashboard'
                  ? path === href
                  : path === href || path.startsWith(href + '/');
                return (
                  <li key={href}>
                    <Link href={href}
                      className={cn('block py-1.5 text-[14px] transition-colors',
                        active ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}>
                      <span className="mono mr-2 text-[10px]" style={{ opacity: active ? 1 : 0 }}>›</span>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mono mt-6 hidden max-w-[24ch] text-[10.5px] leading-relaxed text-fg-3 lg:block">
              Reading needs no wallet. Only the write actions do.
            </p>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </>
  );
}

/** The six-cell live grid from the landing page's operator panel, reused as the
 *  dashboard stat row. Same component language, same tokens. */
export function StatRow({ cells, accent }: { cells: Array<[string, string]>; accent?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-bg-sunken">
      {accent && (
        <div aria-hidden className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: 'linear-gradient(90deg, var(--moved), var(--kept), var(--away))' }} />
      )}
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-6">
        {cells.map(([k, v]) => (
          <div key={k} className="bg-bg-raised px-3.5 py-3.5">
            <div className="mono text-[10px] uppercase tracking-[0.09em] text-fg-3">{k}</div>
            <div className="mono mt-1.5 text-[15px] font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
