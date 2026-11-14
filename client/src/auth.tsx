import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import type { User } from './types';

export type LoginResult =
  | { status: 'authenticated' }
  | { status: 'two-factor'; challengeToken: string };

export interface RegisterResult {
  email: string;
  devCode?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (
    email: string,
  ) => Promise<{ message: string; devCode?: string }>;
  updateProfile: (
    name: string,
    email: string,
  ) => Promise<{ verificationRequired: boolean }>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api.auth
      .me()
      .then((nextUser) => {
        if (!cancelled) setUser(nextUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const result = await api.auth.login(email, password);

      if (result.requires2fa && result.challengeToken) {
        return {
          status: 'two-factor',
          challengeToken: result.challengeToken,
        };
      }

      if (!result.user) {
        throw new Error('The server returned an unexpected sign-in response.');
      }

      setUser(result.user);
      return { status: 'authenticated' };
    },
    [],
  );

  const completeTwoFactor = useCallback(
    async (challengeToken: string, code: string) => {
      const nextUser = await api.auth.loginTwoFactor(challengeToken, code);
      setUser(nextUser);
    },
    [],
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<RegisterResult> => {
      const result = await api.auth.register(name, email, password);
      return { email: result.email, devCode: result.devCode };
    },
    [],
  );

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const nextUser = await api.auth.verifyEmail(email, code);
    setUser(nextUser);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const result = await api.auth.resendVerification(email);
    return { message: result.message, devCode: result.devCode };
  }, []);

  const updateProfile = useCallback(async (name: string, email: string) => {
    const result = await api.auth.updateProfile(name, email);
    setUser(result.user);
    return { verificationRequired: result.verificationRequired === true };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await api.auth.me();
      setUser(nextUser);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      completeTwoFactor,
      register,
      verifyEmail,
      resendVerification,
      updateProfile,
      refreshUser,
      logout,
    }),
    [
      user,
      loading,
      login,
      completeTwoFactor,
      register,
      verifyEmail,
      resendVerification,
      updateProfile,
      refreshUser,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
