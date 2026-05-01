import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { VaultApp } from "../components/VaultApp";
import { ShareView } from "../components/ShareView";
import { ToastProvider } from "../components/Toast";
import { Session, User } from "../types/domain";
import { authApi } from "../lib/api/auth";
import { Loader } from "../components/Loader";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const [user, setUser] = useState<User | null>(null);

  // Restore session using HttpOnly cookies automatically via /auth/me
  const { data: restoredUser, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      try {
        const res = await authApi.verifySession(""); // Token is in cookie
        return res.data.user;
      } catch (err) {
        return null;
      }
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (restoredUser) {
      setUser(restoredUser);
    }
  }, [restoredUser]);

  const handleLogin = (data: { user: User }) => {
    setUser(data.user);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error("Logout API failed", err);
    } finally {
      setUser(null);
      // Purge all sensitive vault data from the query cache immediately
      queryClient.clear();
    }
  };

  if (isLoading) {
    return <Loader message="Securing Your Vault..." />;
  }

  return (
    <ToastProvider>
      <HashRouter>
        <div className="app-root">
          <Routes>
            <Route path="/share/:token" element={<ShareView />} />
            <Route 
              path="/" 
              element={
                user ? (
                  <VaultApp session={{ user, accessToken: "", refreshToken: "" }} onLogout={handleLogout} />
                ) : (
                  <AuthShell onLogin={(session) => handleLogin({ user: session.user })} />
                )
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </HashRouter>
    </ToastProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
