"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/trafego", label: "Tráfego", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/campanhas", label: "Campanhas", icon: "M12 5v14M5 12h14" },
  { href: "/criativos", label: "Criativos", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 15l4-4 4 4 3-3 5 5M15 9h.01" },
  { href: "/integrations", label: "Integrações", icon: "M8 12h8M12 8v8M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2z" },
  { href: "/conferencia", label: "Conferência", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" },
  { href: "/settings", label: "Configurações", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export function Sidebar() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <>
    <nav className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b border-line bg-[#0c0d10] px-4 py-2 md:hidden">
      <span className="mr-2 shrink-0 text-sm font-semibold">
        n<span className="text-accent">t</span>
      </span>
      {NAV.map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm ${on ? "bg-panel2 text-zinc-100" : "text-muted"}`}>
            {n.label}
          </Link>
        );
      })}
      <button onClick={logout} className="ml-auto shrink-0 px-2 text-sm text-faint">Sair</button>
    </nav>
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-[#0c0d10] px-3 py-5 md:flex">
      <div className="mb-8 px-2">
        <div className="text-[15px] font-semibold tracking-tight">
          native<span className="text-accent">traffic</span>
        </div>
        <div className="label mt-0.5">operational</div>
      </div>
      <nav className="space-y-1">
        {NAV.map((n) => {
          const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                on ? "bg-panel2 text-zinc-100" : "text-muted hover:bg-panel hover:text-zinc-200"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={n.icon} />
              </svg>
              {n.label}
              {on && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="mt-auto rounded-lg px-2.5 py-2 text-left text-sm text-faint transition hover:bg-panel hover:text-zinc-200"
      >
        Sair
      </button>
    </aside>
    </>
  );
}
