"use client";
import { type ReactNode } from "react";

import { SideMenu } from "@/components/navigation/SideMenu";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import UserContext from "./context";
import useActiveUser from "@/hooks/api/useActiveUser";

function AuthenticatedContent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  const { data: user } = useActiveUser({
    enabled: isAuthenticated,
  });

  if (!user) {
    return null; // AuthGuard will handle loading states
  }

  return (
    <UserContext.Provider value={user}>
      <div className="w-full h-full flex">
        <SideMenu />
        <div className="flex-1 h-full">{children}</div>
      </div>
    </UserContext.Provider>
  );
}

export default function BaseLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <AuthenticatedContent>
          {children}
        </AuthenticatedContent>
      </AuthGuard>
    </AuthProvider>
  );
} 