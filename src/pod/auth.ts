import { Session } from "@inrupt/solid-client-authn-node";

import { SolidAuthConfig } from "../utils/config";

export async function createAuthenticatedSession(
  authConfig: SolidAuthConfig
): Promise<Session> {
  const session = new Session();

  await session.login({
    oidcIssuer: authConfig.oidcIssuer,
    clientId: authConfig.clientId,
    clientSecret: authConfig.clientSecret,
    refreshToken: authConfig.refreshToken,
    tokenType: authConfig.tokenType
  });

  if (!session.info.isLoggedIn) {
    throw new Error("Solid login did not establish an authenticated session.");
  }

  return session;
}