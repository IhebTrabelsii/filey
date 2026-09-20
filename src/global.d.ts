/* ============================================================
   ASSET MODULE DECLARATIONS
============================================================ */

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.css';

/* ============================================================
   CONVERSION TYPES
============================================================ */

type FileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document';

interface ImageOptions {
  scale?: number;
  quality?: number;
}

interface ConversionRequest {
  inputPath: string;
  fileType: FileType;
  fromFormat: string;
  toFormat: string;
  imageOptions?: ImageOptions;
}

interface ConversionResult {
  success: boolean;
  outputPath?: string;
  outputName?: string;
  error?: string;
}

interface ProgressPayload {
  progress: number;
  message: string;
}

/* ============================================================
   IMAGE EDITOR TYPES
============================================================ */

interface ImageInfo {
  width: number;
  height: number;
}

type ResizeMode = 'size' | 'percent' | 'social';

interface ExportImageRequest {
  inputPath: string;
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  lockAspect?: boolean;
  targetBytes?: number;
  targetFormat?: string;
}

/* ============================================================
   ELECTRON API BRIDGE
============================================================ */

interface ElectronAPI {
  selectFile(fileType: FileType): Promise<string | null>;

  saveFile(defaultName: string): Promise<string | null>;

  convertFile(
    request: ConversionRequest,
  ): Promise<ConversionResult>;

  cancelConversion(): Promise<boolean>;

  openFile(filePath: string): Promise<boolean>;

  openFolder(filePath: string): Promise<boolean>;

  saveOutput(
    tempPath: string,
    destination: string,
  ): Promise<boolean>;

  discardOutput(tempPath: string): Promise<boolean>;

  getPathForFile(file: File): string;

  getImageInfo(inputPath: string): Promise<ImageInfo | null>;

  exportImage(
    request: ExportImageRequest,
  ): Promise<ConversionResult>;

  openExternal(url: string): Promise<boolean>;

  onProgress(
    callback: (data: ProgressPayload) => void,
  ): () => void;

  /* ---------- Window controls ---------- */

  minimizeWindow(): Promise<void>;

  toggleMaximizeWindow(): Promise<boolean>;

  closeWindow(): Promise<void>;

  isWindowMaximized(): Promise<boolean>;

  onWindowMaximized(
    callback: (maximized: boolean) => void,
  ): () => void;
}

/* ============================================================
   WINDOW AUGMENTATION
============================================================ */

interface Window {
  electronAPI: ElectronAPI;
}