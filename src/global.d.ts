export {};

declare global {
  interface Window {
    codexApi: {
      pickImages: () => Promise<string[]>;
      startSession: (opts: {
        sessionId: string;
        command?: string;
        args?: string[];
        cwd?: string;
      }) => Promise<void>;
      sendMessage: (payload: {
        sessionId: string;
        text: string;
        attachments?: string[];
        model?: string;
        sandbox?: string;
        cwd?: string;
      }) => Promise<void>;
      stopSession: (sessionId: string) => Promise<void>;
      onData: (cb: (payload: { sessionId: string; data: string }) => void) => () => void;
      onError: (cb: (payload: { sessionId: string; message: string }) => void) => () => void;
      onExit: (cb: (payload: { sessionId: string; code: number }) => void) => () => void;
      readImageAsDataUrl: (filePath: string) => string | null;
      pickCwd: () => Promise<string | null>;
    };
  }
}
