'use client';
import { ThemeProvider as NextThemes } from 'next-themes';

/** Dark default. `dark` is also on <html> server-side, so the no-JS path renders
 *  the dark theme correctly with no flash and no hydration dependency. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
