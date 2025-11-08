import { randomBytes, createHash } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import type { EsiClient } from '@battlescope/esi-client';
import {
  EVESSOTokenResponseSchema,
  EVESSOCharacterSchema,
  type EVESSOTokenResponse,
  type EVESSOCharacter,
} from '../schemas/index.js';

const tracer = trace.getTracer('@battlescope/auth');

export interface EVESSOConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scopes: string[];
  authorizeUrl?: string;
  tokenUrl?: string;
  verifyUrl?: string;
}

export interface OAuthState {
  state: string;
  codeVerifier: string;
  redirectUri?: string;
  timestamp: number;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  character: EVESSOCharacter;
}

/**
 * EVE Online SSO OAuth2/OIDC Service
 *
 * Handles the OAuth2 authorization code flow with PKCE for EVE Online SSO.
 */
export class EVESSOService {
  private readonly config: Required<EVESSOConfig>;
  private readonly stateStore = new Map<string, OAuthState>();

  constructor(
    config: EVESSOConfig,
    private readonly esiClient: EsiClient,
  ) {
    this.config = {
      ...config,
      authorizeUrl: config.authorizeUrl ?? 'https://login.eveonline.com/v2/oauth/authorize',
      tokenUrl: config.tokenUrl ?? 'https://login.eveonline.com/v2/oauth/token',
      verifyUrl: config.verifyUrl ?? 'https://login.eveonline.com/oauth/verify',
    };
  }

  /**
   * Generate authorization URL for EVE SSO login
   *
   * @param redirectUri - Optional redirect URI after login
   * @returns Authorization URL and state for CSRF protection
   */
  generateAuthorizationUrl(redirectUri?: string): { url: string; state: string } {
    return tracer.startActiveSpan('eve-sso.generate-auth-url', (span) => {
      try {
        const state = this.generateState();
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);

        // Store state for verification
        this.stateStore.set(state, {
          state,
          codeVerifier,
          redirectUri,
          timestamp: Date.now(),
        });

        // Clean up old states (older than 10 minutes)
        this.cleanupOldStates();

        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.config.clientId,
          redirect_uri: this.config.callbackUrl,
          scope: this.config.scopes.join(' '),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        });

        const url = `${this.config.authorizeUrl}?${params.toString()}`;

        span.setAttribute('state', state);
        span.setAttribute('scopes', this.config.scopes.join(' '));

        return { url, state };
      } finally {
        span.end();
      }
    });
  }

  /**
   * Exchange authorization code for access token
   *
   * @param code - Authorization code from callback
   * @param state - State parameter for CSRF verification
   * @returns Token exchange result with character information
   */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenExchangeResult> {
    return tracer.startActiveSpan('eve-sso.exchange-code', async (span) => {
      try {
        // Verify state
        const stateData = this.stateStore.get(state);
        if (!stateData) {
          throw new Error('Invalid or expired state parameter');
        }

        // Clean up used state
        this.stateStore.delete(state);

        // Exchange code for token
        const tokenResponse = await this.fetchToken({
          grant_type: 'authorization_code',
          code,
          code_verifier: stateData.codeVerifier,
        });

        // Verify token and get character info
        const character = await this.verifyToken(tokenResponse.access_token);

        span.setAttribute('character.id', character.CharacterID);
        span.setAttribute('character.name', character.CharacterName);

        return {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresIn: tokenResponse.expires_in,
          character,
        };
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Refresh an access token using refresh token
   *
   * @param refreshToken - The refresh token
   * @returns New access token and expiry
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
    return tracer.startActiveSpan('eve-sso.refresh-token', async (span) => {
      try {
        const tokenResponse = await this.fetchToken({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });

        return {
          accessToken: tokenResponse.access_token,
          expiresIn: tokenResponse.expires_in,
          refreshToken: tokenResponse.refresh_token,
        };
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Verify an access token and get character information
   *
   * @param accessToken - The access token to verify
   * @returns Character information
   */
  async verifyToken(accessToken: string): Promise<EVESSOCharacter> {
    const response = await fetch(this.config.verifyUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Token verification failed: ${response.statusText}`);
    }

    const data = await response.json();
    return EVESSOCharacterSchema.parse(data);
  }

  /**
   * Fetch token from EVE SSO
   */
  private async fetchToken(params: {
    grant_type: string;
    code?: string;
    code_verifier?: string;
    refresh_token?: string;
  }): Promise<EVESSOTokenResponse> {
    const body = new URLSearchParams({
      ...params,
      client_id: this.config.clientId,
      ...(params.grant_type === 'authorization_code' && {
        redirect_uri: this.config.callbackUrl,
      }),
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this.encodeClientCredentials()}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return EVESSOTokenResponseSchema.parse(data);
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Encode client credentials for Basic auth
   */
  private encodeClientCredentials(): string {
    return Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
  }

  /**
   * Clean up old state entries (older than 10 minutes)
   */
  private cleanupOldStates(): void {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [state, data] of this.stateStore.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        this.stateStore.delete(state);
      }
    }
  }

  /**
   * Get redirect URI from state
   */
  getRedirectUri(state: string): string | undefined {
    return this.stateStore.get(state)?.redirectUri;
  }
}

/**
 * Create an EVE SSO service instance
 */
export function createEVESSOService(config: EVESSOConfig, esiClient: EsiClient): EVESSOService {
  return new EVESSOService(config, esiClient);
}
