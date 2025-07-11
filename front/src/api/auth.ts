import { AxiosInstance } from "axios";
import { UserSchema } from "@/schemas";
import authClient from "@/components/auth/authClient";
import type { User } from "@/types";

const DEFAULT_ENDPOINTS = {
  config: "/api/v1/auth/config",
  me: "/api/v1/auth/me",
};

export function registerAuthAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function getAuthConfig() {
    const response = await instance.get(endpoints.config);
    return response.data;
  }

  async function login() {
    await authClient.login();
  }

  async function logout() {
    await authClient.logout();
  }

  async function me(): Promise<User> {
    const response = await instance.get<User>(endpoints.me);
    return UserSchema.parse(response.data);
  }

  async function isAuthenticated(): Promise<boolean> {
    return authClient.isAuthenticated();
  }

  return {
    getAuthConfig,
    login,
    logout,
    me,
    isAuthenticated,
  } as const;
}

export function setupAuthInterceptor(instance: AxiosInstance) {
  instance.interceptors.request.use(async (config) => {
    try {
      // Get valid access token (will refresh if needed)
      const token = await authClient.ensureValidToken();
      
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (error) {
      console.error('Failed to get auth token for request:', error);
    }
    
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        console.warn('Received 401, triggering re-authentication');
        // Force re-authentication on 401
        await authClient.login();
      }
      
      return Promise.reject(error);
    }
  );
} 