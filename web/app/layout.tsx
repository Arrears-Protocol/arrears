import './globals.css';
import type { Metadata } from 'next';
import { fontVars } from '../lib/fonts';
import { ThemeProvider } from '../components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Arrears — a failed transaction is evidence',
  description:
    'A Creditcoin contract that treats a failed Ethereum transaction as admissible evidence against a bonded operator. Slashes the bond, reprices the credit line, and refuses far more often than it slashes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontVars} dark`} suppressHydrationWarning>
      <head>
        {/* Sets `js` before first paint, so scroll-reveals hide only when they
            can also un-hide. Without JS this never runs and nothing is hidden. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
