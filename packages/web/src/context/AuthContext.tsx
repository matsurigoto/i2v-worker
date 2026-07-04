import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface AuthContextValue {
  username: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((me) => setUsername(me.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(u: string, p: string) {
    const me = await api.login(u, p);
    setUsername(me.username);
  }

  async function logout() {
    await api.logout();
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
