import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { localAuthCredentials, users } from "../drizzle/schema";
import { hashLocalPassword, LOCAL_ADMIN_OPEN_ID } from "../server/_core/localPassword";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const password = process.env.DESAINLOKAL_LOCAL_ADMIN_PASSWORD;
  if (!databaseUrl) throw new Error("Database tidak tersedia.");
  if (!password || Array.from(password).length < 14) throw new Error("Secret password admin tidak ada atau kurang panjang; periksa kembali kartu secret." );

  const db = drizzle(databaseUrl);
  try {
    const outcome = await db.transaction(async tx => {
      const [existingCredential] = await tx.select().from(localAuthCredentials).where(eq(localAuthCredentials.username, "admin")).limit(1);
      if (existingCredential) {
        const [existingUser] = await tx.select().from(users).where(eq(users.id, existingCredential.userId)).limit(1);
        if (!existingUser || existingUser.openId !== LOCAL_ADMIN_OPEN_ID || existingUser.email !== null || existingUser.role !== "admin" || existingUser.appRole !== "superadmin") {
          throw new Error("Akun admin lokal yang tersimpan tidak konsisten; tidak ada kredensial yang diubah.");
        }
        return "already_initialized" as const;
      }

      await tx.insert(users).values({
        openId: LOCAL_ADMIN_OPEN_ID,
        name: "Administrator",
        email: null,
        loginMethod: "local_password",
        role: "admin",
        appRole: "superadmin",
      }).onDuplicateKeyUpdate({ set: {
        name: "Administrator",
        email: null,
        loginMethod: "local_password",
        role: "admin",
        appRole: "superadmin",
      } });

      const [user] = await tx.select().from(users).where(eq(users.openId, LOCAL_ADMIN_OPEN_ID)).limit(1);
      if (!user) throw new Error("Akun lokal tidak dapat dibuat.");
      const passwordHash = await hashLocalPassword(password);
      await tx.insert(localAuthCredentials).values({ userId: user.id, username: "admin", passwordHash });
      return "created" as const;
    });
    console.log(outcome === "created" ? "Akun Admin aplikasi lokal berhasil diinisialisasi." : "Akun lokal sudah ada; tidak ada perubahan kredensial.");
  } finally {
    await db.$client.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Bootstrap akun lokal gagal.");
  process.exitCode = 1;
});
