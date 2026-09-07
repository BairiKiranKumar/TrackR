import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/providers/AppProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppHeader } from '@/components/layout/AppHeader';
import { SideNav } from '@/components/layout/SideNav';

export const metadata: Metadata = {
  title: 'TRACKR — Write it. Track it. Link it. Understand it.',
  description: 'Your personal command center. Notes, tasks, trackers, and money — all connected with @references.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TRACKR',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0A0A0F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <AppProvider>
            <AppHeader />
            <div id="app-root">
              <SideNav />
              <main className="app-main">
                {children}
              </main>
              <BottomNav />
            </div>
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
