// window.postMessage protocol between the MAIN-world page hook and the isolated content script.
export const HOOK_SOURCE = 'wn2-hook';
export const CONTENT_SOURCE = 'wn2-content';

export type HookToContent =
  | { kind: 'hello' }
  | { kind: 'socket'; socket: 'live' | 'auction'; raw: string }
  | { kind: 'graphql_op'; operation: string }
  | { kind: 'graphql'; operation: string; body: string; optionsAfter?: string | null }
  | { kind: 'log_share'; ok: boolean };

export type ContentToHook =
  | { kind: 'ready' }
  | { kind: 'quiet'; ms: number }
  | { kind: 'fetch_break'; id: string; soldAfter: string | null; optionsAfter: string | null }
  | { kind: 'fetch_shop'; id: string; after: string | null };
