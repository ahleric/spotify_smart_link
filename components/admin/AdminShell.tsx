'use client';

import { Suspense } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';

type AdminShellProps = {
  children: React.ReactNode;
};

export default function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_rgba(2,6,23,1)_42%),linear-gradient(180deg,_#020617_0%,_#020617_100%)] text-white">
      <div className="grid min-h-screen lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-slate-950/68 backdrop-blur-md lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <Suspense
            fallback={(
              <div className="p-4">
                <div className="h-24 animate-pulse rounded-2xl border border-white/10 bg-slate-900/70" />
              </div>
            )}
          >
            <AdminSidebar />
          </Suspense>
        </aside>
        <section className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-9">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </section>
      </div>
    </div>
  );
}
