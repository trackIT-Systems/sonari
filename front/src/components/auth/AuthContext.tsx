"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import authClient, { UserInfo } from './authClient';
import api from '@/app/api';
import type { User } from '@/types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
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
    } catch (error) {
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
        } else {
          // Fallback to user info from token if backend fails
          const userInfo = authClient.getUserInfo();
          if (userInfo) {
            setUser(convertUserInfo(userInfo));
          }
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
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
    user,
    login,
    logout,
    getAuthToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 