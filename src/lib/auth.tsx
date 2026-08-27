import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Role = "gerente" | "dependiente";

interface AuthContextValue {
  role: Role | null;
  isGerente: boolean;
  isDependiente: boolean;
  loginGerente: (pin: string) => Promise<boolean>;
  loginDependiente: () => void;
  logout: () => void;
  switchToDependiente: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "tuorden_role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(() => {
    try {
      const v = sessionStorage.getItem(STORAGE_KEY) as Role | null;
      if (v === "gerente" || v === "dependiente") return v;
    } catch {}
    return null;
  });

  const persist = useCallback((r: Role | null) => {
    setRole(r);
    try {
      if (r) sessionStorage.setItem(STORAGE_KEY, r);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // Sync across tabs? not needed but listen to storage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const v = e.newValue as Role | null;
        if (v === "gerente" || v === "dependiente") setRole(v);
        else if (e.newValue === null) setRole(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loginGerente = useCallback(async (pin: string) => {
    const ok = await api.verifyManagerPin(pin);
    if (ok) persist("gerente");
    return ok;
  }, [persist]);

  const loginDependiente = useCallback(() => {
    persist("dependiente");
  }, [persist]);

  const logout = useCallback(() => {
    persist(null);
  }, [persist]);

  const switchToDependiente = useCallback(() => {
    persist("dependiente");
  }, [persist]);

  return (
    <AuthContext.Provider
      value={{
        role,
        isGerente: role === "gerente",
        isDependiente: role === "dependiente",
        loginGerente,
        loginDependiente,
        logout,
        switchToDependiente,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
