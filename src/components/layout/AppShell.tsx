import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { CompanySwitcher } from "./CompanySwitcher";

/**
 * APP SHELL
 * ---------------------------------------------------------------------------
 * Persistent navigation with a scrolling content region.
 *
 * The content column is capped so that on a 2560px display the tables do not
 * stretch to unreadable line lengths, while still giving a 1440px executive
 * laptop the full density it needs.
 */
export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Navigating to a new page should start at the top of that page.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-w-0 h-screen overflow-y-auto">
        <div className="max-w-[1760px] mx-auto px-6 lg:px-8 py-7 pb-16">
          <CompanySwitcher />
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Standard vertical rhythm for a page's sections. */
export function PageSections({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5 mt-7">{children}</div>;
}
