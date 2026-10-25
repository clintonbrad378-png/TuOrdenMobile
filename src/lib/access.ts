import type { AccessLevel, AppUser } from "./types";

export type SectionKey =
  | "dashboard"
  | "venta"
  | "historial"
  | "menu"
  | "produccion"
  | "materiales"
  | "entradas"
  | "mermas"
  | "gastos"
  | "reportes"
  | "sincronizacion"
  | "configuracion"
  | "licencia";

export interface SectionDef {
  key: SectionKey;
  path: string;
  label: string;
  group: string;
  description?: string;
  ownerOnly?: boolean;
}

export const SECTIONS: SectionDef[] = [
  {
    key: "dashboard",
    path: "/",
    label: "Dashboard",
    group: "Operación",
    description: "Resumen del día, ventas y alertas de stock.",
  },
  {
    key: "venta",
    path: "/venta",
    label: "Venta",
    group: "Operación",
    description: "Punto de venta, cobros y créditos.",
  },
  {
    key: "historial",
    path: "/historial",
    label: "Historial",
    group: "Operación",
    description: "Consulta y edición de ventas anteriores.",
  },
  {
    key: "menu",
    path: "/menu",
    label: "Menú",
    group: "Inventario",
    description: "Productos, precios y recetas.",
  },
  {
    key: "produccion",
    path: "/produccion",
    label: "Producción",
    group: "Inventario",
    description: "Elaboración de productos y materiales.",
  },
  {
    key: "materiales",
    path: "/materiales",
    label: "Materiales",
    group: "Inventario",
    description: "Insumos, existencias y costos.",
  },
  {
    key: "entradas",
    path: "/entradas",
    label: "Entradas",
    group: "Inventario",
    description: "Recepción de compras y ajustes de stock.",
  },
  {
    key: "mermas",
    path: "/mermas",
    label: "Mermas",
    group: "Inventario",
    description: "Pérdidas y desperdicios.",
  },
  {
    key: "gastos",
    path: "/gastos",
    label: "Gastos",
    group: "Finanzas",
    description: "Gastos operativos del negocio.",
  },
  {
    key: "reportes",
    path: "/reportes",
    label: "Reportes",
    group: "Finanzas",
    description: "Ganancias, ventas y exportación.",
  },
  {
    key: "sincronizacion",
    path: "/sincronizacion",
    label: "Sincronización",
    group: "Sistema",
    description: "Envío de ventas y recepción del menú.",
  },
  {
    key: "configuracion",
    path: "/configuracion",
    label: "Configuración",
    group: "Sistema",
    description: "Respaldos, usuarios, PIN y licencia.",
    ownerOnly: true,
  },
  {
    key: "licencia",
    path: "/licencia",
    label: "Licencia",
    group: "Sistema",
    description: "Estado de la licencia del equipo.",
    ownerOnly: true,
  },
];

export const ASSIGNABLE_SECTIONS = SECTIONS.filter((section) => !section.ownerOnly);

export const SECTION_BY_KEY: Record<SectionKey, SectionDef> = Object.fromEntries(
  SECTIONS.map((section) => [section.key, section]),
) as Record<SectionKey, SectionDef>;

export const PATH_SECTION: Record<string, SectionKey> = Object.fromEntries(
  SECTIONS.map((section) => [section.path, section.key]),
) as Record<string, SectionKey>;

export const ACCESS_LEVEL_OPTIONS: {
  value: AccessLevel;
  label: string;
  description: string;
  permissions: SectionKey[];
}[] = [
  {
    value: "dependiente",
    label: "Dependiente",
    description: "Vende y sincroniza. Ideal para mostrador.",
    permissions: ["venta", "sincronizacion"],
  },
  {
    value: "inventario",
    label: "Inventario",
    description: "Menú, producción, materiales y mermas.",
    permissions: ["menu", "produccion", "materiales", "entradas", "mermas"],
  },
  {
    value: "finanzas",
    label: "Finanzas",
    description: "Dashboard, gastos y reportes.",
    permissions: ["dashboard", "gastos", "reportes"],
  },
  {
    value: "personalizado",
    label: "Personalizado",
    description: "Elige las secciones manualmente.",
    permissions: [],
  },
];

export const ACCESS_LEVEL_LABELS: Record<string, string> = Object.fromEntries(
  ACCESS_LEVEL_OPTIONS.map((option) => [option.value, option.label]),
);

export function permissionsForLevel(level: string): SectionKey[] {
  return (
    ACCESS_LEVEL_OPTIONS.find((option) => option.value === level)?.permissions ?? []
  );
}

function sameSections(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((section) => set.has(section));
}

export function detectAccessLevel(permissions: string[]): AccessLevel {
  for (const option of ACCESS_LEVEL_OPTIONS) {
    if (option.value === "personalizado") continue;
    if (sameSections(option.permissions, permissions)) {
      return option.value;
    }
  }
  return "personalizado";
}

export function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

export function sectionForPath(pathname: string): SectionKey | undefined {
  return PATH_SECTION[normalizePath(pathname)];
}

export function canAccess(
  user: Pick<AppUser, "isOwner" | "permissions">,
  section: SectionKey,
): boolean {
  if (user.isOwner) return true;
  if (SECTION_BY_KEY[section]?.ownerOnly) return false;
  return user.permissions.includes(section);
}

export function hasAnyAccess(
  user: Pick<AppUser, "isOwner" | "permissions">,
): boolean {
  if (user.isOwner) return true;
  return SECTIONS.some(
    (section) => !section.ownerOnly && user.permissions.includes(section.key),
  );
}

export function firstAllowedPath(
  user: Pick<AppUser, "isOwner" | "permissions">,
): string {
  if (user.isOwner) return "/";
  const first = SECTIONS.find(
    (section) => !section.ownerOnly && user.permissions.includes(section.key),
  );
  return first?.path ?? "/";
}
