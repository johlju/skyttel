import { AsyncLocalStorage } from 'node:async_hooks';
import { oauthProvider } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import type Database from 'better-sqlite3';

// The grant belongs to this consent request, never to mutable session selection.
export const assistantConsent = new AsyncLocalStorage<string>();
// An additional guard for Skyttel's own in-flight work. Ordinary OAuth clients
// have no context here and retain the same authorization rules.
export type AssistantTaskGuard = (contentVersion?: number) => void;
export const assistantTaskAccess = new AsyncLocalStorage<AssistantTaskGuard>();
export const assistantScope = 'skyttel:read';
export const assistantWriteScope = 'skyttel:write';

export function revokeAssistantConnection(database: Database.Database, id: string) {
  database
    .transaction(() => {
      database.prepare('DELETE FROM oauthRefreshToken WHERE referenceId = ?').run(id);
      database.prepare('DELETE FROM oauthAccessToken WHERE referenceId = ?').run(id);
      database.prepare('DELETE FROM oauthConsent WHERE referenceId = ?').run(id);
      database.prepare('DELETE FROM assistant_connection WHERE id = ?').run(id);
    })
    .immediate();
}

export function assistantAuthPlugins(database: Database.Database, origin: string) {
  return [
    jwt(),
    oauthProvider({
      loginPage: '/assistant-consent',
      consentPage: '/assistant-consent',
      scopes: [assistantScope, assistantWriteScope, 'offline_access'],
      validAudiences: [`${origin}/mcp`],
      resources: [
        {
          identifier: `${origin}/mcp`,
          allowedScopes: [assistantScope, assistantWriteScope, 'offline_access'],
        },
      ],
      clientRegistrationDefaultResources: [`${origin}/mcp`],
      clientRegistrationDefaultScopes: [assistantScope],
      clientRegistrationAllowedScopes: [assistantScope, assistantWriteScope, 'offline_access'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      grantTypes: ['authorization_code', 'refresh_token'],
      postLogin: {
        page: '/assistant-consent',
        shouldRedirect: () => false,
        consentReferenceId: () => {
          const grant = assistantConsent.getStore();
          if (!grant) throw new APIError('FORBIDDEN');
          return grant;
        },
      },
      customAccessTokenClaims: ({ referenceId, user }) => {
        const grant = database
          .prepare('SELECT 1 FROM assistant_connection WHERE id = ? AND userId = ?')
          .get(referenceId ?? '', user?.id ?? '');
        if (!grant) throw new APIError('FORBIDDEN');
        return { skyttel_grant: referenceId };
      },
    }),
  ];
}
