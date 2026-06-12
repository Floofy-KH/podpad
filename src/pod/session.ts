export interface AuthSessionInfo {
  webId?: string;
}

export interface AuthSession {
  fetch: typeof fetch;
  logout: () => Promise<void>;
  info: AuthSessionInfo;
}