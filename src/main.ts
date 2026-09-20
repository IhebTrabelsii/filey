import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import fsSync from 'node:fs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

import sharp, { type Sharp } from 'sharp';
import started from 'electron-squirrel-startup';

/*
 * In development, use the copy that lives in resources/ffmpeg.
 * In a packaged app, use the copy that Electron Forge placed in
 * the app's resources folder via extraResource.
 */
const ffmpegPath = app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  : path.join(__dirname, '../../resources/ffmpeg/ffmpeg.exe');

console.log('FFmpeg path:', ffmpegPath);

/* ============================================================
   TYPES
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

interface ExportImageRequest {
  inputPath: string;
  mode: 'size' | 'percent' | 'social';
  width?: number;
  height?: number;
  percent?: number;
  lockAspect?: boolean;
  targetBytes?: number;
  targetFormat?: string;
}

/* ============================================================
   APPLICATION
============================================================ */

if (started) {
  app.quit();
}

const gotLock =
  app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

/* ============================================================
   WINDOW
============================================================ */

let mainWindow: BrowserWindow | null = null;

const activeWorkDirs = new Set<string>();

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,

    minWidth: 560,
    minHeight: 500,

    show: false,

    frame: false,

    title: 'Filey',

    backgroundColor: '#0e0e0e',

    webPreferences: {
      preload: path.join(
        __dirname,
        'preload.js',
      ),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: false,
    },
  });

  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow?.show();
    },
  );

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      if (
        url.startsWith('https://') ||
        url.startsWith('http://')
      ) {
        void shell.openExternal(url);
      }

      return {
        action: 'deny',
      };
    },
  );

  mainWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      const allowed =
        url.startsWith(
          'http://localhost:',
        ) ||
        url.startsWith('file://');

      if (!allowed) {
        event.preventDefault();

        if (
          url.startsWith(
            'https://',
          ) ||
          url.startsWith('http://')
        ) {
          void shell.openExternal(url);
        }
      }
    },
  );

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null;
    },
  );

  mainWindow.on(
    'maximize',
    () => {
      mainWindow?.webContents.send(
        'window-maximized-changed',
        true,
      );
    },
  );

  mainWindow.on(
    'unmaximize',
    () => {
      mainWindow?.webContents.send(
        'window-maximized-changed',
        false,
      );
    },
  );
};

/* ============================================================
   ACTIVE FFMPEG PROCESSES
============================================================ */

const activeProcesses =
  new Map<
    number,
    ChildProcess
  >();

let processCounter = 0;

/* ============================================================
   FILE PICKER
============================================================ */

ipcMain.handle(
  'select-file',
  async (
    _event,
    fileType: FileType,
  ): Promise<string | null> => {
    try {
      const result =
        await dialog.showOpenDialog(
          mainWindow!,
          {
            title:
              'Choose a file to convert',

            properties: [
              'openFile',
            ],

            filters:
              getFileFilters(
                fileType,
              ),
          },
        );

      if (
        result.canceled ||
        result.filePaths.length ===
          0
      ) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error(
        'File picker error:',
        error,
      );

      return null;
    }
  },
);

/* ============================================================
   SAVE DIALOG
============================================================ */

ipcMain.handle(
  'save-file',
  async (
    _event,
    defaultName: string,
  ): Promise<string | null> => {
    try {
      const downloads =
        app.getPath(
          'downloads',
        );

      const result =
        await dialog.showSaveDialog(
          mainWindow!,
          {
            title:
              'Save converted file',

            defaultPath:
              path.join(
                downloads,
                defaultName,
              ),

            properties: [
              'showOverwriteConfirmation',
              'createDirectory',
            ],
          },
        );

      if (
        result.canceled ||
        !result.filePath
      ) {
        return null;
      }

      return result.filePath;
    } catch (error) {
      console.error(
        'Save dialog error:',
        error,
      );

      return null;
    }
  },
);

/* ============================================================
   SAVE OUTPUT
============================================================ */

