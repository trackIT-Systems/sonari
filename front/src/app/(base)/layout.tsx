"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useContext, useCallback, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

import Loading from "@/app/loading";
import { SonariIcon } from "@/components/icons";
import { SideMenu } from "@/components/navigation/SideMenu";
import useActiveUser from "@/hooks/api/useActiveUser";

import UserContext from "./context";

function WithLogIn({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const currentPath = `${pathname}${params ? `?${params}` : ""}`;

  const {
    data: user,
    isLoading,
    isError,
  } = useActiveUser({
    onLogout: () => {
      toast.success("You have been logged out");
      router.push(`/login?back=${encodeURIComponent(currentPath)}`);
    },
  });

  // Memoize user value BEFORE any early returns (Rules of Hooks)
  // This prevents unnecessary re-renders of all consuming components
  // React Query already handles object reference stability, but we add
  // an extra layer by only updating when specific fields change
  const userValue = useMemo(() => {
    if (!user) return user;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  }, [user]);

  // Handle error navigation in useEffect to avoid rendering issues
  useEffect(() => {
    if (isError) {
      router.push(`/login?back=${encodeURIComponent(currentPath)}`);
    }
  }, [isError, router, currentPath]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-screen h-screen">
        <div className="flex flex-col items-center">
          <div>
            <SonariIcon width={128} height={128} className="w-32 h-32" />
          </div>
          <div>
            <Loading />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    // Return loading state while navigation is happening
    return (
      <div className="flex justify-center items-center w-screen h-screen">
        <div className="flex flex-col items-center">
          <div>
            <SonariIcon width={128} height={128} className="w-32 h-32" />
          </div>
          <div>
            <Loading />
          </div>
        </div>
      </div>
    );
  }

  if (user == null || userValue == null) {
    throw Error("User is null");
  }

  return <UserContext.Provider value={userValue}>{children}</UserContext.Provider>;
}

function Contents({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useContext(UserContext);

  const handleLogout = useCallback(() => {
    router.push("/login");
  }, [router]);

  return (
    <div className="flex flex-row w-full min-w-0 h-full overflow-hidden">
      <SideMenu user={user} onLogout={handleLogout} />
      <main className="w-full min-w-0 h-full overflow-x-auto">
        {children}
      </main>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <WithLogIn>
      <Contents>{children}</Contents>
    </WithLogIn>
  );
}
