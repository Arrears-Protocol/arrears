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
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