ipcMain.handle(
  'save-output',
  async (
    _event,
    tempPath: string,
    destination: string,
  ): Promise<boolean> => {
    try {
      if (!existsSync(tempPath)) {
        throw new Error(
          'The converted file is no longer available.',
        );
      }

      await fs.copyFile(tempPath, destination);

      const tempDir = path.dirname(tempPath);

      try {
        await fs.rm(tempDir, {
          recursive: true,
          force: true,
        });

        activeWorkDirs.delete(tempDir);
      } catch {
        /* ignore */
      }

      return true;
    } catch (error) {
      console.error('Save output failed:', error);
      return false;
    }
  },
);

/* ============================================================
   DISCARD OUTPUT
============================================================ */

ipcMain.handle(
  'discard-output',
  async (
    _event,
    tempPath: string,
  ): Promise<boolean> => {
    try {
      const tempDir = path.dirname(tempPath);

      await fs.rm(tempDir, {
        recursive: true,
        force: true,
      });

      activeWorkDirs.delete(tempDir);

      return true;
    } catch {
      return false;
    }
  },
);
/* ============================================================
   OPEN EXTERNAL URL (for support / donation links)
============================================================ */

ipcMain.handle(
  'open-external',
  async (
    _event,
    url: string,
  ): Promise<boolean> => {
    try {
      /*
       * Only allow https/http — never let the renderer open
       * arbitrary protocols (file://, javascript:, etc.).
       */
      if (
        !url.startsWith('https://') &&
        !url.startsWith('http://')
      ) {
        return false;
      }

      await shell.openExternal(url);
      return true;
    } catch (error) {
      console.error('open-external failed:', error);
      return false;
    }
  },
);
/* ============================================================
   IMAGE INFO (editor)
============================================================ */

ipcMain.handle(
  'get-image-info',
  async (
    _event,
    inputPath: string,
  ): Promise<{ width: number; height: number } | null> => {
    try {
      if (!existsSync(inputPath)) {
        return null;
      }

      const meta = await sharp(inputPath).metadata();

      if (!meta.width || !meta.height) {
        return null;
      }

      return {
        width: meta.width,
        height: meta.height,
      };
    } catch (error) {
      console.error('get-image-info failed:', error);
      return null;
    }
  },
);

/* ============================================================
   EXPORT IMAGE (editor's EXPORT button)
============================================================ */

ipcMain.handle(
  'export-image',
  async (
    event,
    request: ExportImageRequest,
  ): Promise<ConversionResult> => {
    try {
      if (!existsSync(request.inputPath)) {
        throw new Error(
          'The selected file no longer exists.',
        );
      }

      const meta = await sharp(request.inputPath).metadata();

      if (!meta.width || !meta.height) {
        throw new Error('Could not read image dimensions.');
      }

      const sourceWidth = meta.width;
      const sourceHeight = meta.height;

      /* ---------- Compute target size ---------- */

      let targetWidth = sourceWidth;
      let targetHeight = sourceHeight;

      if (request.mode === 'percent') {
        const pct = Math.max(
          1,
          Math.min(400, request.percent ?? 100),
        );

        targetWidth = Math.max(
          1,
          Math.round(sourceWidth * (pct / 100)),
        );
        targetHeight = Math.max(
          1,
          Math.round(sourceHeight * (pct / 100)),
        );
      } else {
        const w = request.width ?? sourceWidth;
        const h = request.height ?? sourceHeight;

        if (request.lockAspect) {
          const ratio = sourceWidth / sourceHeight;

          if (
            request.width &&
            request.width !== sourceWidth
          ) {
            targetWidth = Math.max(1, Math.round(w));
            targetHeight = Math.max(
              1,
              Math.round(w / ratio),
            );
          } else if (
            request.height &&
            request.height !== sourceHeight
          ) {
            targetHeight = Math.max(1, Math.round(h));
            targetWidth = Math.max(
              1,
              Math.round(h * ratio),
            );
          } else {
            targetWidth = Math.max(1, Math.round(w));
            targetHeight = Math.max(1, Math.round(h));
          }
        } else {
          targetWidth = Math.max(1, Math.round(w));
          targetHeight = Math.max(1, Math.round(h));
        }
      }

      /* ---------- Output path ---------- */

      const workDir = await fs.mkdtemp(
        path.join(app.getPath('temp'), 'filey-edit-'),
      );

      activeWorkDirs.add(workDir);

      const sourceExt =
        path.extname(request.inputPath).slice(1).toLowerCase() ||
        'png';

      const outFormat =
        (request.targetFormat ?? sourceExt).toLowerCase();

      const original =
        path.parse(request.inputPath).name;

      const outputPath = path.join(
        workDir,
        `${original}.${outFormat}`,
      );

      sendProgress(event, 20, 'Resizing image...');

      /* ---------- Target file size loop ---------- */

      const targetBytes =
        request.targetBytes && request.targetBytes > 0
          ? request.targetBytes
          : 0;

      if (targetBytes > 0) {
        let quality = 90;
        let done = false;

        for (let i = 0; i < 8; i++) {
          const attempt = applyFormatOptions(
            sharp(request.inputPath).resize({
              width: targetWidth,
              height: targetHeight,
              fit: 'fill',
              withoutEnlargement: false,
            }),
            outFormat,
            quality,
          );

          const buf = await attempt.toBuffer();

          if (buf.length <= targetBytes || quality <= 30) {
            await fs.writeFile(outputPath, buf);
            done = true;
            break;
          }

          quality -= 10;
        }

        if (!done) {
          /* Should not happen — the loop above always writes. */
          throw new Error('Could not reach target file size.');
        }
      } else {
        const pipeline = applyFormatOptions(
          sharp(request.inputPath).resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'fill',
            withoutEnlargement: false,
          }),
          outFormat,
        );

        await pipeline.toFile(outputPath);
      }

      sendProgress(event, 100, 'Image ready!');

      return {
        success: true,
        outputPath,
        outputName: path.basename(outputPath),
      };
    } catch (error) {
      console.error('export-image failed:', error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Image export failed.',
      };
    }
  },
);

