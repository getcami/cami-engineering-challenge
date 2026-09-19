import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Cami Request Desk',
  description: 'Customer request triage console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cami Challenge
                  </p>
                  <h1 className="text-lg font-semibold">Request Desk</h1>
                </div>
                {/* next/link keeps navigation client-side, so the TanStack Query cache
                    (and the invalidation after a classify) is shared between pages. */}
                <nav className="flex gap-4 text-sm">
                  <Link className="text-slate-700 hover:text-slate-900" href="/">
                    Requests
                  </Link>
                  <Link className="text-slate-700 hover:text-slate-900" href="/history">
                    History
                  </Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
