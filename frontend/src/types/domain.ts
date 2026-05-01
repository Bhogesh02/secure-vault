export type User = {
  id: number;
  email: string;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export type Folder = {
  id: number;
  name: string;
  is_locked: boolean | number;
  total_size?: number;
  created_at?: string;
};

export type VaultFile = {
  id: number;
  filename: string;
  size: number;
  created_at: string;
  content_type: string;
  encryption_salt?: string;
  encryption_iv?: string;
  deleted_at?: string;
};

export type Notice = {
  type: "success" | "error" | "info";
  text: string;
} | null;