/* ============================================================
   CONVERSION
============================================================ */

ipcMain.handle(
  'convert-file',

  async (
    event,
    request: ConversionRequest,
  ): Promise<ConversionResult> => {
    try {
      validateRequest(request);

      if (
        !existsSync(
          request.inputPath,
        )
      ) {
        throw new Error(
          'The selected file no longer exists.',
        );
      }

      const workDir = await fs.mkdtemp(
        path.join(app.getPath('temp'), 'filey-out-'),
      );

      activeWorkDirs.add(workDir);

      const original =
        path.parse(
          request.inputPath,
        ).name;

      const extension =
        request.toFormat.toLowerCase();

      const outputPath =
        path.join(workDir, `${original}.${extension}`);

      if (
        request.fileType ===
        'image'
      ) {
        await convertImage(
          request.inputPath,
          outputPath,
          request.toFormat,
          request.imageOptions,
          event,
        );
      }

      if (
        request.fileType ===
          'audio' ||
        request.fileType ===
          'video'
      ) {
        await convertMedia(
          request.inputPath,
          outputPath,
          event,
        );
      }

      if (
        request.fileType ===
        'document'
      ) {
        await convertDocument(
          request.inputPath,
          outputPath,
          request.toFormat,
          event,
        );
      }

      return {
        success: true,

        outputPath,

        outputName:
          path.basename(
            outputPath,
          ),
      };
    } catch (error) {
      console.error(
        'Conversion failed:',
        error,
      );

      return {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Conversion failed.',
      };
    }
  },
);

/* ============================================================
   IMAGE CONVERSION
============================================================ */

