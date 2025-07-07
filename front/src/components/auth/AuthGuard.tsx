"use client";

import { type ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";

import Loading from "@/app/loading";
import { SonariIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import useActiveUser from "@/hooks/api/useActiveUser";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading: authLoading, user: authUser, login } = useAuth();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Small delay to prevent flash
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
  } = useActiveUser({
    enabled: isAuthenticated && !isInitializing,
  });

  // Handle authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isInitializing) {
      login();
    }
  }, [authLoading, isAuthenticated, isInitializing, login]);

  // Handle user loading errors
  useEffect(() => {
    if (userError && isAuthenticated && !isInitializing) {
      console.error('User loading error, redirecting to login...');
      login();
    }
  }, [userError, isAuthenticated, isInitializing, login]);

  // Show loading while initializing or authenticating
  if (isInitializing || authLoading || (!isAuthenticated && !userError)) {
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
            {isInitializing ? 'Initializing...' : 
             authLoading ? 'Authenticating...' : 
             'Redirecting to login...'}
          </div>
        </div>
      </div>
    );
  }

  // Show loading while fetching user data
  if (isAuthenticated && userLoading && !user) {
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
            Loading user profile...
          </div>
        </div>
      </div>
    );
  }

  // Handle authentication errors
  if (userError && isAuthenticated) {
    return (
      <div className="flex justify-center items-center w-screen h-screen">
        <div className="flex flex-col items-center">
          <div>
            <SonariIcon width={128} height={128} className="w-32 h-32" />
          </div>
          <div className="mt-4 text-center text-stone-500">
            Authentication failed. Redirecting...
          </div>
        </div>
      </div>
    );
  }

  if (!user && isAuthenticated) {
    return (
      <div className="flex justify-center items-center w-screen h-screen">
        <div className="flex flex-col items-center">
          <div>
            <SonariIcon width={128} height={128} className="w-32 h-32" />
          </div>
          <div className="mt-4 text-center text-stone-500">
            No user found. Redirecting...
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated and data is loaded
  return <>{children}</>;
} 