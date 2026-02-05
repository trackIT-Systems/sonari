"use client";

import { type ReactNode, useEffect, useState } from "react";

import Loading from "@/app/loading";
import { SonariIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthContext";
import { ForbiddenPage } from "@/components/auth/ForbiddenPage";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading: authLoading, isForbidden, forbiddenMessage, user, login } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasTriggeredLogin, setHasTriggeredLogin] = useState(false); // Prevent multiple redirects

  useEffect(() => {
    // Small delay to prevent flash
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Single effect to handle authentication redirect
  // Only redirect when: not loading, not authenticated, not initializing, and haven't already triggered login
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isInitializing && !hasTriggeredLogin) {
      // If authenticated but no user data, wait a bit longer - might be loading
      // Only redirect if we're sure we're not authenticated
      setHasTriggeredLogin(true);
      login().catch((error) => {
        console.error('Login redirect failed:', error);
        // Reset flag on error so we can retry
        setHasTriggeredLogin(false);
      });
    }
    
    // Reset flag if authentication succeeds
    if (isAuthenticated && hasTriggeredLogin) {
      setHasTriggeredLogin(false);
    }
  }, [authLoading, isAuthenticated, isInitializing, hasTriggeredLogin, login]);

  // Show forbidden page if user is not authorized (403 error)
  if (isForbidden) {
    return <ForbiddenPage message={forbiddenMessage || undefined} />;
  }

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