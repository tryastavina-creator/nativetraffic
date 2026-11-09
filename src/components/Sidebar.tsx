"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Navigation grouped by what the operation does: acquire traffic, convert it, run the business.
 * Only pages that exist are listed; new areas (Ofertas e CRO, Meta/Google, Equipe…) join as they ship.
 */
type Leaf = { href: string; label: string; icon: string };
type Group = { label: string; icon: string; children: Leaf[] };
type Item = Leaf | Group;
type Section = { label: string; items: Item[] };

const I = {
  home: "M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  waves: "M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2",
  image: "M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
  dollar: "M12 2a10 10 0 100 20 10 10 0 000-20zM15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.6 6 4.7 0 1.3-1.3 2.5-3 2.5s-3-1.1-3-2.5M12 5.5V7M12 17v1.5",
  check: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9",
  plug: "M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0zM12 16v5",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  logout: "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
};

const SECTIONS: Section[] = [
  { label: "Visão geral", items: [{ href: "/", label: "Dashboard", icon: I.home }] },
  {
    label: "Aquisição",
    items: [
      { label: "Tráfego", icon: I.chart, children: [{ href: "/trafego", label: "Native Ads", icon: I.waves }] },
      { href: "/criativos", label: "Criativos", icon: I.image },
    ],
  },
  {
    label: "Operação",
    items: [{ label: "Financeiro", icon: I.dollar, children: [{ href: "/conferencia", label: "Conferência", icon: I.check }] }],
  },
];

const FOOTER: Leaf[] = [
  { href: "/integrations", label: "Integrações", icon: I.plug },
  { href: "/settings", label: "Configurações", icon: I.gear },
];

const isGroup = (i: Item): i is Group => "children" in i;
const isOn = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function LeafLink({ item, path, nested }: { item: Leaf; path: string; nested?: boolean }) {
  const on = isOn(item.href, path);
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition ${
        on
          ? "border-accent/40 bg-accent/10 text-accent"
          : `border-transparent ${nested ? "text-muted" : "text-zinc-300"} hover:bg-panel hover:text-zinc-100`
      }`}
    >
      <Icon d={item.icon} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function GroupItem({ group, path }: { group: Group; path: string }) {
  const hasActive = group.children.some((c) => isOn(c.href, path));
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-panel hover:text-zinc-100 ${
          hasActive ? "text-zinc-100" : "text-zinc-300"
        }`}
      >
        <Icon d={group.icon} />
        <span className="truncate">{group.label}</span>
        <span className={`ml-auto text-faint transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon d={I.chevron} size={14} />
        </span>
      </button>
      {open && (
        <div className="ml-[17px] mt-0.5 space-y-0.5 border-l border-line pl-3">
          {group.children.map((c) => (
            <LeafLink key={c.href} item={c} path={path} nested />
          ))}
        </div>
      )}
    </div>
  );
}

function useUser() {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});
  }, []);
  return user;
}

const initials = (u: string) => {
  const parts = u.split("@")[0].replace(/[._-]+/g, " ").trim().split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
};

function NavBody({ path, user, onLogout }: { path: string; user: string | null; onLogout: () => void }) {
  return (
    <>
      <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <div className="label mb-1.5 px-2.5">{s.label}</div>
            <div className="space-y-0.5">
              {s.items.map((it) =>
                isGroup(it) ? <GroupItem key={it.label} group={it} path={path} /> : <LeafLink key={it.href} item={it} path={path} />,
              )}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-4 space-y-0.5 border-t border-line pt-3">
        {FOOTER.map((f) => (
          <LeafLink key={f.href} item={f} path={path} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5 border-t border-line px-1 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-[11px] font-semibold text-accent">
          {user ? initials(user) : "··"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-zinc-200" title={user ?? undefined}>
            {user ? user.split("@")[0] : "—"}
          </div>
          <div className="truncate text-[11px] text-faint">{user?.includes("@") ? user.split("@")[1] : "conectado"}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sair"
          aria-label="Sair"
          className="rounded-md p-1.5 text-faint transition hover:bg-panel hover:text-zinc-100"
        >
          <Icon d={I.logout} />
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const path = usePathname();
  const user = useUser();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  if (path.startsWith("/login")) return null;
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  const current =
    [...SECTIONS.flatMap((s) => s.items.flatMap((i) => (isGroup(i) ? i.children : [i]))), ...FOOTER].find((l) => isOn(l.href, path))
      ?.label ?? "";

  const brand = (
    <div className="text-[15px] font-semibold tracking-tight">
      native<span className="text-accent">traffic</span>
    </div>
  );

  return (
    <>
      {/* Phone: top bar + slide-in drawer with the same tree */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-[#0c0d10] px-4 py-2.5 md:hidden">
        <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menu" className="-ml-1.5 rounded-md p-1.5 text-zinc-300 hover:bg-panel">
          <Icon d={I.menu} size={20} />
        </button>
        {brand}
        <span className="ml-auto truncate text-sm text-muted">{current}</span>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-[#0c0d10] px-3 py-4">
            <div className="mb-5 flex items-center justify-between px-2">
              {brand}
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Fechar menu"
                className="rounded-md p-1.5 text-faint hover:bg-panel hover:text-zinc-100"
              >
                <Icon d={I.close} size={18} />
              </button>
            </div>
            <NavBody path={path} user={user} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-[#0c0d10] px-3 py-5 md:flex">
        <div className="mb-6 px-2.5">
          {brand}
          <div className="label mt-0.5">operational</div>
        </div>
        <NavBody path={path} user={user} onLogout={logout} />
      </aside>
    </>
  );
}
