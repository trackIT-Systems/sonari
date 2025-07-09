"use client";

import { type ReactNode, useEffect, useState } from "react";

import Loading from "@/app/loading";
import { SonariIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/AuthContext";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading: authLoading, user, login } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Small delay to prevent flash
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Handle authentication redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isInitializing) {
      login();
    }
  }, [authLoading, isAuthenticated, isInitializing, login]);

  // Handle user loading errors - redirect to login
  useEffect(() => {
    if (!authLoading && isAuthenticated && !user && !isInitializing) {
      console.error('User data not available, redirecting to login...');
      login();
    }
  }, [authLoading, isAuthenticated, user, isInitializing, login]);

  // Show loading screen during initialization, authentication, or user loading
  if (isInitializing || authLoading) {
    return <LoadingScreen message={getLoadingMessage(isInitializing, authLoading)} />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <LoadingScreen message="Redirecting to login..." />;
  }

  // Handle missing user data
  if (!user) {
    return <LoadingScreen message="Loading user data..." />;
  }

  // User is authenticated and data is loaded
  return <>{children}</>;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex justify-center items-center w-screen h-screen">
      <div className="flex flex-col items-center">
        <div>
          <SonariIcon width={128} height={128} className="w-32 h-32" />
        </div>
        <div>
          <Loading />
        </div>
        <div className="mt-4 text-center text-stone-500">
          {message}
        </div>
      </div>
    </div>
  );
}

function getLoadingMessage(isInitializing: boolean, authLoading: boolean): string {
  if (isInitializing) return 'Initializing...';
  if (authLoading) return 'Authenticating...';
  return 'Loading...';
} 