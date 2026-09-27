/** Hand-off between the share extension handler and the import screen. */
export interface SharedPayload {
  text: string | null;
  url: string | null;
  imageUri: string | null;
  title: string | null;
  receivedAt: number;
}

let pending: SharedPayload | null = null;

export const shareInbox = {
  put(p: SharedPayload) {
    pending = p;
  },
  take(): SharedPayload | null {
    const p = pending;
    pending = null;
    return p;
  },
  peek: () => pending,
};
