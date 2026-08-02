// intervalSinceLast only exists in hot-zone messages; the cold database does not store this field
export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAppName: string;
  content: string;
  type: string;
  sentAt: number;
  senderIp: string;
  recalled: boolean;
  manuallyDeleted: boolean;
  autoDeleted: boolean;
  intervalSinceLast?: number | null;
}

export interface Room {
  id: string;
  type: "direct" | "group";
  name: string | null;
  creatorId: string;
  createdAt: number;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  joinedAt: number;
}

export interface UserInfo {
  name: string;
  appName: string;
}

export interface AuthResult {
  userId: string;
  scopes: string[];
  permission: string;
}

export interface MessageResult {
  items: ChatMessage[];
  cursor: string | undefined;
  hasMore: boolean;
}
