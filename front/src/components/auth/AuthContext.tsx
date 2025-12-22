"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import authClient, { UserInfo } from './authClient';
import api from '@/app/api';
import { setForbiddenCallback, clearForbiddenCallback } from '@/api/auth';
import type { User } from '@/types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isForbidden: boolean;
  forbiddenMessage: string | null;
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  setForbidden: (message?: string) => void;
  clearForbidden: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const convertUserInfo = (userInfo: UserInfo): User => ({
    id: userInfo.sub,
    username: userInfo.preferred_username,
    email: userInfo.email || '',
    name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim() || userInfo.preferred_username,
  });

  const fetchUserFromBackend = async (): Promise<User | null> => {
    try {
      return await api.auth.me();
    } catch (error: any) {
      // Check if it's a 403 Forbidden error
      if (error?.response?.status === 403) {
        const message = error?.response?.data?.detail || "You do not have permission to access this application.";
        setIsForbidden(true);
        setForbiddenMessage(message);
        return null;
      }
      console.error('Failed to fetch user from backend:', error);
      return null;
    }
  };

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const authenticated = authClient.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        // Ensure token is valid (will refresh if needed)
        await authClient.ensureValidToken();
        
        // Fetch user from backend for complete profile
        const backendUser = await fetchUserFromBackend();
        if (backendUser) {
          setUser(backendUser);
          // Clear forbidden state on successful user fetch
          setIsForbidden(false);
          setForbiddenMessage(null);
        } else if (!isForbidden) {
          // Only fallback if not forbidden (backend returned something other than 403)
          const userInfo = authClient.getUserInfo();
          if (userInfo) {
            setUser(convertUserInfo(userInfo));
          }
        }
      } else {
        setUser(null);
        setIsForbidden(false);
        setForbiddenMessage(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [isForbidden]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await authClient.initialize();
        await checkAuthStatus();
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Register the forbidden callback
    setForbiddenCallback((message?: string) => {
      setIsForbidden(true);
      setForbiddenMessage(message || "You do not have permission to access this application.");
    });

    // Cleanup on unmount
    return () => {
      clearForbiddenCallback();
    };
  }, [checkAuthStatus]);

  const login = async () => {
    setIsLoading(true);
    try {
      await authClient.login();
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authClient.logout();
      setIsAuthenticated(false);
      setUser(null);
      setIsForbidden(false);
      setForbiddenMessage(null);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setForbiddenFunc = (message?: string) => {
    setIsForbidden(true);
    setForbiddenMessage(message || "You do not have permission to access this application.");
  };

  const clearForbidden = () => {
    setIsForbidden(false);
    setForbiddenMessage(null);
  };

  const getAuthToken = async (): Promise<string | null> => {
    try {
      return await authClient.ensureValidToken();
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  };

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    isForbidden,
    forbiddenMessage,
    user,
    login,
    logout,
    getAuthToken,
    setForbidden: setForbiddenFunc,
    clearForbidden,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 