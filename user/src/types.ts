export interface UserRecord {
  id: string;
  globalName: string;
  appNames: Record<string, string>;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
  lastOnlineAt: number;
  permission: string;
  online: boolean;
}

export interface TokenRecord {
  id: string;
  userId: string;
  shortHash: string;
  longHash: string;
  tokenSalt: string;
  shortExpires: number;
  longExpires: number;
  scopes: string;
  createdAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keySalt: string;
  prefix: string;
  name: string;
  scopes: string;
  rateLimit: number;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface RegisterResult {
  id: string;
  globalName: string;
}

export interface LoginResult {
  user_id: string;
  short_token: string;
  long_token: string;
  expires_in: number;
}

export interface VerifyResult {
  userId: string;
  scopes: string[];
}

export interface ApiKeyResult {
  key: string;
  name: string;
  expiresDays: number;
  rateLimit: number;
  prefix: string;
}
