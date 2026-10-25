import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { canAccess, type SectionKey } from "./access";
import type { AppUser } from "./types";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  isOwner: boolean;
  can: (section: SectionKey) => boolean;
  login: (userId: number, pin?: string | null) => Promise<AppUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "tuorden_user_id";

function storedUserId(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function clearStoredUserId() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function clearStoredSession() {
  clearStoredUserId();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(() => storedUserId() !== null);

  useEffect(() => {
    const id = storedUserId();
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .getSessionUser(id)
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredUserId();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (userId: number, pin?: string | null) => {
    const authenticated = await api.loginUser(userId, pin ?? null);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(authenticated.id));
    } catch {}
    setUser(authenticated);
    return authenticated;
  }, []);

  const logout = useCallback(() => {
    clearStoredUserId();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const id = user?.id ?? storedUserId();
    if (!id) return;
    try {
      const restored = await api.getSessionUser(id);
      setUser(restored);
    } catch {
      clearStoredUserId();
      setUser(null);
    }
  }, [user?.id]);

  const can = useCallback(
    (section: SectionKey) => (user ? canAccess(user, section) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isOwner: user?.isOwner ?? false,
      can,
      login,
      logout,
      refresh,
    }),
    [user, loading, can, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
