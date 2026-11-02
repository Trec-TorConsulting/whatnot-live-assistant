// Chrome's built-in Gemini Nano (Prompt API, Chrome 138+ in extensions). Typed by hand because
// only the few calls below are used.

export type OnDeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api';

export interface OnDeviceSession {
  prompt(input: unknown, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<OnDeviceSession>;
  destroy(): void;
}

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', cb: (e: { loaded: number; total?: number }) => void): void;
}

interface CreateOptions {
  expectedInputs: object[];
  expectedOutputs: object[];
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  topK?: number;
  monitor?: (m: DownloadMonitor) => void;
}

interface LanguageModelApi {
  availability(options: object): Promise<Exclude<OnDeviceStatus, 'no-api'>>;
  create(options: CreateOptions): Promise<OnDeviceSession>;
}

export const languageModel = () => (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;

// availability() must get the same modalities that create() does, or it can claim support that
// the image prompt then lacks.
const TEXT_EN = { type: 'text', languages: ['en'] };

export const ON_DEVICE_OPTIONS = {
  expectedInputs: [TEXT_EN, { type: 'image' }],
  expectedOutputs: [TEXT_EN],
};

export const TEXT_ONLY_OPTIONS = { expectedInputs: [TEXT_EN], expectedOutputs: [TEXT_EN] };

export const onDeviceStatus = async (): Promise<OnDeviceStatus> => {
  const api = languageModel();
  if (!api) return 'no-api';
  try {
    return await api.availability(ON_DEVICE_OPTIONS);
  } catch {
    return 'unavailable';
  }
};

// The one-time model download needs a user click, so this runs from the side panel. It asks for
// text only so the download still starts when image support is only reported after install.
export const downloadOnDeviceModel = async (onProgress: (fraction: number) => void) => {
  const api = languageModel();
  if (!api) throw new Error('This Chrome has no on-device model');
  const session = await api.create({
    ...TEXT_ONLY_OPTIONS,
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress(e.total ? e.loaded / e.total : e.loaded)),
  });
  session.destroy();
};
