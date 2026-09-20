import {
  contextBridge,
  ipcRenderer,
  webUtils,
} from 'electron';

contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    /* ---------- Files ---------- */

    selectFile: (fileType: string) =>
      ipcRenderer.invoke('select-file', fileType),

    saveFile: (defaultName: string) =>
      ipcRenderer.invoke('save-file', defaultName),

    convertFile: (request: unknown) =>
      ipcRenderer.invoke('convert-file', request),

    cancelConversion: () =>
      ipcRenderer.invoke('cancel-conversion'),

    openFile: (filePath: string) =>
      ipcRenderer.invoke('open-file', filePath),

    openFolder: (filePath: string) =>
      ipcRenderer.invoke('open-folder', filePath),

    saveOutput: (tempPath: string, destination: string) =>
      ipcRenderer.invoke('save-output', tempPath, destination),

    discardOutput: (tempPath: string) =>
      ipcRenderer.invoke('discard-output', tempPath),

    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },

    /* ---------- Image editor ---------- */

    getImageInfo: (inputPath: string) =>
      ipcRenderer.invoke('get-image-info', inputPath),

    exportImage: (request: unknown) =>
      ipcRenderer.invoke('export-image', request),

    /* ---------- External links ---------- */

    openExternal: (url: string) =>
      ipcRenderer.invoke('open-external', url),

    /* ---------- Progress ---------- */

    onProgress: (
      callback: (data: {
        progress: number;
        message: string;
      }) => void,
    ) => {
      const listener = (
        _event: unknown,
        data: {
          progress: number;
          message: string;
        },
      ) => callback(data);

      ipcRenderer.on(
        'conversion-progress',
        listener,
      );

      return () => {
        ipcRenderer.removeListener(
          'conversion-progress',
          listener,
        );
      };
    },

    /* ---------- Window controls ---------- */

    minimizeWindow: () =>
      ipcRenderer.invoke('window-minimize'),

    toggleMaximizeWindow: () =>
      ipcRenderer.invoke('window-toggle-maximize'),

    closeWindow: () =>
      ipcRenderer.invoke('window-close'),

    isWindowMaximized: () =>
      ipcRenderer.invoke('window-is-maximized'),

    onWindowMaximized: (
      callback: (maximized: boolean) => void,
    ) => {
      const listener = (
        _event: unknown,
        maximized: boolean,
      ) => callback(maximized);

      ipcRenderer.on(
        'window-maximized-changed',
        listener,
      );

      return () => {
        ipcRenderer.removeListener(
          'window-maximized-changed',
          listener,
        );
      };
    },
  },
);