const convertImage =
  async (
    inputPath: string,
    outputPath: string,
    format: string,
    imageOptions: ImageOptions | undefined,
    event: Electron.IpcMainInvokeEvent,
  ): Promise<void> => {
    sendProgress(
      event,
      10,
      'Reading image...',
    );

    let image =
      sharp(inputPath);

    const scale =
      imageOptions?.scale &&
      imageOptions.scale > 0 &&
      imageOptions.scale !== 1
        ? imageOptions.scale
        : undefined;

    if (scale) {
      const meta =
        await sharp(inputPath).metadata();

      const targetWidth =
        meta.width
          ? Math.max(1, Math.round(meta.width * scale))
          : undefined;

      if (targetWidth) {
        image = image.resize({
          width: targetWidth,
          withoutEnlargement: false,
        });
      }
    }

    const quality =
      imageOptions?.quality &&
      imageOptions.quality >= 1 &&
      imageOptions.quality <= 100
        ? imageOptions.quality
        : undefined;

    switch (
      format.toLowerCase()
    ) {
      case 'jpg':
      case 'jpeg':
        image = image.jpeg({
          quality: quality ?? 90,
        });
        break;

      case 'png':
        image = image.png({
          compressionLevel: 6,
        });
        break;

      case 'webp':
        image = image.webp({
          quality: quality ?? 90,
        });
        break;

      case 'avif':
        image = image.avif({
          quality: quality ?? 80,
        });
        break;

      case 'tiff':
        image = image.tiff({
          quality: quality ?? 90,
        });
        break;

      default:
        throw new Error(
          `Image output "${format}" is not supported.`,
        );
    }

    sendProgress(
      event,
      40,
      'Processing image...',
    );

    await image.toFile(
      outputPath,
    );

    sendProgress(
      event,
      100,
      'Image complete!',
    );
  };

/* ============================================================
   FFMPEG
============================================================ */

const convertMedia =
  (
    inputPath: string,
    outputPath: string,
    event: Electron.IpcMainInvokeEvent,
  ): Promise<void> => {
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        if (!ffmpegPath) {
          reject(
            new Error(
              'FFmpeg is unavailable.',
            ),
          );

          return;
        }

        const id =
          ++processCounter;

        const child =
          spawn(
            ffmpegPath,
            [
              '-y',

              '-i',
              inputPath,

              '-progress',
              'pipe:1',

              '-nostats',

              outputPath,
            ],
            {
              windowsHide: true,
            },
          );

        activeProcesses.set(
          id,
          child,
        );

        let stderr = '';

        child.stdout.on(
          'data',
          (data) => {
            const text =
              data.toString();

            const match =
              text.match(
                /out_time_ms=(\d+)/,
              );

            if (match) {
              const current =
                Number(
                  match[1],
                );

              const visual =
                Math.min(
                  95,
                  10 +
                    Math.floor(
                      current /
                        1000000,
                    ) %
                      85,
                );

              sendProgress(
                event,
                visual,
                'Converting media...',
              );
            }
          },
        );

        child.stderr.on(
          'data',
          (data) => {
            stderr +=
              data.toString();
          },
        );

        child.on(
          'error',
          (error) => {
            activeProcesses.delete(
              id,
            );

            reject(error);
          },
        );

        child.on(
          'close',
          (code) => {
            activeProcesses.delete(
              id,
            );

            if (code === 0) {
              sendProgress(
                event,
                100,
                'Conversion complete!',
              );

              resolve();
            } else {
              reject(
                new Error(
                  cleanFfmpegError(
                    stderr,
                  ),
                ),
              );
            }
          },
        );
      },
    );
  };

/* ============================================================
   CANCEL CONVERSION
============================================================ */

ipcMain.handle(
  'cancel-conversion',
  () => {
    for (const child of activeProcesses.values()) {
      child.kill();
    }

    activeProcesses.clear();

    return true;
  },
);

/* ============================================================
   WINDOW CONTROLS
============================================================ */

ipcMain.handle(
  'window-minimize',
  () => {
    mainWindow?.minimize();
  },
);

ipcMain.handle(
  'window-toggle-maximize',
  (): boolean => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }

    mainWindow.maximize();
    return true;
  },
);

ipcMain.handle(
  'window-close',
  () => {
    mainWindow?.close();
  },
);

ipcMain.handle(
  'window-is-maximized',
  (): boolean =>
    mainWindow?.isMaximized() ?? false,
);

/* ============================================================
   IMAGE FORMAT HELPER
============================================================ */

const applyFormatOptions = (
  pipeline: Sharp,
  format: string,
  quality?: number,
): Sharp => {
  const q = quality ?? 90;

  switch (format) {
    case 'jpg':
    case 'jpeg':
      return pipeline.jpeg({ quality: q });

    case 'png':
      return pipeline.png({
        compressionLevel: quality ? 9 : 6,
      });

    case 'webp':
      return pipeline.webp({ quality: q });

    case 'avif':
      return pipeline.avif({ quality: Math.min(q, 80) });

    case 'tiff':
      return pipeline.tiff({ quality: q });

    default:
      return pipeline;
  }
};

