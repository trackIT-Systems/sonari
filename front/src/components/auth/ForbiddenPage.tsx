"use client";

import { SonariIcon, WarningIcon } from "@/components/icons";
import Button from "@/components/Button";
import { useAuth } from "@/components/auth/AuthContext";

interface ForbiddenPageProps {
  message?: string;
}

export function ForbiddenPage({ message }: ForbiddenPageProps) {
  const { logout, user } = useAuth();

  const defaultMessage = "You do not have permission to access this application for the current server.";
  const displayMessage = message || defaultMessage;

  return (
    <div className="flex justify-center items-center w-screen h-screen bg-stone-100 dark:bg-stone-900">
      <div className="flex flex-col items-center max-w-2xl px-8">
        <div className="mb-6">
          <SonariIcon width={128} height={128} className="w-32 h-32 text-stone-400 dark:text-stone-600" />
        </div>
        
        <div className="mb-4 p-4 rounded-full bg-red-100 dark:bg-red-900/30">
          <WarningIcon className="w-16 h-16 text-red-600 dark:text-red-400" />
        </div>

        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-4 text-center">
          Access Forbidden
        </h1>

        <p className="text-lg text-stone-600 dark:text-stone-400 mb-6 text-center">
          {displayMessage}
        </p>

        {user && (
          <div className="mb-8 p-4 bg-stone-200 dark:bg-stone-800 rounded-lg">
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-1">
              Signed in as:
            </p>
            <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
              {user.username} ({user.email})
            </p>
          </div>
        )}

        <div className="flex flex-col items-center gap-4 mb-8">
          <Button 
            onClick={logout}
            variant="primary"
            className="px-8 py-3 text-lg"
          >
            Sign Out
          </Button>
          
          <p className="text-sm text-stone-500 dark:text-stone-500 text-center">
            Try signing in with a different account that has access to this application.
          </p>
        </div>

        <div className="mt-8 p-6 bg-stone-200 dark:bg-stone-800 rounded-lg max-w-xl">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">
            Need Access?
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            If you believe you should have access to this application, please contact your administrator. 
          </p>
        </div>
      </div>
    </div>
  );
}
