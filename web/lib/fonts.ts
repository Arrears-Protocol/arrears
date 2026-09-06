import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from 'next/font/google';

/** Display — a serif, because Arrears is a credit record and the one face with
 *  character should say "document", not "protocol". Hero and section heads only. */
export const display = Instrument_Serif({
  subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'],
  variable: '--font-instrument-serif', display: 'swap',
});

/** Body — neutral, dense, good at 15–17px. */
export const sans = Inter_Tight({
  subsets: ['latin'], weight: ['400', '500', '600'],
  variable: '--font-inter-tight', display: 'swap',
});

/** Data — every hash, address, gas figure, selector, verdict, block.
 *  Tabular figures so columns align; slashed zero so 0x0 is never 0xO. */
export const mono = JetBrains_Mono({
  subsets: ['latin'], weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono', display: 'swap',
});

export const fontVars = `${display.variable} ${sans.variable} ${mono.variable}`;
