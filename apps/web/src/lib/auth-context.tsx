'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, bootstrapToken, setAccessToken } from './api';
import type { UserDTO, WorkspaceDTO } from './types';

const WS_KEY = 'pulse.workspace_id';

interface AuthContextValue {
  user: UserDTO | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceDTO[];
  workspace: WorkspaceDTO | null;
  memberRole: string | null;
  setWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);
const WsCtx = createContext<WorkspaceContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(WsCtx);
  if (!v) throw new Error('useWorkspace outside provider');
  return v;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await api<WorkspaceDTO[]>('/workspaces');
      setWorkspaces(list);
      const current =
        (typeof window !== 'undefined' ? localStorage.getItem(WS_KEY) : null) ?? list[0]?.id ?? null;
      if (current && list.some((w) => w.id === current)) {
        setWorkspaceIdState(current);
      } else {
        setWorkspaceIdState(list[0]?.id ?? null);
      }
    } catch {
      /* keep whatever we had */
    }
  }, []);

  useEffect(() => {
    bootstrapToken();
    if (!getToken()) {
      setReady(true);
      return;
    }
    api<UserDTO>('/auth/me', { public: true })
      .then((me) => {
        setUser(me);
        return refreshWorkspaces();
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          setAccessToken(null);
        }
      })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ user: UserDTO; accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        public: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await refreshWorkspaces();
      router.push('/app');
    },
    [refreshWorkspaces, router],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await api<{ user: UserDTO; accessToken: string }>('/auth/signup', {
        method: 'POST',
        body: { name, email, password },
        public: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await refreshWorkspaces();
      router.push('/app');
    },
    [refreshWorkspaces, router],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const setWorkspaceId = useCallback((id: string) => {
    setWorkspaceIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(WS_KEY, id);
  }, []);

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  const memberRole = useMemo(() => {
    // The role of the current user in the current workspace is not returned
    // by the workspaces endpoint; it is resolved per-scoped call. We expose
    // it as null and let each page derive it from the members API where needed.
    return null;
  }, []);

  const authValue = useMemo(
    () => ({ user, ready, login, signup, logout }),
    [user, ready, login, signup, logout],
  );
  const wsValue = useMemo(
    () => ({ workspaces, workspace, memberRole, setWorkspaceId, refreshWorkspaces }),
    [workspaces, workspace, memberRole, setWorkspaceId, refreshWorkspaces],
  );

  return (
    <AuthCtx.Provider value={authValue}>
      <WsCtx.Provider value={wsValue}>{children}</WsCtx.Provider>
    </AuthCtx.Provider>
  );
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pulse.access_token');
}
