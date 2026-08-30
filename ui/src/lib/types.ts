export interface User {
  id: string;
  username: string;
}

export interface Device {
  id: string;
  name: string;
  isPrimary: boolean;
  lastSeen: string | null;
  lastAssignedAt: string | null;
  createdAt: string;
}

export interface OutboundMessage {
  id: string;
  userId: string;
  deviceId: string;
  recipient: string;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'dead_letter' | 'in_progress';
  attempts: number;
  webhookUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface DeviceStat {
  id: string;
  name: string;
  isPrimary: boolean;
  lastSeen: string | null;
  sent: number;
  pending: number;
  failed: number;
  deadLetter: number;
  received: number;
}

export interface Stats {
  totals: { sent: number; pending: number; failed: number; deadLetter: number; received: number };
  devices: DeviceStat[];
}

export interface ReceivedMessage {
  id: string;
  deviceId: string;
  fromNumber: string;
  body: string;
  receivedAt: string;
  createdAt: string;
  webhookDelivered: boolean;
}
