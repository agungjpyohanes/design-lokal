import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { APP_ROLE_LABELS } from "@shared/workflow";
import { ClipboardList, Gauge, LogOut, Settings2, ShieldCheck, Sparkles, Ticket, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

const navItems = [
  { href: "/", title: "Ringkasan", icon: Gauge, roles: ["admin", "superadmin", "owner", "manager", "spv", "designer", "marketing", "mpp", "qc1", "qc2"] },
  { href: "/requests", title: "Permintaan", icon: ClipboardList, roles: ["superadmin", "owner", "manager", "spv", "marketing"] },
  { href: "/tickets", title: "Tiket desain", icon: Ticket, roles: ["admin", "superadmin", "owner", "manager", "spv", "designer", "marketing", "mpp", "qc1", "qc2"] },
  { href: "/designer", title: "Workspace Designer", icon: Sparkles, roles: ["designer"] },
  { href: "/qc", title: "Quality control", icon: ShieldCheck, roles: ["spv", "qc1", "qc2"] },
  { href: "/settings", title: "Pengaturan akses", icon: Users, roles: ["superadmin"] },
];

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { user, loading, logout } = auth;
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const localLogin = trpc.auth.localLogin.useMutation({ onSuccess: async () => { setPassword(""); setLoginError(""); await auth.refresh(); }, onError: error => setLoginError(error.message.includes("15 menit") ? error.message : "Username atau password tidak valid.") });
  const [location] = useLocation();
  const menu = useMemo(() => navItems.filter(item => user && item.roles.includes(user.appRole)), [user]);

  if (loading) return <div className="boot-screen"><div className="boot-mark"><Mark /></div><p>Memuat ruang kerja…</p></div>;
  if (!user) {
    return <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-lockup"><Mark /><div><strong>DESAIN LOKAL</strong><span>OPERATIONS / 01</span></div></div>
        <p className="eyebrow">WORKFLOW CONTROL</p>
        <h1>Semua tiket,<br /><em>satu jalur kerja.</em></h1>
        <p className="muted">Masuk dengan akun Manus atau akun lokal yang diberikan Admin aplikasi.</p>
        <Button className="primary-button auth-button" onClick={() => startLogin()}>Masuk dengan Manus</Button>
        <div className="auth-divider"><span>ATAU LOGIN LOKAL</span></div>
        <form className="local-login-form" onSubmit={event => { event.preventDefault(); setLoginError(""); localLogin.mutate({ username, password }); }}>
          <label className="form-field"><span>Nama pengguna</span><input className="text-input" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label className="form-field"><span>Kata sandi</span><input className="text-input" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          {loginError && <div className="form-error" role="alert">{loginError}</div>}
          <Button className="button-primary auth-button" type="submit" disabled={localLogin.isPending}>{localLogin.isPending ? "Memeriksa…" : "Masuk dengan akun lokal"}</Button>
        </form>
        <div className="auth-foot"><span>AKSES INTERNAL</span><span>DESIGN / QC / ARCHIVE</span></div>
      </section>
      <aside className="auth-aside"><div className="route-art"><div className="route-line" /><span className="route-node node-one">01<br /><small>REQUEST</small></span><span className="route-node node-two">02<br /><small>DESIGN</small></span><span className="route-node node-three">03<br /><small>QC</small></span><span className="route-node node-four">04<br /><small>READY</small></span></div><div className="aside-note"><span>LOCAL DESIGN FLOW</span><strong>From first brief<br />to production-ready.</strong></div></aside>
    </main>;
  }

  if (user.appRole === "unassigned") {
    return <main className="pending-access"><div className="pending-card"><div className="brand-lockup"><Mark /><div><strong>DESAIN LOKAL</strong><span>ACCESS CONTROL</span></div></div><div className="pending-icon"><Users size={24} /></div><p className="eyebrow">AKSES BELUM DIATUR</p><h1>Halo, {user.name || "pengguna"}.</h1><p className="muted">Akun Anda sudah masuk, tetapi belum ditautkan ke role operasional. Minta Admin aplikasi memberi akses yang sesuai.</p><div className="pending-account">{user.email || user.name || "Akun Manus"}<span>Menunggu penetapan role</span></div><Button variant="outline" onClick={() => logout()}>Keluar</Button></div></main>;
  }

  const active = navItems.find(item => item.href === location) ?? navItems.find(item => location.startsWith(item.href) && item.href !== "/");
  const initials = (user.name || "U").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand-lockup"><Mark /><div><strong>DESAIN LOKAL</strong><span>WORKFLOW DESK</span></div></Link>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        {menu.map(item => {
          const Icon = item.icon;
          const selected = item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`);
          return <Link key={item.href} href={item.href} className={`nav-item ${selected ? "active" : ""}`} aria-current={selected ? "page" : undefined}><Icon size={17} strokeWidth={1.8} /><span>{item.title}</span>{selected && <span className="nav-active-dot" />}</Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-status"><span className="status-pulse" /><div><strong>WORKFLOW AKTIF</strong><small>Tracker • QC • Archive</small></div></div>
        <button className="profile-row" onClick={() => logout()} title="Keluar dari aplikasi"><span className="avatar">{initials}</span><span className="profile-text"><strong>{user.name || "Pengguna"}</strong><small>{APP_ROLE_LABELS[user.appRole] || user.appRole}</small></span><LogOut size={16} className="logout-icon" /></button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><span className="topbar-overline">DESIGN OPERATIONS</span><span className="topbar-slash">/</span><strong>{active?.title || "Detail tiket"}</strong></div><div className="topbar-right"><span className="today-mark">LOCAL / {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span><span className="topbar-user">{user.name || "Pengguna"}</span><span className="avatar avatar-small">{initials}</span></div></header>
      <div className="page-container">{children}</div>
      <footer className="app-footer"><span>DESAIN LOKAL <b>•</b> PRODUCTION CONTROL</span><span>INTERNAL WORKSPACE / V1</span></footer>
    </main>
  </div>;
}
