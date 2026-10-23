import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AuthScreen({
  onLoginSuccess,
}: {
  onLoginSuccess: () => Promise<unknown> | unknown;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const localLogin = trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      setPassword("");
      setLoginError("");
      await onLoginSuccess();
    },
    onError: (error) => {
      setLoginError(
        error.message.includes("15 menit")
          ? error.message
          : "Username atau password tidak valid."
      );
    },
  });

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <strong>DESAIN LOKAL</strong>
            <span>OPERATIONS / 01</span>
          </div>
        </div>
        <p className="eyebrow">WORKFLOW CONTROL</p>
        <h1>
          Semua tiket,
          <br />
          <em>satu jalur kerja.</em>
        </h1>
        <p className="muted">
          Masuk dengan akun Manus atau akun lokal yang diberikan Admin aplikasi.
        </p>
        <Button className="primary-button auth-button" onClick={() => startLogin()}>
          Masuk dengan Manus
        </Button>
        <div className="auth-divider">
          <span>ATAU LOGIN LOKAL</span>
        </div>
        <form
          className="local-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            setLoginError("");
            localLogin.mutate({ username, password });
          }}
        >
          <label className="form-field">
            <span>Nama pengguna</span>
            <input
              className="text-input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Kata sandi</span>
            <input
              className="text-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {loginError && (
            <div className="form-error" role="alert">
              {loginError}
            </div>
          )}
          <Button
            className="button-primary auth-button"
            type="submit"
            disabled={localLogin.isPending}
          >
            {localLogin.isPending ? "Memeriksa…" : "Masuk dengan akun lokal"}
          </Button>
        </form>
        <div className="auth-foot">
          <span>AKSES INTERNAL</span>
          <span>DESIGN / QC / ARCHIVE</span>
        </div>
      </section>
      <aside className="auth-aside">
        <div className="route-art">
          <div className="route-line" />
          <span className="route-node node-one">
            01
            <br />
            <small>REQUEST</small>
          </span>
          <span className="route-node node-two">
            02
            <br />
            <small>DESIGN</small>
          </span>
          <span className="route-node node-three">
            03
            <br />
            <small>QC</small>
          </span>
          <span className="route-node node-four">
            04
            <br />
            <small>READY</small>
          </span>
        </div>
        <div className="aside-note">
          <span>LOCAL DESIGN FLOW</span>
          <strong>
            From first brief
            <br />
            to production-ready.
          </strong>
        </div>
      </aside>
    </main>
  );
}
