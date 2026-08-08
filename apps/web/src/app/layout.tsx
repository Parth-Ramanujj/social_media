import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/globals.css';
import { AppProviders } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pulse — social media operations',
  description: 'Multi-tenant social media management: schedule, approve, publish, measure.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AppProviders>
          <ToastProvider>{children}</ToastProvider>
        </AppProviders>
      </body>
    </html>
  );
}