/* ============================================================
   DOCUMENT CONVERSION
============================================================ */

const convertDocument =
  async (
    inputPath: string,
    outputPath: string,
    format: string,
    event: Electron.IpcMainInvokeEvent,
  ): Promise<void> => {
    const libreOffice =
      findLibreOffice();

    if (!libreOffice) {
      throw new Error(
        'LibreOffice is required for document conversion. Please install LibreOffice and try again.',
      );
    }

    sendProgress(event, 10, 'Starting document converter...');

    const outputDirectory = path.dirname(outputPath);

    if (!existsSync(outputDirectory)) {
      await fs.mkdir(outputDirectory, { recursive: true });
    }

    const target = format.toLowerCase();

    const filterMap: Record<string, string> = {
      pdf: 'pdf:writer_pdf_Export',
      docx: 'docx:MS Word 2007 XML',
      doc: 'doc:MS Word 97',
      xlsx: 'xlsx:Calc MS Excel 2007 XML',
      xls: 'xls:MS Excel 97',
      pptx: 'pptx:Impress MS PowerPoint 2007 XML',
      ppt: 'ppt:MS PowerPoint 97',
      odt: 'odt:writer8',
      ods: 'ods:calc8',
      odp: 'odp:impress8',
      csv: 'csv:Text - txt - csv (StarCalc)',
      html: 'html:HTML (StarWriter)',
      txt: 'txt:Text (encoded):UTF8',
    };

    const convertFilter = filterMap[target] ?? target;

    const workDir = await fs.mkdtemp(
      path.join(app.getPath('temp'), 'filey-doc-'),
    );

    const profileDir = path.join(workDir, 'lo-profile');
    await fs.mkdir(profileDir, { recursive: true });
    const profileUrl =
      'file:///' + profileDir.replace(/\\/g, '/');

    const originalExt =
      path.extname(inputPath).slice(1).toLowerCase() || 'bin';
    const safeInput = path.join(workDir, `input.${originalExt}`);
    await fs.copyFile(inputPath, safeInput);

    /*
     * PDFs need an explicit import filter. Without it, LibreOffice
     * opens PDFs in its Draw module, and Draw cannot export to
     * Writer formats like DOCX.
     */
    const infilterArgs =
      originalExt === 'pdf'
        ? ['--infilter=writer_pdf_import']
        : [];

    try {
      const programDir = path.dirname(libreOffice);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          libreOffice,
          [
            `-env:UserInstallation=${profileUrl}`,
            '--headless',
            '--norestore',
            '--nologo',
            '--nodefault',
            '--nofirststartwizard',
            ...infilterArgs,
            '--convert-to',
            convertFilter,
            '--outdir',
            workDir,
            safeInput,
          ],
          {
            windowsHide: true,
            cwd: programDir,
            env: {
              ...process.env,
              PATH: `${programDir};${process.env.PATH ?? ''}`,
            },
          },
        );

        let stderr = '';
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', reject);

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                stderr || 'LibreOffice conversion failed.',
              ),
            );
          }
        });
      });

      const produced = path.join(workDir, `input.${target}`);

      if (!existsSync(produced)) {
        throw new Error(
          'The document converter did not create an output file.',
        );
      }

      await fs.copyFile(produced, outputPath);
    } finally {
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    sendProgress(event, 100, 'Document complete!');
  };

/* ============================================================
   OPEN FILE
============================================================ */

ipcMain.handle(
  'open-file',
  async (
    _event,
    filePath: string,
  ) => {
    if (
      !existsSync(filePath)
    ) {
      return false;
    }

    await shell.openPath(
      filePath,
    );

    return true;
  },
);

/* ============================================================
   OPEN FOLDER
============================================================ */

ipcMain.handle(
  'open-folder',
  async (
    _event,
    filePath: string,
  ) => {
    if (
      !existsSync(filePath)
    ) {
      return false;
    }

    shell.showItemInFolder(
      filePath,
    );

    return true;
  },
);

