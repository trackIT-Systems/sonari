import { AxiosInstance } from "axios";
import { z } from "zod";

import {
  AppTokenCreateSchema,
  AppTokenCreatedSchema,
  AppTokenPublicSchema,
  AuthConfigSchema,
  UserSchema,
} from "@/schemas";
import authClient from "@/components/auth/authClient";
import type { User } from "@/types";

const DEFAULT_ENDPOINTS = {
  config: "/api/v1/auth/config",
  me: "/api/v1/auth/me",
  appTokens: "/api/v1/auth/app-tokens",
};

export type AppTokenCreateBody = z.infer<typeof AppTokenCreateSchema>;
export type AppTokenPublic = z.infer<typeof AppTokenPublicSchema>;
export type AppTokenCreated = z.infer<typeof AppTokenCreatedSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// Global callback for handling 403 errors
let forbiddenCallback: ((message?: string) => void) | null = null;

export function setForbiddenCallback(callback: (message?: string) => void) {
  forbiddenCallback = callback;
}

export function clearForbiddenCallback() {
  forbiddenCallback = null;
}

export function registerAuthAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function getAuthConfig(): Promise<AuthConfig> {
    const response = await instance.get(endpoints.config);
    return AuthConfigSchema.parse(response.data);
  }

  async function listAppTokens(): Promise<AppTokenPublic[]> {
    const response = await instance.get(endpoints.appTokens);
    return z.array(AppTokenPublicSchema).parse(response.data);
  }

  async function createAppToken(body: AppTokenCreateBody): Promise<AppTokenCreated> {
    const payload = AppTokenCreateSchema.parse(body);
    const response = await instance.post(endpoints.appTokens, payload);
    return AppTokenCreatedSchema.parse(response.data);
  }

  async function revokeAppToken(tokenId: string): Promise<void> {
    await instance.delete(`${endpoints.appTokens}/${tokenId}`);
  }

  async function purgeAppToken(tokenId: string): Promise<void> {
    await instance.post(`${endpoints.appTokens}/${tokenId}/purge`);
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
    listAppTokens,
    createAppToken,
    revokeAppToken,
    purgeAppToken,
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
      // ensureValidToken() will throw if refresh fails, which is fine
      // We'll handle 401s in the response interceptor
      const token = await authClient.ensureValidToken();
      
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (error) {
      // Token refresh failed - let the request proceed without token
      // The response interceptor will handle 401s appropriately
      console.warn('Failed to get auth token for request:', error);
    }
    
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        console.warn('Received 401 Unauthorized - clearing tokens');
        // Clear tokens on 401 - AuthGuard will detect this and trigger login
        // Do NOT redirect here - let AuthGuard handle it to prevent redirect loops
        authClient.clearTokens();
        
        // Don't call login() here - AuthGuard will handle the redirect
        // This prevents redirects during API calls
      } else if (error.response?.status === 403) {
        console.warn('Received 403 Forbidden - user not authorized');
        // Handle forbidden error - user is authenticated but not authorized
        if (forbiddenCallback) {
          const message = error.response?.data?.detail;
          forbiddenCallback(message);
        }
      }
      
      return Promise.reject(error);
    }
  );
} 