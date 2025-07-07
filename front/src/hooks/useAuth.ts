import { useAuth as useAuthContext } from "@/lib/auth/AuthContext"

export function useAuth() {
  const auth = useAuthContext();

  const getAuthHeaders = async () => {
    const token = await auth.getAuthToken();
    if (token) {
      return {
        Authorization: `Bearer ${token}`,
      }
    }
    return {}
  }

  return {
    ...auth,
    getAuthHeaders,
  }
} 