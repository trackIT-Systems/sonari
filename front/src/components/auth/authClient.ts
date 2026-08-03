import { jwtDecode } from 'jwt-decode';

export interface oidcConfig {
  serverUrl: string;
  application: string;
  clientId: string;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string | null;
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
  private static readonly SKEW_MS = 10_000;
  private static readonly REFRESH_LOCK_NAME = 'sonari-oidc-refresh';
  private static readonly DEFAULT_REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000;
  private static readonly REFRESH_RETRY_DELAY_MS = 500;

  private config: oidcConfig | null = null;
  private tokenSet: TokenSet | null = null;
  private userInfo: UserInfo | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRedirecting: boolean = false;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<void> | null = null;
  private crossTabListenersRegistered = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
      this.registerCrossTabListeners();
    }
  }

  private registerCrossTabListeners(): void {
    if (this.crossTabListenersRegistered || typeof window === 'undefined') {
      return;
    }
    this.crossTabListenersRegistered = true;

    window.addEventListener('storage', (e) => {
      if (e.key !== 'oidc_tokens') {
        return;
      }
      if (e.newValue === null) {
        return;
      }
      this.loadFromStorage();
      this.scheduleTokenRefresh();
    });
  }

  async initialize(config?: oidcConfig): Promise<void> {
    this.registerCrossTabListeners();

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

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code) {
        await this.handleAuthCallback(code, state);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.ensureValidToken().catch(() => {});
        }
      });
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

  private getCallbackUri(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER || '';
    return `${window.location.origin}${basePath}/auth/callback`;
  }

  private hasValidAccessToken(now: number = Date.now()): boolean {
    return !!this.tokenSet && now < this.tokenSet.expires_at - AuthClient.SKEW_MS;
  }

  private adoptFresherTokenFromStorage(): boolean {
    const previousExpiresAt = this.tokenSet?.expires_at ?? 0;
    this.loadFromStorage();
    if (!this.tokenSet) {
      return false;
    }
    return this.tokenSet.expires_at > previousExpiresAt && this.hasValidAccessToken();
  }

  async login(): Promise<void> {
    if (!this.config) {
      throw new Error('authClient not initialized');
    }

    if (this.isRedirecting) {
      return;
    }

    this.isRedirecting = true;

    if (typeof window !== 'undefined') {
      const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER || '';
      let currentPath = window.location.pathname + window.location.search;

      if (basePath && currentPath.startsWith(basePath)) {
        currentPath = currentPath.substring(basePath.length) || '/';
      }

      if (!currentPath.includes('/auth/callback')) {
        sessionStorage.setItem('oidc_redirect_destination', currentPath);
      }
    }

    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    sessionStorage.setItem('oidc_code_verifier', codeVerifier);
    sessionStorage.setItem('oidc_state', state);

    const callbackUri = this.getCallbackUri();
    const authUrl = new URL(`${this.config.serverUrl}application/o/authorize/`);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email groups offline_access');
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

    this.isRedirecting = false;
  }

  private setTokens(tokens: any): void {
    const now = Date.now();

    const refreshToken = tokens.refresh_token !== undefined
      ? tokens.refresh_token
      : this.tokenSet?.refresh_token || null;

    const refreshExpiresAt = typeof tokens.refresh_expires_in === 'number'
      ? now + tokens.refresh_expires_in * 1000
      : this.tokenSet?.refresh_expires_at ?? now + AuthClient.DEFAULT_REFRESH_EXPIRES_MS;

    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 0;

    this.tokenSet = {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      id_token: tokens.id_token !== undefined ? tokens.id_token : this.tokenSet?.id_token,
      expires_at: now + expiresIn * 1000,
      refresh_expires_at: refreshExpiresAt,
    };

    this.saveToStorage();
    this.scheduleTokenRefresh();
  }

  private async loadUserInfo(): Promise<void> {
    if (!this.tokenSet?.access_token) {
      return;
    }

    try {
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

  async refreshTokens(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.runRefreshWithCoordination().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async runRefreshWithCoordination(): Promise<void> {
    const runRefresh = async () => {
      this.loadFromStorage();
      if (this.hasValidAccessToken()) {
        return;
      }
      await this.refreshTokensUnchecked();
    };

    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(AuthClient.REFRESH_LOCK_NAME, { mode: 'exclusive' }, runRefresh);
      return;
    }

    await runRefresh();
  }

  private async refreshTokensUnchecked(): Promise<void> {
    if (!this.config || !this.tokenSet?.refresh_token) {
      this.clearTokens();
      throw new Error('Cannot refresh tokens: no refresh token available');
    }

    const now = Date.now();
    if (now >= this.tokenSet.refresh_expires_at) {
      this.clearTokens();
      throw new Error('Refresh token expired');
    }

    this.isRefreshing = true;

    try {
      await this.performRefreshRequest(false);
    } finally {
      this.isRefreshing = false;
    }
  }

  private async performRefreshRequest(isRetry: boolean): Promise<void> {
    if (!this.config || !this.tokenSet?.refresh_token) {
      this.clearTokens();
      throw new Error('Cannot refresh tokens: no refresh token available');
    }

    const tokenUrl = `${this.config.serverUrl}application/o/token/`;
    const refreshToken = this.tokenSet.refresh_token;

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          refresh_token: refreshToken,
        }),
      });
    } catch (error) {
      if (!isRetry) {
        await new Promise((resolve) => setTimeout(resolve, AuthClient.REFRESH_RETRY_DELAY_MS));
        if (this.adoptFresherTokenFromStorage()) {
          return;
        }
        return this.performRefreshRequest(true);
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const isInvalidGrant = errorText.includes('invalid_grant');

      if (this.adoptFresherTokenFromStorage()) {
        return;
      }

      if (!isRetry && !isInvalidGrant && response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, AuthClient.REFRESH_RETRY_DELAY_MS));
        if (this.adoptFresherTokenFromStorage()) {
          return;
        }
        return this.performRefreshRequest(true);
      }

      const now = Date.now();
      if (isInvalidGrant || (this.tokenSet && now >= this.tokenSet.refresh_expires_at)) {
        this.clearTokens();
      }

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
      this.refreshTimer = null;
    }

    if (!this.tokenSet) {
      return;
    }

    const now = Date.now();
    const effectiveExpiry = this.tokenSet.expires_at - AuthClient.SKEW_MS;
    const timeUntilExpiry = effectiveExpiry - now;

    if (timeUntilExpiry <= 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTokens().catch((error) => {
          console.error('Scheduled token refresh failed:', error);
        });
      }, 1000);
      return;
    }

    const refreshDelay = Math.max(1000, timeUntilExpiry * 0.8);

    this.refreshTimer = setTimeout(() => {
      this.refreshTokens().catch((error) => {
        console.error('Scheduled token refresh failed:', error);
      });
    }, refreshDelay);

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `Token refresh scheduled in ${Math.round(refreshDelay / 1000)}s `
        + `(token expires in ${Math.round((this.tokenSet.expires_at - now) / 1000)}s)`,
      );
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

    this.isRedirecting = false;
    this.isRefreshing = false;
  }

  isAuthenticated(): boolean {
    if (!this.tokenSet) {
      return false;
    }

    if (this.isRefreshing) {
      return true;
    }

    return this.hasValidAccessToken();
  }

  isRefreshInProgress(): boolean {
    return this.isRefreshing || this.refreshPromise !== null;
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

  async ensureValidToken(): Promise<string | null> {
    if (!this.tokenSet) {
      return null;
    }

    const now = Date.now();

    if (this.hasValidAccessToken(now)) {
      return this.getAccessToken();
    }

    if (now >= this.tokenSet.refresh_expires_at) {
      return null;
    }

    try {
      await this.refreshTokens();
    } catch (error) {
      console.warn('Token refresh failed in ensureValidToken:', error);
      if (this.hasValidAccessToken()) {
        return this.getAccessToken();
      }
      return null;
    }

    return this.getAccessToken();
  }
}

const authClient = new AuthClient();
export default authClient;
