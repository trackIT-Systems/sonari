import { jwtDecode } from 'jwt-decode';

export interface oidcConfig {
  serverUrl: string;
  application: string;
  clientId: string;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_at: number;
  refresh_expires_at: number;
}

export interface UserInfo {
  sub: string;
  preferred_username: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
}

class AuthClient {
  private config: oidcConfig | null = null;
  private tokenSet: TokenSet | null = null;
  private userInfo: UserInfo | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRedirecting: boolean = false; // Prevent multiple simultaneous redirects

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
    }
  }

  async initialize(config?: oidcConfig): Promise<void> {
    if (config) {
      this.config = config;
    } else {
      const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER || '';
      const response = await fetch(`${basePath}/api/v1/auth/config`);
      if (response.ok) {
        const backendConfig = await response.json();
        this.config = {
          serverUrl: backendConfig.server_url,
          application: backendConfig.application,
          clientId: backendConfig.client_id,
        };
      }
    }

    // Check if we're returning from an OAuth callback
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code) {
        await this.handleAuthCallback(code, state);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    this.scheduleTokenRefresh();
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)));
  }

  /**
   * Get the fixed OIDC callback redirect URI
   */
  private getCallbackUri(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER || '';
    return `${window.location.origin}${basePath}/auth/callback`;
  }

  async login(): Promise<void> {
    if (!this.config) {
      throw new Error('authClient not initialized');
    }

    // Prevent multiple simultaneous redirects
    if (this.isRedirecting) {
      return;
    }

    this.isRedirecting = true;

    // Store the current destination so we can redirect back after auth
    // Remove base path prefix to avoid double base path issue with Next.js router
    if (typeof window !== 'undefined') {
      const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER || '';
      let currentPath = window.location.pathname + window.location.search;
      
      // Remove base path prefix if present (Next.js router will add it back)
      if (basePath && currentPath.startsWith(basePath)) {
        currentPath = currentPath.substring(basePath.length) || '/';
      }
      
      // Don't store callback route as destination
      if (!currentPath.includes('/auth/callback')) {
        sessionStorage.setItem('oidc_redirect_destination', currentPath);
      }
    }

    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    // Store PKCE parameters in sessionStorage
    sessionStorage.setItem('oidc_code_verifier', codeVerifier);
    sessionStorage.setItem('oidc_state', state);

    const callbackUri = this.getCallbackUri();
    const authUrl = new URL(`${this.config.serverUrl}application/o/authorize/`);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email groups');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  }

  async logout(): Promise<void> {
    const idToken = this.tokenSet?.id_token;
    
    this.clearTokens();
    
    if (this.config && idToken) {
      const logoutUrl = new URL(`${this.config.serverUrl}application/o/${this.config.application}/end-session/`);
      logoutUrl.searchParams.set('id_token_hint', idToken);
      logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);
      
      window.location.href = logoutUrl.toString();
    } else {
      window.location.reload();
    }
  }

  private async handleAuthCallback(code: string, state: string | null): Promise<void> {
    if (!this.config) {
      throw new Error('authClient not initialized');
    }

    const storedState = sessionStorage.getItem('oidc_state');
    const codeVerifier = sessionStorage.getItem('oidc_code_verifier');

    if (state !== storedState) {
      // Clean up on error
      sessionStorage.removeItem('oidc_state');
      sessionStorage.removeItem('oidc_code_verifier');
      throw new Error('Invalid state parameter - possible CSRF attack or expired session');
    }

    if (!codeVerifier) {
      throw new Error('Code verifier not found - session may have expired');
    }

    const callbackUri = this.getCallbackUri();
    const tokenUrl = `${this.config.serverUrl}application/o/token/`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: callbackUri,
        code_verifier: codeVerifier,
      }),
    });

    // Clean up session storage regardless of success/failure
    sessionStorage.removeItem('oidc_state');
    sessionStorage.removeItem('oidc_code_verifier');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Failed to exchange code for tokens: ${response.status} ${response.statusText}`);
    }

    const tokens = await response.json();
    this.setTokens(tokens);
    await this.loadUserInfo();
    
    // Reset redirect flag after successful callback
    this.isRedirecting = false;
  }

  private setTokens(tokens: any): void {
    const now = Date.now();
    this.tokenSet = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_at: now + (tokens.expires_in * 1000),
      refresh_expires_at: now + (tokens.refresh_expires_in * 1000),
    };

    this.saveToStorage();
    this.scheduleTokenRefresh();
  }

  private async loadUserInfo(): Promise<void> {
    if (!this.tokenSet?.access_token) {
      return;
    }

    try {
      // Decode JWT to get user info
      const decoded = jwtDecode<any>(this.tokenSet.access_token);
      this.userInfo = {
        sub: decoded.sub,
        preferred_username: decoded.preferred_username,
        email: decoded.email,
        given_name: decoded.given_name,
        family_name: decoded.family_name,
        name: decoded.name,
      };
    } catch (error) {
      console.error('Failed to decode access token:', error);
    }
  }

  /**
   * Refresh access token using refresh token.
   * Does NOT redirect - throws error on failure so caller can handle appropriately.
   * Only login() should trigger redirects to OIDC provider.
   */
  async refreshTokens(): Promise<void> {
    if (!this.config || !this.tokenSet?.refresh_token) {
      this.clearTokens();
      throw new Error('Cannot refresh tokens: no refresh token available');
    }

    const now = Date.now();
    if (now >= this.tokenSet.refresh_expires_at) {
      // Refresh token expired - clear tokens and throw error
      // Let the caller (AuthGuard or API interceptor) handle the redirect
      this.clearTokens();
      throw new Error('Refresh token expired');
    }

    const tokenUrl = `${this.config.serverUrl}application/o/token/`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: this.tokenSet.refresh_token,
      }),
    });

    if (!response.ok) {
      // Refresh failed - clear tokens and throw error
      // Do NOT redirect here - let the caller handle it
      this.clearTokens();
      const errorText = await response.text();
      console.error('Token refresh failed:', errorText);
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const tokens = await response.json();
    this.setTokens(tokens);
    await this.loadUserInfo();
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenSet) {
      return;
    }

    const now = Date.now();
    const expiresAt = this.tokenSet.expires_at;
    const refreshAt = expiresAt - (5 * 60 * 1000); // Refresh 5 minutes before expiry

    if (refreshAt > now) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTokens().catch(console.error);
      }, refreshAt - now);
    }
  }

  private saveToStorage(): void {
    if (typeof window !== 'undefined' && this.tokenSet) {
      localStorage.setItem('oidc_tokens', JSON.stringify(this.tokenSet));
      if (this.userInfo) {
        localStorage.setItem('oidc_user', JSON.stringify(this.userInfo));
      }
    }
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined') {
      const storedTokens = localStorage.getItem('oidc_tokens');
      const storedUser = localStorage.getItem('oidc_user');

      if (storedTokens) {
        try {
          this.tokenSet = JSON.parse(storedTokens);
          // Check if tokens are still valid
          const now = Date.now();
          if (this.tokenSet && now >= this.tokenSet.refresh_expires_at) {
            this.clearTokens();
          }
        } catch (error) {
          console.error('Failed to parse stored tokens:', error);
          this.clearTokens();
        }
      }

      if (storedUser) {
        try {
          this.userInfo = JSON.parse(storedUser);
        } catch (error) {
          console.error('Failed to parse stored user info:', error);
        }
      }
    }
  }

  /**
   * Clear all tokens and reset auth state.
   * Public method for use by API interceptors and other components.
   */
  clearTokens(): void {
    this.tokenSet = null;
    this.userInfo = null;
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('oidc_tokens');
      localStorage.removeItem('oidc_user');
    }
    
    // Reset redirect flag when tokens are cleared
    this.isRedirecting = false;
  }

  isAuthenticated(): boolean {
    if (!this.tokenSet) {
      return false;
    }

    const now = Date.now();
    return now < this.tokenSet.expires_at;
  }

  getAccessToken(): string | null {
    if (!this.isAuthenticated()) {
      return null;
    }
    return this.tokenSet?.access_token || null;
  }

  getUserInfo(): UserInfo | null {
    return this.userInfo;
  }

  /**
   * Ensure we have a valid access token, refreshing if needed.
   * Does NOT redirect - throws error on failure so caller can handle appropriately.
   */
  async ensureValidToken(): Promise<string | null> {
    if (!this.tokenSet) {
      return null;
    }

    const now = Date.now();
    
    // If access token is expired but refresh token is still valid, try to refresh
    if (now >= this.tokenSet.expires_at && now < this.tokenSet.refresh_expires_at) {
      try {
        await this.refreshTokens();
      } catch (error) {
        // Refresh failed - return null so caller knows auth is needed
        // Don't redirect here - let AuthGuard or API interceptor handle it
        console.warn('Token refresh failed in ensureValidToken:', error);
        return null;
      }
    }

    return this.getAccessToken();
  }
}

const authClient = new AuthClient();
export default authClient; 