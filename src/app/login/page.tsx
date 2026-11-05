"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const next = useSearchParams().get("next") || "/";
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setBusy(false);
    if (r.ok) window.location.href = next.startsWith("/") ? next : "/";
    else setError((await r.json()).error ?? "Erro ao entrar");
  }

  return (
    <form onSubmit={submit} className="card card-pad w-full max-w-sm space-y-4">
      <div>
        <div className="text-lg font-semibold tracking-tight">
          native<span className="text-accent">traffic</span>
        </div>
        <p className="mt-1 text-sm text-muted">Entre para ver o painel.</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs text-zinc-300">E-mail</span>
        <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs text-zinc-300">Senha</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</div>}
      <button disabled={busy} className="btn-primary w-full justify-center">
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
