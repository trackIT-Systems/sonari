"use client";
import { type ReactNode } from "react";

import { SideMenu } from "@/components/navigation/SideMenu";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
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