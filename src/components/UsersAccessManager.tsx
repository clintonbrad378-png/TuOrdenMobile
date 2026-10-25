import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVEL_OPTIONS,
  ASSIGNABLE_SECTIONS,
  SECTION_BY_KEY,
  detectAccessLevel,
  permissionsForLevel,
  type SectionKey,
} from "../lib/access";
import { errMsg } from "../lib/format";
import type { AccessLevel, AppUser } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  cn,
  useToast,
} from "./ui";

interface FormState {
  name: string;
  accessLevel: AccessLevel;
  pin: string;
  confirmPin: string;
  removePin: boolean;
  permissions: string[];
}

const DEFAULT_FORM: FormState = {
  name: "",
  accessLevel: "dependiente",
  pin: "",
  confirmPin: "",
  removePin: false,
  permissions: permissionsForLevel("dependiente"),
};

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function UsersAccessManager() {
  const { user } = useAuth();
  const actorId = user?.isOwner ? user.id : null;
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!actorId) return;
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.listUsers(actorId));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => Array.from(new Set(ASSIGNABLE_SECTIONS.map((section) => section.group))),
    [],
  );

  if (!actorId) return null;

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setShowPins(false);
    setModalOpen(true);
  };

  const openEdit = (target: AppUser) => {
    const level = detectAccessLevel(target.permissions) as AccessLevel;
    setEditing(target);
    setForm({
      name: target.name,
      accessLevel: level,
      pin: "",
      confirmPin: "",
      removePin: false,
      permissions: target.permissions.filter((section) =>
        ASSIGNABLE_SECTIONS.some((candidate) => candidate.key === section),
      ),
    });
    setFormError(null);
    setShowPins(false);
    setModalOpen(true);
  };

  const handleLevelChange = (level: AccessLevel) => {
    setForm((current) => ({
      ...current,
      accessLevel: level,
      permissions:
        level === "personalizado"
          ? current.permissions
          : permissionsForLevel(level),
    }));
  };

  const togglePermission = (section: SectionKey) => {
    setForm((current) => {
      const permissions = current.permissions.includes(section)
        ? current.permissions.filter((candidate) => candidate !== section)
        : [...current.permissions, section];
      return {
        ...current,
        permissions,
        accessLevel: detectAccessLevel(permissions),
      };
    });
    if (formError) setFormError(null);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("Escribe el nombre del usuario");
      return;
    }
    if (form.permissions.length === 0) {
      setFormError("Selecciona al menos una sección");
      return;
    }

    const pin = form.pin.trim();
    if (pin) {
      if (pin.length < 4 || pin.length > 12 || !/^\d+$/.test(pin)) {
        setFormError("El PIN debe tener entre 4 y 12 dígitos numéricos");
        return;
      }
      if (pin !== form.confirmPin.trim()) {
        setFormError("El PIN y la confirmación no coinciden");
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.updateUser(actorId, editing.id, {
          name,
          accessLevel: form.accessLevel,
          pin: pin || null,
          removePin: !pin && form.removePin,
          permissions: form.permissions,
          active: editing.active,
        });
        toast("success", "Usuario actualizado");
      } else {
        await api.createUser(actorId, {
          name,
          accessLevel: form.accessLevel,
          pin: pin || null,
          permissions: form.permissions,
        });
        toast("success", "Usuario creado");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (target: AppUser) => {
    setTogglingId(target.id);
    try {
      await api.setUserActive(actorId, target.id, !target.active);
      await load();
      toast("success", target.active ? "Usuario desactivado" : "Usuario activado");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUser(actorId, deleteTarget.id);
      setDeleteTarget(null);
      await load();
      toast("success", "Usuario eliminado");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Users size={16} className="text-accent-400" />
              Usuarios y permisos
            </h2>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-zinc-500">
              Crea usuarios y elige a qué secciones puede entrar cada uno. El propietario siempre
              tiene acceso total; los demás solo a lo que marques aquí.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <UserPlus size={14} />
            Nuevo usuario
          </Button>
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-300">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid h-28 place-items-center">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500">No hay usuarios. Crea el primero.</p>
        ) : (
          <div className="mt-4">
            {users.map((account) => {
              const level = account.isOwner
                ? "Propietario"
                : (ACCESS_LEVEL_LABELS[account.accessLevel] ?? "Personalizado");
              const permissionSummary = account.isOwner
                ? "Acceso total a todas las secciones"
                : account.permissions
                    .map((section) => SECTION_BY_KEY[section as SectionKey]?.label)
                    .filter(Boolean)
                    .join(", ") || "Sin secciones";
              return (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] py-3 last:border-0"
                >
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-semibold",
                      account.isOwner
                        ? "bg-accent-500/15 text-accent-400"
                        : "bg-white/[0.06] text-zinc-400",
                    )}
                  >
                    {initials(account.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-zinc-200">{account.name}</span>
                      <Badge tone={account.isOwner ? "accent" : "zinc"}>
                        {account.isOwner && <ShieldCheck size={10} />}
                        {level}
                      </Badge>
                      {!account.isOwner && !account.hasPin && <Badge tone="warn">Sin PIN</Badge>}
                      {!account.active && <Badge tone="danger">Inactivo</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                      {permissionSummary}
                    </p>
                  </div>
                  {!account.isOwner && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Editar"
                        onClick={() => openEdit(account)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={account.active ? "Desactivar" : "Activar"}
                        loading={togglingId === account.id}
                        onClick={() => void handleToggleActive(account)}
                      >
                        {account.active ? <PowerOff size={14} /> : <Power size={14} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Eliminar"
                        onClick={() => setDeleteTarget(account)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Los cambios de permisos aplican la próxima vez que el usuario inicie sesión. Configuración
            y Licencia quedan reservadas al propietario.
          </p>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editing ? "Editar usuario" : "Nuevo usuario"}
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {editing ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </>
        }
      >
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(e) => {
              setForm((current) => ({ ...current, name: e.target.value }));
              if (formError) setFormError(null);
            }}
            placeholder="Ej. Ana, Mostrador, Cocina"
            autoFocus
          />
        </Field>

        <Field label="Nivel de acceso" hint={editing ? "Puedes ajustar las secciones después." : undefined}>
          <Select
            value={form.accessLevel}
            onChange={(e) => handleLevelChange(e.target.value as AccessLevel)}
          >
            {ACCESS_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-zinc-400">
              Secciones autorizadas
            </span>
            <span className="text-[11px] text-zinc-600">
              {form.permissions.length} seleccionada{form.permissions.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                  {group}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ASSIGNABLE_SECTIONS.filter((section) => section.group === group).map(
                    (section) => {
                      const checked = form.permissions.includes(section.key);
                      return (
                        <button
                          key={section.key}
                          type="button"
                          onClick={() => togglePermission(section.key)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                            checked
                              ? "border-accent-500/30 bg-accent-500/[0.07]"
                              : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                              checked
                                ? "border-accent-500 bg-accent-500 text-zinc-950"
                                : "border-white/20 bg-transparent",
                            )}
                          >
                            {checked && <Check size={11} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-zinc-200">
                              {section.label}
                            </span>
                            <span className="block text-[10px] leading-snug text-zinc-500">
                              {section.description}
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-accent-400" />
            <span className="text-xs font-medium text-zinc-300">PIN de acceso</span>
            {editing?.hasPin && !form.removePin && !form.pin && (
              <Badge tone="accent">Configurado</Badge>
            )}
            {editing && !editing.hasPin && <Badge tone="warn">Sin PIN</Badge>}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {editing
              ? "Déjalo vacío para conservar el PIN actual. Si lo cambias, pide el nuevo PIN al usuario."
              : "Opcional. Si lo dejas vacío, el usuario entra con un clic; puedes asignarle PIN después."}
          </p>

          <div className="mt-3 grid gap-2.5">
            <div className="relative">
              <Input
                type={showPins ? "text" : "password"}
                inputMode="numeric"
                placeholder={editing?.hasPin ? "Nuevo PIN (opcional)" : "PIN (opcional)"}
                value={form.pin}
                onChange={(e) => {
                  setForm((current) => ({
                    ...current,
                    pin: e.target.value.replace(/\D/g, "").slice(0, 12),
                    removePin: false,
                  }));
                  if (formError) setFormError(null);
                }}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPins((value) => !value)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              >
                {showPins ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Input
              type={showPins ? "text" : "password"}
              inputMode="numeric"
              placeholder="Confirmar PIN"
              value={form.confirmPin}
              onChange={(e) => {
                setForm((current) => ({
                  ...current,
                  confirmPin: e.target.value.replace(/\D/g, "").slice(0, 12),
                }));
                if (formError) setFormError(null);
              }}
            />
            {editing?.hasPin && (
              <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={form.removePin}
                  onChange={(e) => {
                    setForm((current) => ({
                      ...current,
                      removePin: e.target.checked,
                      pin: e.target.checked ? "" : current.pin,
                      confirmPin: e.target.checked ? "" : current.confirmPin,
                    }));
                  }}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-surface-800 accent-emerald-500"
                />
                Quitar PIN y permitir acceso rápido
              </label>
            )}
          </div>
        </div>

        {formError && <p className="text-xs text-red-400">{formError}</p>}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDelete()}
        loading={deleting}
        danger
        title="Eliminar usuario"
        confirmLabel="Eliminar"
        message={
          <>
            ¿Eliminar a <strong>{deleteTarget?.name}</strong>? Ya no podrá iniciar sesión y se
            borrarán sus permisos. Esta acción no se puede deshacer.
          </>
        }
      />
    </>
  );
}
