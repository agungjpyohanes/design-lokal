import { useAuth, DEFAULT_CLIENT_USER, type DemoUser } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/modules/auth";
import { APP_ROLE_LABELS, type AppRole } from "@shared/workflow";
import { trpc } from "@/lib/trpc";
import { CalendarCheck, ClipboardList, Gauge, Kanban, Menu, ShieldCheck, Sparkles, Ticket, Users, UserCheck, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";

const DEMO_PERSONAS: DemoUser[] = [
  DEFAULT_CLIENT_USER,
  {
    id: 2,
    openId: "demo-spv-002",
    name: "Budi Santoso (Supervisor)",
    email: "budi.spv@desainlokal.id",
    loginMethod: "demo",
    appRole: "spv",
    isSuperAdmin: false,
  },
  {
    id: 3,
    openId: "demo-designer-003",
    name: "Cindy Permata (Senior Designer)",
    email: "cindy.designer@desainlokal.id",
    loginMethod: "demo",
    appRole: "designer",
    isSuperAdmin: false,
  },
  {
    id: 5,
    openId: "demo-mkt-005",
    name: "Eka Rahmawati (Marketing Lead)",
    email: "eka.marketing@desainlokal.id",
    loginMethod: "demo",
    appRole: "marketing",
    isSuperAdmin: false,
  },
  {
    id: 6,
    openId: "demo-qc-006",
    name: "Fajar Nugraha (QC Specialist)",
    email: "fajar.qc@desainlokal.id",
    loginMethod: "demo",
    appRole: "qc1",
    isSuperAdmin: false,
  },
  {
    id: 7,
    openId: "demo-owner-007",
    name: "Gilang Prakoso (Owner)",
    email: "gilang.owner@desainlokal.id",
    loginMethod: "demo",
    appRole: "owner",
    isSuperAdmin: false,
  },
];

const navItems = [
  {
    href: "/",
    title: "Ringkasan",
    icon: Gauge,
    roles: [
      "admin",
      "superadmin",
      "owner",
      "manager",
      "spv",
      "designer",
      "marketing",
      "mpp",
      "qc1",
      "qc2",
    ],
  },
  {
    href: "/requests",
    title: "Permintaan",
    icon: ClipboardList,
    roles: ["superadmin", "owner", "manager", "spv", "marketing"],
  },
  {
    href: "/tickets",
    title: "Tiket desain",
    icon: Ticket,
    roles: [
      "admin",
      "superadmin",
      "owner",
      "manager",
      "spv",
      "designer",
      "marketing",
      "mpp",
      "qc1",
      "qc2",
    ],
  },
  {
    href: "/monitoringtracking",
    title: "Monitoring Kanban",
    icon: Kanban,
    roles: [
      "admin",
      "superadmin",
      "owner",
      "manager",
      "spv",
      "designer",
      "marketing",
      "mpp",
      "qc1",
      "qc2",
    ],
  },
  {
    href: "/designer",
    title: "Workspace Designer",
    icon: Sparkles,
    roles: ["designer", "superadmin"],
  },
  {
    href: "/qc",
    title: "Quality control",
    icon: ShieldCheck,
    roles: ["spv", "qc1", "qc2", "superadmin"],
  },
  {
    href: "/acc-sessions",
    title: "Sesi ACC Bulanan",
    icon: CalendarCheck,
    roles: ["admin", "superadmin", "owner", "manager", "spv", "marketing"],
  },
  {
    href: "/settings",
    title: "Pengaturan akses",
    icon: Users,
    roles: ["superadmin"],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const [selectedPersonaId, setSelectedPersonaId] = useState<number>(auth.user?.id ?? 1);
  const [location] = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Auto-tutup drawer ketika berpindah rute atau tombol Escape ditekan
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  const user = useMemo(() => {
    return DEMO_PERSONAS.find((p) => p.id === selectedPersonaId) || auth.user || DEFAULT_CLIENT_USER;
  }, [selectedPersonaId, auth.user]);

  const handleSwitchPersona = (newId: number) => {
    setSelectedPersonaId(newId);
    const persona = DEMO_PERSONAS.find((p) => p.id === newId);
    if (persona) {
      utils.auth.me.setData(undefined, persona as any);
    }
  };

  const menu = useMemo(
    () => navItems.filter((item) => user && (user.appRole === "superadmin" || item.roles.includes(user.appRole))),
    [user]
  );

  const active =
    navItems.find((item) => item.href === location) ??
    navItems.find((item) => location.startsWith(item.href) && item.href !== "/");

  const initials = (user.name || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="app-frame">
      {/* Backdrop overlay untuk mobile drawer */}
      {isMobileNavOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop Sticky / Mobile Collapsible Drawer) */}
      <aside className={`sidebar ${isMobileNavOpen ? "open" : ""}`}>
        <div className="sidebar-top-bar">
          <Link href="/" className="brand-lockup" onClick={() => setIsMobileNavOpen(false)}>
            <BrandMark />
            <div>
              <strong>DESAIN LOKAL</strong>
              <span>WORKFLOW DESK</span>
            </div>
          </Link>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Tutup navigasi"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Navigasi utama">
          {menu.map((item) => {
            const Icon = item.icon;
            const selected =
              item.href === "/"
                ? location === "/"
                : location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${selected ? "active" : ""}`}
                aria-current={selected ? "page" : undefined}
                onClick={() => setIsMobileNavOpen(false)}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.title}</span>
                {selected && <span className="nav-active-dot" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-pulse" />
            <div>
              <strong>DEMO MODE AKTIF</strong>
              <small>Bypass Auth & Mock Data</small>
            </div>
          </div>

          <div style={{ padding: "8px 12px", background: "rgba(0,0,0,0.03)", borderRadius: "8px", border: "1px dashed var(--line, #e2e8f0)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground, #64748b)", marginBottom: "6px" }}>
              <UserCheck size={13} />
              <span>GANTI PERAN PENGUJIAN</span>
            </div>
            <select
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: "6px",
                border: "1px solid var(--border, #cbd5e1)",
                background: "var(--background, #ffffff)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--foreground, #0f172a)",
                outline: "none",
                cursor: "pointer",
              }}
              value={user.id}
              onChange={(e) => {
                handleSwitchPersona(Number(e.target.value));
                setIsMobileNavOpen(false);
              }}
            >
              {DEMO_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({APP_ROLE_LABELS[p.appRole as AppRole] || p.appRole})
                </option>
              ))}
            </select>
          </div>

          <div className="profile-row" title="Info Akun Demo Aktif">
            <span className="avatar">{initials}</span>
            <span className="profile-text">
              <strong>{user.name || "Pengguna"}</strong>
              <small>{APP_ROLE_LABELS[user.appRole as AppRole] || user.appRole}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="hamburger-button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Buka navigasi menu"
            >
              <Menu size={18} />
            </button>
            <span className="topbar-overline">DESIGN OPERATIONS</span>
            <span className="topbar-slash">/</span>
            <strong>{active?.title || "Detail tiket"}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-mark" style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}>
              LIVE DEMO READY
            </span>
            <span className="today-mark date-badge">
              LOCAL /{" "}
              {new Date()
                .toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                .toUpperCase()}
            </span>
            <span className="topbar-user">{user.name || "Pengguna"}</span>
            <span className="avatar avatar-small">{initials}</span>
          </div>
        </header>
        <div className="page-container">{children}</div>
        <footer className="app-footer">
          <span>
            DESAIN LOKAL <b>•</b> PRODUCTION CONTROL (DEMO MODE)
          </span>
          <span>INTERNAL WORKSPACE / V1</span>
        </footer>
      </main>
    </div>
  );
}
