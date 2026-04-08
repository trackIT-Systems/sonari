"use client";
import { type ReactNode } from "react";

import { SideMenu } from "@/components/navigation/SideMenu";
import { AuthProvider, useAuth } from "@/components/auth/AuthContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import UserContext from "./context";

function AuthenticatedContent({ children }: { children: ReactNode }) {
  // Get user from AuthContext - AuthGuard ensures this is available
  const { user } = useAuth();

  // AuthGuard ensures user is loaded before this component renders
  if (!user) {
    return null;
  }

  return (
    <UserContext.Provider value={user}>
      <div className="flex h-full min-w-0 w-full">
        <SideMenu />
        <div className="min-w-0 flex-1 h-full">{children}</div>
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