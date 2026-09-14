import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageColophon } from "./PageColophon";

/**
 * APP SHELL — NORTH HOUSE
 * ---------------------------------------------------------------------------
 *   left    numbered navigation, persistent
 *   top     the control bar: company, filters, theme
 *   main    the reporting canvas
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
        <TopBar />
        <div className="max-w-[1760px] mx-auto px-8 lg:px-12 pt-7 pb-16">
          <Outlet />
          <PageColophon />
        </div>
      </main>
    </div>
  );
}

/**
 * Standard vertical rhythm for a page's sections. Sections are separated by
 * space and rules rather than by floating cards, so the gap is generous.
 */
export function PageSections({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-9 mt-7">{children}</div>;
}