/* ============================================================
   PROGRESS
============================================================ */

const sendProgress = (
  event: Electron.IpcMainInvokeEvent,
  progress: number,
  message: string,
) => {
  event.sender.send(
    'conversion-progress',
    {
      progress,
      message,
    },
  );
};

/* ============================================================
   VALIDATION
============================================================ */

const validateRequest = (
  request: ConversionRequest,
) => {
  if (
    !request.inputPath
  ) {
    throw new Error(
      'No input file selected.',
    );
  }

  if (
    !request.fileType
  ) {
    throw new Error(
      'No file category selected.',
    );
  }

  if (
    !request.fromFormat ||
    !request.toFormat
  ) {
    throw new Error(
      'Please select both formats.',
    );
  }

  if (
    request.fromFormat.toLowerCase() ===
    request.toFormat.toLowerCase()
  ) {
    throw new Error(
      'The source and destination formats are identical.',
    );
  }
};

/* ============================================================
   LIBREOFFICE
============================================================ */

const findLibreOffice =
  (): string | null => {
    const programDirs = [
      'C:\\Program Files\\LibreOffice\\program',
      'C:\\Program Files (x86)\\LibreOffice\\program',
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Programs',
        'LibreOffice',
        'program',
      ),
    ];

    for (const dir of programDirs) {
      const comPath = path.join(dir, 'soffice.com');
      if (existsSync(comPath)) {
        return comPath;
      }

      const exePath = path.join(dir, 'soffice.exe');
      if (existsSync(exePath)) {
        return exePath;
      }
    }

    return null;
  };

/* ============================================================
   FFMPEG ERROR
============================================================ */

const cleanFfmpegError =
  (
    error: string,
  ): string => {
    const lines =
      error
        .split('\n')
        .map((line) =>
          line.trim(),
        )
        .filter(Boolean);

    return (
      lines.at(-1) ??
      'FFmpeg conversion failed.'
    );
  };

/* ============================================================
   FILE FILTERS
============================================================ */

const getFileFilters =
  (
    type: FileType,
  ): Electron.FileFilter[] => {
    const filters =
      {
        image: [
          'png',
          'jpg',
          'jpeg',
          'webp',
          'avif',
          'gif',
          'tiff',
        ],

        video: [
          'mp4',
          'mov',
          'avi',
          'mkv',
          'webm',
          'wmv',
          'flv',
          'm4v',
        ],

        audio: [
          'mp3',
          'wav',
          'aac',
          'flac',
          'ogg',
          'm4a',
          'wma',
        ],

        document: [
          'pdf',
          'doc',
          'docx',
          'odt',
          'rtf',
          'txt',
          'html',
          'htm',
          'xls',
          'xlsx',
          'ods',
          'csv',
          'ppt',
          'pptx',
          'odp',
        ],
      }[type];

    return [
      {
        name:
          type ===
          'image'
            ? 'Image files'
            : type ===
                'video'
              ? 'Video files'
              : type ===
                  'audio'
                ? 'Audio files'
                : 'Document files',

        extensions:
          filters,
      },

      {
        name:
          'All files',

        extensions: ['*'],
      },
    ];
  };

/* ============================================================
   APPLICATION LIFECYCLE
============================================================ */

app.on(
  'second-instance',
  () => {
    if (!mainWindow) {
      return;
    }

    if (
      mainWindow.isMinimized()
    ) {
      mainWindow.restore();
    }

    mainWindow.focus();
  },
);

app.whenReady().then(() => {
  createWindow();
});

app.on(
  'window-all-closed',
  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit();
    }
  },
);

app.on(
  'activate',
  () => {
    if (
      BrowserWindow.getAllWindows()
        .length === 0
    ) {
      createWindow();
    }
  },
);

app.on(
  'before-quit',
  () => {
    for (const child of activeProcesses.values()) {
      child.kill();
    }

    activeProcesses.clear();

    for (const dir of activeWorkDirs) {
      try {
        fsSync.rmSync(dir, {
          recursive: true,
          force: true,
        });
      } catch {
        /* ignore */
      }
    }

    activeWorkDirs.clear();

    mainWindow = null;
  },
);