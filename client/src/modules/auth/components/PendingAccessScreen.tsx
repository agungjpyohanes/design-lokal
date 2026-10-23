import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./AuthScreen";

export function PendingAccessScreen({
  user,
  onLogout,
}: {
  user: { name?: string | null; email?: string | null };
  onLogout: () => void;
}) {
  return (
    <main className="pending-access">
      <div className="pending-card">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <strong>DESAIN LOKAL</strong>
            <span>ACCESS CONTROL</span>
          </div>
        </div>
        <div className="pending-icon">
          <Users size={24} />
        </div>
        <p className="eyebrow">AKSES BELUM DIATUR</p>
        <h1>Halo, {user.name || "pengguna"}.</h1>
        <p className="muted">
          Akun Anda sudah masuk, tetapi belum ditautkan ke role operasional. Minta Admin aplikasi
          memberi akses yang sesuai.
        </p>
        <div className="pending-account">
          {user.email || user.name || "Akun Manus"}
          <span>Menunggu penetapan role</span>
        </div>
        <Button variant="outline" onClick={onLogout}>
          Keluar
        </Button>
      </div>
    </main>
  );
}
