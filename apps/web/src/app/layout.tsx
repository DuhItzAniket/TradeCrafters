import type { Metadata } from "next";
import Link from "next/link";
import { sessionForPage } from "@/lib/session";
import { Navigation } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TradeCrafters · Global markets laboratory",
    template: "%s · TradeCrafters",
  },
  description:
    "Explore global market identity and build a virtual multi-currency account. Foundation release with clearly labeled fictional scenarios.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await sessionForPage();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className="sidebar">
          <Link href="/" className="brand" aria-label="TradeCrafters home">
            <span className="brand-mark" aria-hidden="true">
              t<span>c</span>
            </span>
            <span>
              TradeCrafters<small>THE MARKET LAB</small>
            </span>
          </Link>
          <div className="workspace-label">
            <span className="status-dot" /> Personal workspace
          </div>
          <Navigation />
          <div className="sidebar-note">
            <span className="eyebrow">BUILD IN PUBLIC</span>
            <p>
              From a DBMS project
              <br />
              to a global market lab.
            </p>
            <a
              href="https://github.com/DuhItzAniket/TradeCrafters"
              target="_blank"
              rel="noreferrer"
            >
              Follow the build <span aria-hidden="true">↗</span>
            </a>
          </div>
          <footer className="creator-credit">
            Created by
            <br />
            <strong>Aniket Kumar &amp; Annapurna S</strong>
          </footer>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="breadcrumb">
              Workspace <span>/</span> Global markets
            </span>
            <div className="topbar-right">
              <span className="lab-badge">
                <span className="status-dot" /> Synthetic lab
              </span>
              <Link
                className="profile-link"
                href={session ? "/account" : "/sign-in"}
              >
                {session ? (
                  <>
                    <span className="avatar">
                      {session.user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>{session.user.name}</span>
                  </>
                ) : (
                  <>
                    Sign in <span aria-hidden="true">↗</span>
                  </>
                )}
              </Link>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <footer className="workspace-footer">
            <span>TradeCrafters / Foundation 0.1</span>
            <span>Virtual funds. Fictional prices. No real orders.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
