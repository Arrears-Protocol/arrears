'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Container, DivideX } from './ui/primitives';
import { M } from '../lib/manifest';

/* Navbar + Footer + ModeToggle — harvested from nodus-agent-template (structure,
   hairline rails, link rhythm), normalised onto Arrears tokens and our copy. */

function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  const dark = resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label="Toggle colour theme"
      className="mono grid h-8 w-8 place-items-center rounded-[9px] border border-line text-[11px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg"
    >
      {m ? (dark ? '☾' : '☀') : '·'}
    </button>
  );
}

const NAV = [
  ['The rule', '#rule'],
  ['Rulings', '#outcomes'],
  ['File a claim', '#try'],
  ['Evidence', '#gallery'],
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-divide bg-bg/85 backdrop-blur-md">
      <Container className="flex h-14 items-center justify-between">
        <a href="#hero" className="flex items-baseline gap-2.5">
          <span className="display text-[21px] leading-none">Arrears</span>
          <span className="mono hidden text-[10px] uppercase tracking-[0.16em] text-fg-3 sm:inline">
            Creditcoin CC3
          </span>
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map(([l, h]) => (
            <a key={h} href={h} className="text-[13.5px] text-fg-2 transition-colors hover:text-fg">{l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <a
            href="https://github.com/Arrears-Protocol/arrears"
            target="_blank" rel="noreferrer"
            className="mono hidden rounded-[9px] border border-line px-3 py-1.5 text-[11.5px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg sm:block"
          >
            source ↗
          </a>
          <ModeToggle />
        </div>
      </Container>
    </header>
  );
}

export function Footer() {
  return (
    <>
      <DivideX />
      <footer className="py-14">
        <Container className="flex flex-wrap justify-between gap-10">
          <div className="max-w-[34ch]">
            <div className="display text-[22px]">Arrears</div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fg-3">
              A failed Ethereum transaction, treated as admissible evidence against a bonded
              operator. BUIDL CTC 2026 Fall · Creditcoin Attestcoin Protocol.
            </p>
          </div>
          <div className="mono text-[12.5px] leading-[2] text-fg-3">
            <a className="block hover:text-fg" href="https://github.com/Arrears-Protocol/arrears" target="_blank" rel="noreferrer">github ↗</a>
            <a className="block hover:text-fg" href={`${M.chains.cc3.explorer}/address/${M.contracts.arrearsCourt.address}`} target="_blank" rel="noreferrer">court on blockscout ↗</a>
            <a className="block hover:text-fg" href="/api/version">build version</a>
          </div>
          <div className="mono max-w-[40ch] text-[12px] leading-[1.8] text-fg-3">
            Every figure on this page is a hash in <span className="text-fg-2">manifest.json</span> or
            read live from Creditcoin by your browser. Testnet, unaudited. Attestation lag{' '}
            {M.attestation.measuredLagBlocks} blocks, measured.
          </div>
        </Container>
      </footer>
    </>
  );
}
