"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import authClient from "@/components/auth/authClient";
import Loading from "@/app/loading";
import { SonariIcon } from "@/components/icons";

/**
 * OIDC callback route - fixed redirect URI for OAuth flow
 * This route handles the OAuth callback from the OIDC provider
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Check for OAuth errors first
      if (error) {
        console.error('OAuth error:', error, errorDescription);
        sessionStorage.removeItem('oidc_redirect_destination');
        sessionStorage.removeItem('oidc_state');
        sessionStorage.removeItem('oidc_code_verifier');
        router.replace('/');
        return;
      }

      // If no code parameter, redirect to home
      if (!code) {
        console.warn('No authorization code in callback URL');
        router.replace('/');
        return;
      }

      try {
        // Initialize auth client - it will detect the code parameter and handle the callback
        await authClient.initialize();

        // Get the original destination from sessionStorage (stored before redirect)
        const originalDestination = sessionStorage.getItem('oidc_redirect_destination') || '/';
        sessionStorage.removeItem('oidc_redirect_destination');

        // Small delay to ensure state is updated before redirect
        setTimeout(() => {
          router.replace(originalDestination);
        }, 100);
      } catch (error) {
        console.error('Authentication callback failed:', error);
        // Clean up on error
        sessionStorage.removeItem('oidc_redirect_destination');
        sessionStorage.removeItem('oidc_state');
        sessionStorage.removeItem('oidc_code_verifier');
        // On error, redirect to home page
        router.replace('/');
      }
    };

    handleCallback();
  }, [router, searchParams]);

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
          Completing authentication...
        </div>
      </div>
    </div>
  );
}
