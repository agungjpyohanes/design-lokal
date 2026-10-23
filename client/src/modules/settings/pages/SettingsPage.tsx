import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users, UserRoundCog } from "lucide-react";
import { APP_ROLE_LABELS, APP_ROLE_VALUES } from "@shared/workflow";
import { EmptyState, PageTitle } from "@/modules/common/components/WorkflowUI";

const roleOptions = APP_ROLE_VALUES;

export function SettingsPage() {
  const utils = trpc.useUtils();
  const users = trpc.workflow.settings.users.useQuery();
  const slots = trpc.workflow.settings.designerSlots.useQuery();
  const slaRules = trpc.workflow.settings.slaRules.useQuery();
  const assignRole = trpc.workflow.settings.assignRole.useMutation({
    onSuccess: async () => {
      toast.success("Role diperbarui.");
      await utils.workflow.settings.users.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });
  const updateSlot = trpc.workflow.settings.updateDesignerSlot.useMutation({
    onSuccess: async () => {
      toast.success("Slot Designer diperbarui.");
      await utils.workflow.settings.designerSlots.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });
  const updateSla = trpc.workflow.settings.updateSlaRules.useMutation({
    onSuccess: async () => {
      toast.success("Target SLA diperbarui.");
      await utils.workflow.settings.slaRules.invalidate();
      await utils.workflow.tickets.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });
  const [slotDrafts, setSlotDrafts] = useState<
    Record<number, { displayName: string; userId: string; active: boolean }>
  >({});
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});

  const saveSlot = async (slot: NonNullable<typeof slots.data>[number]) => {
    const draft = slotDrafts[slot.slotNumber];
    if (!draft) return;
    try {
      await updateSlot.mutateAsync({
        slotNumber: slot.slotNumber,
        displayName: draft.displayName,
        userId: draft.userId ? Number(draft.userId) : null,
        isActive: draft.active,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slot gagal diperbarui.");
    }
  };

  const getDraft = (slot: NonNullable<typeof slots.data>[number]) =>
    slotDrafts[slot.slotNumber] || {
      displayName: slot.displayName || "",
      userId: slot.userId ? String(slot.userId) : "",
      active: slot.isActive,
    };

  const saveSlaRules = async () => {
    try {
      await updateSla.mutateAsync(
        (slaRules.data || []).map((rule) => ({
          processStatus: rule.processStatus,
          maxHours: Number(slaDrafts[rule.processStatus] || rule.maxHours),
        }))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SLA gagal diperbarui.");
    }
  };

  return (
    <>
      <PageTitle
        kicker="ACCESS / CONFIGURATION"
        title="Pengaturan akses"
        subtitle="Petakan akun yang sudah masuk, role kerja, dan nama asli untuk placeholder Designer 1–8."
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">
                <Users size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Role pengguna
              </div>
              <div className="panel-subtitle">
                Akun muncul setelah pengguna masuk sekali dengan Manus OAuth.
              </div>
            </div>
            <span className="section-kicker">{users.data?.length || 0} AKUN</span>
          </div>
          {users.isLoading ? (
            <div className="loading-block">Memuat pengguna…</div>
          ) : users.data?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pengguna</th>
                    <th>Role aplikasi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <span className="cell-main">{user.name || "Nama belum tersedia"}</span>
                        <span className="cell-sub">{user.email || `Akun #${user.id}`}</span>
                      </td>
                      <td>
                        <select
                          className="select-input"
                          style={{ minWidth: 140 }}
                          value={user.appRole}
                          disabled={assignRole.isPending}
                          onChange={(event) =>
                            assignRole.mutate({
                              userId: user.id,
                              appRole: event.target.value as (typeof roleOptions)[number],
                            })
                          }
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {APP_ROLE_LABELS[role] || role}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Belum ada akun yang masuk"
              detail="Setelah pengguna melakukan login Manus pertama kali, akun akan muncul di sini untuk diberi role."
              icon={<UserRoundCog size={21} />}
            />
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">
                <UserRoundCog size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Slot Designer
              </div>
              <div className="panel-subtitle">
                Nama dan akun dipetakan; penomoran slot tetap stabil di riwayat.
              </div>
            </div>
            <span className="section-kicker">01—08</span>
          </div>
          {slots.isLoading ? (
            <div className="loading-block">Memuat slot…</div>
          ) : (
            <div className="panel-body">
              {(slots.data || []).map((slot) => {
                const draft = getDraft(slot);
                return (
                  <div className="settings-slot" key={slot.id}>
                    <span className="slot-number">
                      {String(slot.slotNumber).padStart(2, "0")}
                    </span>
                    <div className="slot-fields">
                      <input
                        className="text-input"
                        value={draft.displayName}
                        onChange={(event) =>
                          setSlotDrafts((prev) => ({
                            ...prev,
                            [slot.slotNumber]: { ...draft, displayName: event.target.value },
                          }))
                        }
                        placeholder={slot.label}
                        aria-label={`Nama untuk ${slot.label}`}
                      />
                      <select
                        className="select-input"
                        value={draft.userId}
                        onChange={(event) =>
                          setSlotDrafts((prev) => ({
                            ...prev,
                            [slot.slotNumber]: { ...draft, userId: event.target.value },
                          }))
                        }
                        aria-label={`Akun untuk ${slot.label}`}
                      >
                        <option value="">Belum ditautkan ke akun</option>
                        {(users.data || [])
                          .filter((user) => ["designer", "unassigned"].includes(user.appRole))
                          .map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name || user.email || `Akun #${user.id}`}
                            </option>
                          ))}
                      </select>
                      <select
                        className="select-input"
                        value={draft.active ? "yes" : "no"}
                        onChange={(event) =>
                          setSlotDrafts((prev) => ({
                            ...prev,
                            [slot.slotNumber]: { ...draft, active: event.target.value === "yes" },
                          }))
                        }
                        aria-label={`Status ${slot.label}`}
                      >
                        <option value="yes">Aktif untuk penugasan</option>
                        <option value="no">Nonaktif</option>
                      </select>
                      <button
                        className="button-primary button-small"
                        onClick={() => saveSlot(slot)}
                        disabled={updateSlot.isPending}
                      >
                        Simpan slot
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <div className="panel-title">
              <ShieldCheck size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Target SLA
            </div>
            <div className="panel-subtitle">
              Atur batas jam kalender untuk review dan setiap gerbang proses.
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div className="sla-settings-grid">
            {(slaRules.data || []).map((rule) => (
              <label className="form-field" key={rule.processStatus}>
                <span>{rule.label}</span>
                <span className="sla-setting-input">
                  <input
                    className="text-input"
                    type="number"
                    min="1"
                    max="720"
                    value={slaDrafts[rule.processStatus] ?? String(rule.maxHours)}
                    onChange={(event) =>
                      setSlaDrafts((previous) => ({
                        ...previous,
                        [rule.processStatus]: event.target.value,
                      }))
                    }
                  />
                  <small>jam</small>
                </span>
              </label>
            ))}
          </div>
          <div className="modal-actions" style={{ padding: "14px 0 0" }}>
            <button
              className="button-primary button-small"
              onClick={saveSlaRules}
              disabled={updateSla.isPending}
            >
              {updateSla.isPending ? "Menyimpan…" : "Simpan target SLA"}
            </button>
          </div>
        </div>
      </section>

      <section
        className="detail-card"
        style={{ marginTop: 14, background: "#e7eee8", borderColor: "#d8e3d8" }}
      >
        <p className="eyebrow">
          <ShieldCheck size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          CONTROL NOTE
        </p>
        <p style={{ margin: 0 }}>
          Penetapan role membuka akses aplikasi. Role Administrator aplikasi berbeda dari Admin
          operasional dan tidak menggantikan keputusan Owner/SPV/QC. Slot yang tidak ditautkan
          tetap terlihat sebagai placeholder, tetapi Designer harus ditautkan ke akun agar dapat
          memperbarui Job Status.
        </p>
      </section>
    </>
  );
}

export default SettingsPage;
