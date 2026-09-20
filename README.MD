# Filey

Filey is a local-first desktop file conversion application built with Electron, React, TypeScript, and Vite. It gives the user a small, friendly workflow for choosing a file category, selecting source and destination formats, converting the file, and opening the result.

The application name shown in the window and renderer is **Filey**. The package name and product metadata are currently `file-converter`.

## Project Status

This is an MVP. Image conversion is implemented with `sharp`; audio and video conversion currently spawn a Windows FFmpeg executable configured in `src/main.ts`; document conversion delegates to a locally installed LibreOffice executable. The renderer advertises a broad set of formats, but the actual converter capabilities are controlled by the native tools and by the conversion functions in `src/main.ts`.

Known incomplete behavior is documented in [Known Limitations](#known-limitations). Treat that section as part of the current product contract when making changes.

## Features

- Local file conversion; user files are not uploaded to a service.
- Image conversion through Sharp.
- Audio and video conversion through a locally configured FFmpeg executable.
- Document conversion through headless LibreOffice when LibreOffice is installed.
- Native file picker and Save dialog.
- Conversion progress events from the Electron main process to the React renderer.
- Cancellation of active FFmpeg conversions.
- Open the generated file or reveal it in the operating-system file manager.
- Unique output names in the user's Downloads directory, such as `photo.webp`, `photo-1.webp`, and `photo-2.webp`.
- Electron security baseline: context isolation enabled, Node integration disabled, external navigation opened outside the application.

## Requirements

- Node.js and npm compatible with the installed Electron Forge toolchain.
- Windows for the currently configured media and document conversion workflows.
- LibreOffice is required only for document conversions. On Windows, the app currently looks for:
	- `C:\Program Files\LibreOffice\program\soffice.exe`
	- `C:\Program Files (x86)\LibreOffice\program\soffice.exe`
	- `%LOCALAPPDATA%\Programs\LibreOffice\program\soffice.exe`
- FFmpeg must be available at the path configured by `ffmpegPath` in `src/main.ts`. The current path is `C:\ffmpeg-9.0.1-essentials_build\bin\ffmpeg.exe`.

## Getting Started

Install dependencies from the repository root:

```bash
npm install
```

Start the Electron app in development mode:

```bash
npm start
```

The main process opens DevTools automatically when the Vite development server is active.

Run the available lint command:

```bash
npm run lint
```

Create a packaged application for the current platform:

```bash
npm run package
```

Create distributable installers/artifacts using the Electron Forge makers:

```bash
npm run make
```

The project does not currently define a test script or an automated end-to-end test suite.

## Architecture

```text
src/renderer.tsx
	React UI and workflow state
				|
				| window.electronAPI (typed preload bridge)
				v
src/preload.ts
	contextBridge + ipcRenderer.invoke/on
				|
				v
src/main.ts
	Electron lifecycle, dialogs, filesystem paths,
	Sharp conversion, FFmpeg processes, LibreOffice processes,
	shell actions, and progress events
```

### Main process: `src/main.ts`

The main process owns privileged work and should remain the only place that directly accesses native filesystem paths, child processes, Electron dialogs, Sharp, FFmpeg, and LibreOffice.

Important responsibilities:

- Creates the `BrowserWindow` and loads the Vite development URL or packaged renderer HTML.
- Enforces a single application instance.
- Handles `select-file` and returns a selected absolute path.
- Handles `save-file` and returns a destination selected by the user.
- Handles `convert-file`, validates the request, creates a unique output path in Downloads, and dispatches to the relevant converter.
- Handles `cancel-conversion` by killing active FFmpeg child processes.
- Handles `open-file` and `open-folder` through Electron's shell API.
- Sends `conversion-progress` events to the invoking renderer web contents.

Conversion helpers in this file:

- `convertImage`: Sharp-based image conversion and format-specific quality settings.
- `convertMedia`: spawns FFmpeg with `-progress pipe:1` and parses `out_time_ms` into a visual progress value.
- `convertDocument`: finds LibreOffice, runs it headlessly, then renames the generated output to the app's unique path.
- `getFileFilters`: controls the native file picker extensions.
- `createUniqueOutputPath`: prevents overwriting existing files in Downloads.

### Preload bridge: `src/preload.ts`

The preload exposes one deliberately small API as `window.electronAPI`. Do not expose `ipcRenderer` itself or add arbitrary shell/file-system access to the renderer.

Current API:

```ts
selectFile(fileType): Promise<string | null>
saveFile(defaultName): Promise<string | null>
convertFile(request): Promise<ConversionResult>
cancelConversion(): Promise<boolean>
openFile(filePath): Promise<boolean>
openFolder(filePath): Promise<boolean>
onProgress(callback): () => void
```

The public TypeScript declarations for this API are in `src/global.d.ts`. Whenever the bridge changes, update both `src/preload.ts` and `src/global.d.ts`, then update all renderer call sites.

### Renderer: `src/renderer.tsx`

The renderer is a single React component with a page-state workflow:

```text
splash -> home -> converter -> processing -> result
												 \-> converter on failure/cancel
```

The renderer owns user-facing state such as selected category, source/destination formats, selected file name, progress, status, errors, and output information. It should request privileged operations through `window.electronAPI` instead of importing Electron or Node modules.

Format lists and category metadata are currently defined near the top of `src/renderer.tsx`. If a format is added or removed, check all of these surfaces together:

1. Renderer `formats` options.
2. Main-process `getFileFilters` input filters.
3. The actual Sharp, FFmpeg, or LibreOffice backend support.
4. Error handling and documentation.

### Styling: `src/index.css`

The UI is styled in one CSS file. It uses a soft pink background, responsive sizing with `clamp()`, category cards, converter panels, progress states, and mobile-friendly grid behavior. Keep the existing visual language unless a design change is intentional.

### Build configuration

- `forge.config.ts` configures Electron Forge, Vite entries, packaging, makers, and Electron fuses.
- `vite.main.config.ts` builds the main process.
- `vite.preload.config.ts` builds the preload script.
- `vite.renderer.config.ts` enables the React Vite plugin.
- `index.html` is the renderer entry HTML document.
- `tsconfig.json` contains the shared TypeScript compiler settings.

## Supported Categories and Formats

The renderer currently presents these choices:

| Category | Renderer destination options | Main-process picker extensions | Backend |
| --- | --- | --- | --- |
| Images | PNG, JPG, WEBP, AVIF, TIFF | PNG, JPG, JPEG, WEBP, AVIF, GIF, TIFF | Sharp; output implementations currently include PNG, JPG/JPEG, WEBP, AVIF, TIFF |
| Video | MP4, MOV, AVI, MKV, WEBM, M4V | MP4, MOV, AVI, MKV, WEBM, WMV, FLV, M4V | FFmpeg |
| Audio | MP3, WAV, AAC, FLAC, OGG, M4A | MP3, WAV, AAC, FLAC, OGG, M4A, WMA | FFmpeg |
| Documents | PDF, DOCX, DOC, ODT, TXT, HTML, RTF, XLSX, XLS, CSV, PPTX, PPT | Also includes HTM, ODS, and ODP | LibreOffice, if installed |

The renderer's format list is a UI allow-list, not a guarantee that every pair is valid. FFmpeg determines media codec/container compatibility, and LibreOffice determines document conversion compatibility.

## Conversion Flow

1. The user selects a category on the home page.
2. The renderer initializes the first two formats in that category.
3. The user chooses a file. The main process opens a native picker using category-specific filters.
4. The renderer detects a known source extension from the selected file name.
5. The renderer validates that a file exists and that source and destination formats differ.
6. The renderer invokes `convert-file` through the preload bridge.
7. The main process validates the request, checks the input path, creates a unique path in Downloads, and runs the category converter.
8. The main process emits progress messages where supported.
9. The renderer displays the result path/name and can open the file or reveal it in its folder.

All normal conversion outputs are created in the user's Downloads directory. The output name is based on the input base name and the lowercase destination extension.

## IPC Contract

IPC channel names are part of the internal API. Keep the names synchronized across main, preload, and renderer code.

| Channel | Direction | Payload | Result |
| --- | --- | --- | --- |
| `select-file` | renderer -> main | `FileType` | `string \| null` |
| `save-file` | renderer -> main | default file name | `string \| null` |
| `convert-file` | renderer -> main | `ConversionRequest` | `ConversionResult` |
| `cancel-conversion` | renderer -> main | none | `boolean` |
| `open-file` | renderer -> main | absolute file path | `boolean` |
| `open-folder` | renderer -> main | absolute file path | `boolean` |
| `conversion-progress` | main -> renderer | `{ progress: number; message: string }` | event |

`ConversionRequest`:

```ts
{
	inputPath: string;
	fileType: 'image' | 'video' | 'audio' | 'document';
	fromFormat: string;
	toFormat: string;
}
```

`ConversionResult`:

```ts
{
	success: boolean;
	outputPath?: string;
	outputName?: string;
	error?: string;
}
```

## Security and Boundary Rules

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- The renderer must not gain direct access to Node.js, Electron, `fs`, `path`, or child processes.
- New privileged operations should be implemented as narrowly scoped IPC handlers and exposed as typed preload methods.
- External HTTP(S) links are opened with `shell.openExternal`; unexpected navigation is blocked.
- Any new path supplied by the renderer must be validated in the main process before use.
- Avoid passing arbitrary executable paths or shell command strings from the renderer.
- Keep `asar` packaging and the configured Electron fuses intact unless a packaging requirement justifies changing them.

## Known Limitations

- `saveAs` in `src/renderer.tsx` opens the output folder after the Save dialog returns; it does not copy the converted file to the selected destination. Implementing Save As requires a new main-process file-copy IPC operation or equivalent privileged operation.
- `cancel-conversion` only tracks and kills FFmpeg processes. Image conversion and LibreOffice conversion are not registered in `activeProcesses` and cannot currently be cancelled reliably.
- FFmpeg progress is intentionally a smooth visual estimate capped below 100 until the process closes; it is not a true percentage of total media duration.
- The current FFmpeg path is hard-coded to a Windows installation in `src/main.ts`; the `ffmpeg-static` dependency is present but is not currently used by the main process.
- Although Electron itself can target multiple platforms, the current FFmpeg and LibreOffice discovery code is Windows-specific. Cross-platform conversion requires platform-aware executable resolution.
- The renderer offers formats that may not work for every input/output pair. There is no capability probe or compatibility matrix.
- Document output relies on LibreOffice's `--convert-to` filter names and behavior. Installation, version, permissions, and format support can vary by machine.
- Document conversion does not currently use the same active-process cancellation map as FFmpeg.
- There are no automated tests, no typecheck script, and no CI workflow in the repository.
- `src/main.ts` has a development-only DevTools opening condition based on the Vite dev-server URL. Keep this in mind when diagnosing the development window.

## Troubleshooting

### Documents fail to convert

Install LibreOffice and verify that `soffice.exe` exists in one of the paths listed in [Requirements](#requirements). Restart the app after installation.

### Media conversion fails

Inspect the terminal output from `npm start`. Confirm that FFmpeg exists at the `ffmpegPath` configured in `src/main.ts`. The main process returns the last useful FFmpeg stderr line. Also check that the selected file is valid and that the requested container/codec combination is supported by FFmpeg.

### The app opens but the UI is blank

Check the Vite renderer output and browser DevTools. Confirm that `src/renderer.tsx` imports `src/index.css`, that the preload script is built, and that `window.electronAPI` is available before invoking renderer actions.

### A generated file is missing

Check the user's Downloads directory. The app always chooses a unique path there before conversion. For document conversions, LibreOffice may use a filter-specific output extension; `convertDocument` expects the generated file to match the requested target before renaming it.

## Recommended Change Workflow

For any feature or bug fix:

1. Identify whether the behavior belongs to the renderer, preload bridge, or main process.
2. Preserve the renderer/main security boundary.
3. Update the TypeScript contract in `src/global.d.ts` when an IPC method changes.
4. Update both UI format lists and backend validation when adding a format.
5. Run `npm run lint`.
6. Run `npm start` and manually exercise the affected workflow, including cancellation and error paths when relevant.
7. For packaging-related changes, run `npm run package` or `npm run make`.

Do not silently broaden scope into unrelated UI refactors, dependency upgrades, or converter rewrites.

## Instructions for AI Coding Assistants

Use this README as the project orientation document. Before editing:

- Read the relevant nearby code, especially `src/main.ts`, `src/preload.ts`, `src/global.d.ts`, and `src/renderer.tsx`.
- Treat the main process as the owner of filesystem and process operations.
- Prefer the smallest change that preserves the existing IPC API and UI workflow.
- Check whether a requested format is actually supported by Sharp, FFmpeg, or LibreOffice before advertising it in the UI.
- Keep types duplicated across main/preload/renderer synchronized, or centralize them carefully without weakening the Electron boundary.
- Do not solve Save As by writing files from the renderer.
- Do not claim that a conversion is local if a future change introduces a remote service.
- When reporting work, mention files changed, commands run, and any limitation that remains.

When implementing a new conversion backend, add or update all of the following as appropriate:

1. Renderer category/format options.
2. Main-process file filters.
3. Main-process conversion dispatch and implementation.
4. Progress and cancellation behavior.
5. Preload and global TypeScript contracts if IPC changes.
6. Error messages and troubleshooting documentation.
7. Manual or automated validation for success, failure, and missing dependency cases.

## License

The package declares the MIT license. See `package.json` for the current package metadata.
