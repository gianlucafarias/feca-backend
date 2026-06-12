import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContextStore = {
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}
