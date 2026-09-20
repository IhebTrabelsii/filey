import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { createRoot } from 'react-dom/client';

import logo from '../assets/image.png';

import './index.css';

/* ============================================================
   TYPES + DATA
============================================================ */

type FileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document';

type Page =
  | 'home'
  | 'converter'
  | 'editor'
  | 'processing'
  | 'result';

type Dir = 'forward' | 'back';
type Wipe = 'idle' | 'cover' | 'reveal';
type SplashState = 'show' | 'exit' | 'gone';
type ResizeMode = 'size' | 'percent' | 'social';

interface RecentEntry {
  outputName: string;
  fromFormat: string;
  toFormat: string;
  timestamp: number;
  folder: string;
}

interface ImageInfo {
  width: number;
  height: number;
}

const RECENT_KEY = 'filey:recent';
const RECENT_MAX = 8;

const formats: Record<FileType, string[]> = {
  image: ['PNG', 'JPG', 'WEBP', 'AVIF', 'TIFF'],
  video: ['MP4', 'MOV', 'AVI', 'MKV', 'WEBM', 'M4V'],
  audio: ['MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A'],
  document: [
    'PDF',
    'DOCX',
    'DOC',
    'ODT',
    'TXT',
    'HTML',
    'RTF',
    'XLSX',
    'XLS',
    'CSV',
    'PPTX',
    'PPT',
  ],
};

const categories: {
  type: FileType;
  title: string;
  formats: string;
}[] = [
  { type: 'image', title: 'Images', formats: 'PNG, JPG, WEBP, AVIF' },
  { type: 'video', title: 'Videos', formats: 'MP4, MOV, AVI, MKV' },
  { type: 'audio', title: 'Audio', formats: 'MP3, WAV, FLAC, M4A' },
  { type: 'document', title: 'Documents', formats: 'PDF, DOCX, XLSX, PPTX' },
];

const STEP: Record<Page, number> = {
  home: 0,
  converter: 1,
  editor: 1,
  processing: 2,
  result: 3,
};

const SPLASH_MS = 3600;
const SPLASH_EXIT_MS = 1100;
const COVER_MS = 440;
const REVEAL_MS = 560;

const SOCIAL_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Instagram Square', w: 1080, h: 1080 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Twitter Post', w: 1600, h: 900 },
  { label: 'YouTube Thumbnail', w: 1280, h: 720 },
  { label: 'Facebook Post', w: 1200, h: 630 },
  { label: 'LinkedIn Post', w: 1200, h: 627 },
];

const vars = (values: Record<string, string | number>) =>
  values as React.CSSProperties;

/* ============================================================
   ICONS
============================================================ */

type IconName =
  | FileType
  | 'back'
  | 'upload'
  | 'file'
  | 'folder'
  | 'open'
  | 'stop'
  | 'arrow'
  | 'save'
  | 'clock'
  | 'edit';

const iconPaths: Record<IconName, React.ReactNode> = {
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="9" cy="10.2" r="1.5" />
      <path d="M4 17l4.5-4 3.5 3 3-2.5L20 17" />
    </>
  ),
  video: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M10.5 9.3v5.4l4.3-2.7z" />
    </>
  ),
  audio: <path d="M4.5 10v4M8.25 6.5v11M12 3.5v17M15.75 7.5v9M19.5 10v4" />,
  document: (
    <>
      <path d="M6.5 3.5h7.2l3.8 3.8v13.2h-11z" />
      <path d="M13.5 3.7v4h4M9.3 12.5h5.4M9.3 15.5h5.4" />
    </>
  ),
  back: <path d="M20 12H5M10.5 6.5 5 12l5.5 5.5" />,
  arrow: <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />,
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />,
  file: (
    <>
      <path d="M6.5 3.5h7.2l3.8 3.8v13.2h-11z" />
      <path d="M13.5 3.7v4h4M9.5 14l2 2 3.5-4" />
    </>
  ),
  folder: (
    <path d="M3.5 7v10.5a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1h-8l-2-2.5h-5a1 1 0 0 0-1 1z" />
  ),
  open: (
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10" />
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  save: (
    <path d="M6 4.5h9l3.5 3.5v11.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-14.5A.5.5 0 0 1 6 4.5zM8.5 4.5v4h6v-4M8 14h8M8 17h5" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  edit: (
    <path d="M4 20l4-1L18 9l-3-3L5 16zM14 6l3 3M13.5 4.5l3 3" />
  ),
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

/* ============================================================
   BUTTONS
============================================================ */

interface BtnProps {
  children: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'text';
  icon?: IconName;
  full?: boolean;
  stop?: boolean;
}

function Btn({
  children,
  onClick,
  variant = 'primary',
  icon,
  full,
  stop,
}: BtnProps) {
  const className = [
    'btn',
    `btn--${variant}`,
    full && 'btn--full',
    stop && 'btn--stop',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      data-glow
      onClick={onClick}
    >
      <span className="btn__face" aria-hidden="true" />

      <span className="roll" data-text={children}>
        <span>{children}</span>
      </span>

      {icon && (
        <span className="swap" aria-hidden="true">
          <Icon name={icon} size={16} />
          <Icon name={icon} size={16} />
        </span>
      )}
    </button>
  );
}

function BackBtn({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="back" onClick={onClick}>
      <span className="swap swap--rev" aria-hidden="true">
        <Icon name="back" size={16} />
        <Icon name="back" size={16} />
      </span>

      <span className="roll" data-text={label}>
        <span>{label}</span>
      </span>
    </button>
  );
}

/* ============================================================
   FORMAT CHIPS
============================================================ */

function Chips({
  tone,
  label,
  value,
  options,
  onChange,
}: {
  tone: 'from' | 'to';
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={`plate plate--${tone}`}>
      <span className="label">{label}</span>

      <div className="chips" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            className={`chip${option === value ? ' is-on' : ''}`}
            data-glow
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   RECENT STORAGE
============================================================ */

function loadRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is RecentEntry =>
        typeof entry?.outputName === 'string' &&
        typeof entry?.fromFormat === 'string' &&
        typeof entry?.toFormat === 'string' &&
        typeof entry?.timestamp === 'number' &&
        typeof entry?.folder === 'string',
    );
  } catch {
    return [];
  }
}

function saveRecent(entries: RecentEntry[]): void {
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(entries.slice(0, RECENT_MAX)),
    );
  } catch {
    /* ignore */
  }
}

function pushRecent(entry: RecentEntry): RecentEntry[] {
  const current = loadRecent();

  const next = [
    entry,
    ...current.filter(
      (item) =>
        item.outputName !== entry.outputName ||
        item.timestamp !== entry.timestamp,
    ),
  ].slice(0, RECENT_MAX);

  saveRecent(next);

  return next;
}

/* ============================================================
   TITLE BAR
============================================================ */

function TitleBar({
  step,
  ready,
  maximized,
}: {
  step: number;
  ready: boolean;
  maximized: boolean;
}) {
  const api = window.electronAPI;

  return (
    <div className="titlebar">
      <div className={`tb__brand${ready ? ' is-on' : ''}`}>
        <img src={logo} alt="" />
        <span>Filey</span>
      </div>

      <div className={`tb__steps${ready ? ' is-on' : ''}`} aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <i
            key={index}
            className={
              index === step
                ? 'is-active'
                : index < step
                  ? 'is-done'
                  : ''
            }
          />
        ))}
      </div>

      <div className="tb__controls">
        <button
          type="button"
          className="wc"
          aria-label="Minimize"
          onClick={() => void api.minimizeWindow()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M1 5h8" />
          </svg>
        </button>

        <button
          type="button"
          className="wc"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void api.toggleMaximizeWindow()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            {maximized ? (
              <>
                <path d="M3 3V1.5h5.5V7H7" />
                <rect x="1.5" y="3" width="5.5" height="5.5" />
              </>
            ) : (
              <rect x="1.5" y="1.5" width="7" height="7" />
            )}
          </svg>
        </button>

        <button
          type="button"
          className="wc wc--close"
          aria-label="Close"
          onClick={() => void api.closeWindow()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   SPLASH
============================================================ */

function Splash({
  leaving,
  onSkip,
}: {
  leaving: boolean;
  onSkip: () => void;
}) {
  return (
    <div
      className={`splash${leaving ? ' is-leaving' : ''}`}
      onClick={onSkip}
    >
      <div className="splash__half splash__half--l" />
      <div className="splash__half splash__half--r" />

      <div className="splash__scene">
        <span className="splash__glow" />

        <div className="splash__stage">
          <span className="splash__line" />

          <div
            className="splash__mark"
            style={vars({ '--logo': `url("${logo}")` })}
          >
            <img src={logo} alt="Filey" />
            <span className="splash__sheen" />
          </div>
        </div>

        <h1 className="splash__word" aria-label="Filey">
          {'Filey'.split('').map((letter, index) => (
            <span key={index} style={vars({ '--i': index })}>
              {letter}
            </span>
          ))}
        </h1>
      </div>

      <span className="splash__bar splash__bar--t" />
      <span className="splash__bar splash__bar--b" />
    </div>
  );
}
/* ============================================================
   SUPPORT MODAL (first-launch only)
============================================================ */

const SUPPORT_SEEN_KEY = 'filey:support-seen';
const SUPPORT_URL = 'https://buymeacoffee.com/ihebtrabel1';

function SupportModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const support = async () => {
    await window.electronAPI.openExternal(SUPPORT_URL);
    onClose();
  };

  return (
    <div
      className="support"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-title"
      onClick={onClose}
    >
      <div
        className="support__card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="support__seal" aria-hidden="true">
          ☕
        </div>

        <h2
          id="support-title"
          className="support__title"
        >
          Filey is free
        </h2>

        <p className="support__text">
          No ads, no paywalls, no accounts.
          If it saves you time, consider
          buying me a coffee.
        </p>

        <div className="support__actions">
          <button
            type="button"
            className="support__btn support__btn--yes"
            data-glow
            onClick={() => void support()}
          >
            ☕ Buy me a coffee
          </button>

          <button
            type="button"
            className="support__btn support__btn--later"
            onClick={onClose}
          >
            Maybe later
          </button>
        </div>

        <p className="support__hint">
          This message appears once.
        </p>
      </div>
    </div>
  );
}
/* ============================================================
   APP
============================================================ */

function App() {
  const [splash, setSplash] = useState<SplashState>('show');
const [showSupport, setShowSupport] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [wipe, setWipe] = useState<Wipe>('idle');
  const [dir, setDir] = useState<Dir>('forward');
  const [base, setBase] = useState(520);

  const [maximized, setMaximized] = useState(false);

  const [fileType, setFileType] = useState<FileType | null>(null);
  const [fromFormat, setFromFormat] = useState('');
  const [toFormat, setToFormat] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [outputName, setOutputName] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [imageScale, setImageScale] = useState(1);
  const [imageQuality, setImageQuality] = useState(90);

  const [isDragging, setIsDragging] = useState(false);

  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const [savedTo, setSavedTo] = useState('');

  /* ---------- Editor state ---------- */

  const [editorMode, setEditorMode] = useState<ResizeMode>('size');
  const [editorWidth, setEditorWidth] = useState('');
  const [editorHeight, setEditorHeight] = useState('');
  const [editorPercent, setEditorPercent] = useState('100');
  const [editorLockAspect, setEditorLockAspect] = useState(true);
  const [editorSource, setEditorSource] = useState<ImageInfo | null>(null);
  const [editorTargetSize, setEditorTargetSize] = useState('');
  const [editorTargetUnit, setEditorTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [editorFormat, setEditorFormat] = useState('png');
  const [editorDragging, setEditorDragging] = useState(false);

  const runId = useRef(0);
  const coverTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);

  /* ---------- Splash timeline ---------- */

  useEffect(() => {
    if (splash === 'show') {
      const timer = window.setTimeout(
        () => setSplash('exit'),
        SPLASH_MS,
      );
      return () => window.clearTimeout(timer);
    }

    if (splash === 'exit') {
      const timer = window.setTimeout(
        () => setSplash('gone'),
        SPLASH_EXIT_MS,
      );
      return () => window.clearTimeout(timer);
    }
  }, [splash]);

  const skipSplash = () => {
    setSplash((current) => (current === 'show' ? 'exit' : current));
  };

  useEffect(() => {
    setRecent(loadRecent());
  }, []);
/* ---------- First-launch support modal ---------- */

useEffect(() => {
  try {
    const seen = window.localStorage.getItem(SUPPORT_SEEN_KEY);

    if (!seen) {
      setShowSupport(true);
    }
  } catch {
    /* ignore — if storage is blocked, don't nag */
  }
}, []);

const dismissSupport = () => {
  try {
    window.localStorage.setItem(SUPPORT_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }

  setShowSupport(false);
};
  const go = useCallback(
    (next: Page, direction: Dir = 'forward', beforeSwap?: () => void) => {
      window.clearTimeout(coverTimer.current);
      window.clearTimeout(idleTimer.current);

      setDir(direction);
      setWipe('cover');

      coverTimer.current = window.setTimeout(() => {
        beforeSwap?.();
        setPage(next);
        setBase(120);
        setWipe('reveal');

        idleTimer.current = window.setTimeout(
          () => setWipe('idle'),
          REVEAL_MS,
        );
      }, COVER_MS);
    },
    [],
  );

  useEffect(() => {
    void window.electronAPI
      .isWindowMaximized()
      .then(setMaximized);

    return window.electronAPI.onWindowMaximized(setMaximized);
  }, []);

  useEffect(() => {
    let frame = 0;

    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        const target = (event.target as Element | null)?.closest<HTMLElement>(
          '[data-glow]',
        );

        if (!target) {
          return;
        }

        const rect = target.getBoundingClientRect();

        target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        target.style.setProperty('--my', `${event.clientY - rect.top}px`);
      });
    };

    window.addEventListener('mousemove', onMove);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  useEffect(() => {
    return window.electronAPI.onProgress((data) => {
      setProgress(data.progress);
      setStatus(data.message);
    });
  }, []);

  useEffect(() => {
    const prevent = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);

    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  /* ---------- Shared file accept ---------- */

  const applyImageInfo = async (path: string) => {
    const info = await window.electronAPI.getImageInfo(path);

    if (info) {
      setEditorSource(info);
      setEditorWidth(String(info.width));
      setEditorHeight(String(info.height));
    }
  };

  /* ---------- Actions ---------- */

  const selectCategory = (type: FileType) => {
    const available = formats[type];

    setFileType(type);
    setFromFormat(available[0]);
    setToFormat(available[1]);
    setFilePath('');
    setFileName('');
    setError('');
    setImageScale(1);
    setImageQuality(90);

    go('converter', 'forward');
  };

  const acceptFile = (selected: string) => {
    if (!fileType) {
      return;
    }

    const name = selected.split(/[\\/]/).pop() ?? '';

    setFilePath(selected);
    setFileName(name);

    const extension = name.split('.').pop()?.toUpperCase();

    if (extension && formats[fileType].includes(extension)) {
      setFromFormat(extension);
    }

    if (fileType === 'image') {
      const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
      setEditorFormat(ext);
      void applyImageInfo(selected);
    }

    setError('');
  };

  const selectFile = async () => {
    if (!fileType) {
      return;
    }

    const selected = await window.electronAPI.selectFile(fileType);

    if (!selected) {
      return;
    }

    acceptFile(selected);
  };

  const onDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (!fileType) {
      return;
    }

    const files = event.dataTransfer?.files;

    if (!files || files.length === 0) {
      return;
    }

    const path = window.electronAPI.getPathForFile(files[0]);

    if (!path) {
      setError('Could not read the dropped file path.');
      return;
    }

    acceptFile(path);
  };

  /* ---------- Editor file picker ---------- */

  const selectEditorFile = async () => {
    const selected = await window.electronAPI.selectFile('image');

    if (!selected) {
      return;
    }

    const name = selected.split(/[\\/]/).pop() ?? '';

    setFilePath(selected);
    setFileName(name);
    setError('');

    const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
    setEditorFormat(ext);

    await applyImageInfo(selected);
  };

  const onEditorDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setEditorDragging(true);
  };

  const onEditorDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setEditorDragging(false);
  };

  const onEditorDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setEditorDragging(false);

    const files = event.dataTransfer?.files;

    if (!files || files.length === 0) {
      return;
    }

    const path = window.electronAPI.getPathForFile(files[0]);

    if (!path) {
      setError('Could not read the dropped file path.');
      return;
    }

    const name = path.split(/[\\/]/).pop() ?? '';

    setFilePath(path);
    setFileName(name);
    setError('');

    const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
    setEditorFormat(ext);

    void applyImageInfo(path);
  };

  /* ---------- Width / height inputs with aspect lock ---------- */

  const setWidthFromInput = (value: string) => {
    setEditorWidth(value);

    if (
      editorLockAspect &&
      editorSource &&
      editorSource.width > 0 &&
      editorSource.height > 0
    ) {
      const w = Number(value);

      if (Number.isFinite(w) && w > 0) {
        const ratio = editorSource.height / editorSource.width;
        setEditorHeight(String(Math.max(1, Math.round(w * ratio))));
      }
    }
  };

  const setHeightFromInput = (value: string) => {
    setEditorHeight(value);

    if (
      editorLockAspect &&
      editorSource &&
      editorSource.width > 0 &&
      editorSource.height > 0
    ) {
      const h = Number(value);

      if (Number.isFinite(h) && h > 0) {
        const ratio = editorSource.width / editorSource.height;
        setEditorWidth(String(Math.max(1, Math.round(h * ratio))));
      }
    }
  };

  /* ---------- Editor EXPORT ---------- */

  const exportImage = async () => {
    if (!filePath) {
      setError('Choose an image first.');
      return;
    }

    setError('');
    setSavedTo('');
    setProgress(0);
    setStatus('Preparing your image...');

    const id = ++runId.current;

    go('processing', 'forward');

    const targetBytes = (() => {
      const raw = editorTargetSize.trim();

      if (!raw) {
        return 0;
      }

      const n = Number(raw);

      if (!Number.isFinite(n) || n <= 0) {
        return 0;
      }

      return editorTargetUnit === 'MB'
        ? Math.round(n * 1024 * 1024)
        : Math.round(n * 1024);
    })();

    const request = {
      inputPath: filePath,
      mode: editorMode,
      width:
        editorWidth.trim() !== '' ? Number(editorWidth) : undefined,
      height:
        editorHeight.trim() !== '' ? Number(editorHeight) : undefined,
      percent:
        editorPercent.trim() !== ''
          ? Number(editorPercent)
          : undefined,
      lockAspect: editorLockAspect,
      targetBytes: targetBytes > 0 ? targetBytes : undefined,
      targetFormat: editorFormat,
    };

    const result = await window.electronAPI.exportImage(request);

    if (id !== runId.current) {
      return;
    }

    if (!result.success) {
      setError(result.error ?? 'Image export failed.');
      go('editor', 'back');
      return;
    }

    setProgress(100);
    setStatus('Image ready');
    setOutputPath(result.outputPath ?? '');
    setOutputName(result.outputName ?? '');

    window.setTimeout(() => {
      if (id === runId.current) {
        go('result', 'forward');
      }
    }, 600);
  };

  /* ---------- Convert (non-editor) ---------- */

  const convert = async () => {
    if (!fileType) {
      return;
    }

    if (!filePath) {
      setError('Select a file first.');
      return;
    }

    if (fromFormat === toFormat) {
      setError('Choose two different formats.');
      return;
    }

    setError('');
    setSavedTo('');
    setProgress(0);
    setStatus('Preparing your file...');

    const id = ++runId.current;

    go('processing', 'forward');

    const result = await window.electronAPI.convertFile({
      inputPath: filePath,
      fileType,
      fromFormat,
      toFormat,
      imageOptions:
        fileType === 'image'
          ? {
              scale: imageScale,
              quality: imageQuality,
            }
          : undefined,
    });

    if (id !== runId.current) {
      return;
    }

    if (!result.success) {
      setError(result.error ?? 'Conversion failed.');
      go('converter', 'back');
      return;
    }

    setProgress(100);
    setStatus('Conversion complete');
    setOutputPath(result.outputPath ?? '');
    setOutputName(result.outputName ?? '');

    window.setTimeout(() => {
      if (id === runId.current) {
        go('result', 'forward');
      }
    }, 600);
  };

  const cancel = async () => {
    runId.current += 1;

    await window.electronAPI.cancelConversion();

    setProgress(0);
    setStatus('');
    setError('Conversion stopped.');

    go('converter', 'back');
  };

  const editConversion = () => {
    setProgress(0);
    setStatus('');
    setError('');
    setSavedTo('');

    go('converter', 'back');
  };

  const reset = () => {
    go('home', 'back', () => {
      setFileType(null);
      setFilePath('');
      setFileName('');
      setOutputPath('');
      setOutputName('');
      setFromFormat('');
      setToFormat('');
      setProgress(0);
      setStatus('');
      setError('');
      setSavedTo('');
      setImageScale(1);
      setImageQuality(90);
      setEditorSource(null);
      setEditorWidth('');
      setEditorHeight('');
      setEditorPercent('100');
      setEditorTargetSize('');
      setEditorMode('size');
    });
  };

  /* ---------- Result actions ---------- */

  const saveAs = async () => {
    if (!outputPath || !outputName) {
      return;
    }

    const destination = await window.electronAPI.saveFile(outputName);

    if (!destination) {
      return;
    }

    const ok = await window.electronAPI.saveOutput(
      outputPath,
      destination,
    );

    if (ok) {
      setSavedTo(destination);

      const folder = destination.replace(/[\\/][^\\/]*$/, '');

      const next = pushRecent({
        outputName,
        fromFormat: fileType === 'image' && !fromFormat ? editorFormat.toUpperCase() : fromFormat,
        toFormat: fileType === 'image' && !toFormat ? editorFormat.toUpperCase() : toFormat,
        timestamp: Date.now(),
        folder,
      });

      setRecent(next);
    } else {
      setError('Could not save the file.');
    }
  };

  const discardOutput = async () => {
    if (outputPath) {
      await window.electronAPI.discardOutput(outputPath);
    }

    reset();
  };

  const openFile = async () => {
    if (!savedTo) {
      return;
    }

    await window.electronAPI.openFile(savedTo);
  };

  const openFolder = async () => {
    if (!savedTo) {
      return;
    }

    await window.electronAPI.openFolder(savedTo);
  };

  const openRecentFolder = async (entry: RecentEntry) => {
    await window.electronAPI.openFolder(entry.folder);
  };

  const startEditor = () => {
    setEditorSource(null);
    setEditorWidth('');
    setEditorHeight('');
    setEditorPercent('100');
    setEditorTargetSize('');
    setEditorMode('size');
    setEditorLockAspect(true);
    setEditorFormat('png');
    setFilePath('');
    setFileName('');
    setError('');

    go('editor', 'forward');
  };

  /* ---------- Pages ---------- */

  const category = categories.find((item) => item.type === fileType);
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  const circumference = 2 * Math.PI * 84;

  let content: React.ReactNode = null;

  if (page === 'home') {
    content = (
      <section className="home">
        <h1 className="display rise" style={vars({ '--i': 0 })}>
          What would you like to convert?
        </h1>

        <ul className="index">
          {categories.map((item, index) => (
            <li
              key={item.type}
              className="rise"
              style={vars({ '--i': index + 1 })}
            >
              <button
                type="button"
                className="row"
                data-glow
                onClick={() => selectCategory(item.type)}
              >
                <span className="row__icon">
                  <Icon name={item.type} size={24} />
                </span>

                <span className="row__name">{item.title}</span>

                <span className="row__fmts">{item.formats}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="foot rise" style={vars({ '--i': 5 })}>
          Files stay on this computer.
        </p>

        {recent.length > 0 && (
          <div className="recent rise" style={vars({ '--i': 6 })}>
            <button
              type="button"
              className="recent__toggle"
              onClick={() => setShowRecent((value) => !value)}
            >
              <Icon name="clock" size={14} />
              <span>
                {showRecent
                  ? 'Hide recent'
                  : `Recent (${recent.length})`}
              </span>
            </button>

            {showRecent && (
              <ul className="recent__list">
                {recent.map((entry) => (
                  <li key={`${entry.outputName}-${entry.timestamp}`}>
                    <button
                      type="button"
                      className="recent__item"
                      onClick={() => void openRecentFolder(entry)}
                    >
                      <span className="recent__name">
                        {entry.outputName}
                      </span>

                      <span className="recent__meta">
                        {entry.fromFormat} → {entry.toFormat}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    );
  } else if (page === 'converter' && fileType && category) {
    content = (
      <section className="conv">
        <div className="topline rise" style={vars({ '--i': 0 })}>
          <BackBtn label="Categories" onClick={reset} />

          {fileType === 'image' && (
            <button
              type="button"
              className="editbtn"
              data-glow
              onClick={startEditor}
            >
              <Icon name="edit" size={14} />
              <span>Edit image</span>
            </button>
          )}
        </div>

        <div className="conv__main">
          <header className="conv__head rise" style={vars({ '--i': 1 })}>
            <span className="conv__icon">
              <Icon name={fileType} size={24} />
            </span>

            <h1 className="display">
              Convert {category.title.toLowerCase()}
            </h1>
          </header>

          <div className="plates rise" style={vars({ '--i': 2 })}>
            <Chips
              tone="from"
              label="From"
              value={fromFormat}
              options={formats[fileType]}
              onChange={setFromFormat}
            />

            <div className="plates__mid" aria-hidden="true">
              <span>
                <Icon name="arrow" size={16} />
              </span>
            </div>

            <Chips
              tone="to"
              label="To"
              value={toFormat}
              options={formats[fileType]}
              onChange={setToFormat}
            />
          </div>

          <div className="rise" style={vars({ '--i': 3 })}>
            <button
              type="button"
              className={`file${fileName ? ' is-set' : ''}${
                isDragging ? ' is-drag' : ''
              }`}
              data-glow
              onClick={selectFile}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <span className="file__icon">
                <Icon name={fileName ? 'file' : 'upload'} size={20} />
              </span>

              <span className="file__text">
                <span className="file__title">
                  {fileName || 'Select a file'}
                </span>

                <span className="file__hint">
                  {fileName
                    ? 'Change file'
                    : 'Click or drop a file here'}
                </span>
              </span>
            </button>

            {error && (
              <div className="notice" role="alert" key={error}>
                {error}
              </div>
            )}
          </div>

          <div className="cta rise" style={vars({ '--i': 4 })}>
            <Btn full onClick={convert}>
              {`Convert to ${toFormat}`}
            </Btn>
          </div>
        </div>
      </section>
    );
  } else if (page === 'editor') {
    content = (
      <section className="conv">
        <div className="topline rise" style={vars({ '--i': 0 })}>
          <BackBtn label="Categories" onClick={reset} />
        </div>

        <div className="conv__main">
          <header className="conv__head rise" style={vars({ '--i': 1 })}>
            <span className="conv__icon">
              <Icon name="edit" size={24} />
            </span>

            <h1 className="display">
              Edit image
            </h1>
          </header>

          {/* ---- file picker ---- */}
          <div className="rise" style={vars({ '--i': 2 })}>
            <button
              type="button"
              className={`file${fileName ? ' is-set' : ''}${
                editorDragging ? ' is-drag' : ''
              }`}
              data-glow
              onClick={selectEditorFile}
              onDragOver={onEditorDragOver}
              onDragLeave={onEditorDragLeave}
              onDrop={onEditorDrop}
            >
              <span className="file__icon">
                <Icon name={fileName ? 'file' : 'upload'} size={20} />
              </span>

              <span className="file__text">
                <span className="file__title">
                  {fileName || 'Choose an image'}
                </span>

                <span className="file__hint">
                  {editorSource
                    ? `${editorSource.width} × ${editorSource.height} px`
                    : 'Click or drop an image here'}
                </span>
              </span>
            </button>
          </div>

          {/* ---- resize settings ---- */}
          {fileName && (
            <>
              <div
                className="editor__section rise"
                style={vars({ '--i': 3 })}
              >
                <h2 className="editor__title">Resize settings</h2>

                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Resize mode"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === 'size'}
                    className={`tab${editorMode === 'size' ? ' is-on' : ''}`}
                    onClick={() => setEditorMode('size')}
                  >
                    By Size
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === 'percent'}
                    className={`tab${editorMode === 'percent' ? ' is-on' : ''}`}
                    onClick={() => setEditorMode('percent')}
                  >
                    As Percentage
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === 'social'}
                    className={`tab${editorMode === 'social' ? ' is-on' : ''}`}
                    onClick={() => setEditorMode('social')}
                  >
                    Social Media
                  </button>
                </div>

                {editorMode === 'size' && (
                  <div className="fieldrow">
                    <label className="field">
                      <span className="label">Width (px)</span>
                      <input
                        type="number"
                        min={1}
                        value={editorWidth}
                        onChange={(e) => setWidthFromInput(e.target.value)}
                        placeholder="Auto"
                      />
                    </label>

                    <label className="field">
                      <span className="label">Height (px)</span>
                      <input
                        type="number"
                        min={1}
                        value={editorHeight}
                        onChange={(e) => setHeightFromInput(e.target.value)}
                        placeholder="Auto"
                      />
                    </label>

                    <label className="checkrow">
                      <input
                        type="checkbox"
                        checked={editorLockAspect}
                        onChange={(e) => setEditorLockAspect(e.target.checked)}
                      />
                      <span>Lock aspect ratio</span>
                    </label>
                  </div>
                )}

                {editorMode === 'percent' && (
                  <div className="fieldrow">
                    <label className="field">
                      <span className="label">Percentage</span>
                      <input
                        type="number"
                        min={10}
                        max={400}
                        value={editorPercent}
                        onChange={(e) => setEditorPercent(e.target.value)}
                        placeholder="100"
                      />
                    </label>
                  </div>
                )}

                {editorMode === 'social' && (
                  <div className="presets">
                    {SOCIAL_PRESETS.map((preset) => {
                      const active =
                        Number(editorWidth) === preset.w &&
                        Number(editorHeight) === preset.h;

                      return (
                        <button
                          key={preset.label}
                          type="button"
                          className={`preset${active ? ' is-on' : ''}`}
                          onClick={() => {
                            setEditorWidth(String(preset.w));
                            setEditorHeight(String(preset.h));
                          }}
                        >
                          <span className="preset__label">
                            {preset.label}
                          </span>
                          <span className="preset__dims">
                            {preset.w} × {preset.h}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ---- export settings ---- */}
              <div
                className="editor__section rise"
                style={vars({ '--i': 4 })}
              >
                <h2 className="editor__title">Export settings</h2>

                <div className="fieldrow">
                  <label className="field">
                    <span className="label">
                      Target file size (optional)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={editorTargetSize}
                      onChange={(e) => setEditorTargetSize(e.target.value)}
                      placeholder="Leave empty"
                    />
                  </label>

                  <label className="field field--narrow">
                    <span className="label">Unit</span>
                    <select
                      value={editorTargetUnit}
                      onChange={(e) =>
                        setEditorTargetUnit(e.target.value as 'KB' | 'MB')
                      }
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                    </select>
                  </label>
                </div>
              </div>

              {error && (
                <div className="notice rise" style={vars({ '--i': 5 })}>
                  {error}
                </div>
              )}

              <div className="cta rise" style={vars({ '--i': 5 })}>
                <Btn full icon="save" onClick={() => void exportImage()}>
                  EXPORT
                </Btn>
              </div>
            </>
          )}

          {!fileName && error && (
            <div className="notice rise" style={vars({ '--i': 3 })}>
              {error}
            </div>
          )}
        </div>
      </section>
    );
  } else if (page === 'processing') {
    content = (
      <section className="busy">
        <div className="orb rise" style={vars({ '--i': 0 })}>
          <svg className="orb__ticks" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="96" />
          </svg>

          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle className="orb__track" cx="100" cy="100" r="84" />
            <circle
              className="orb__fill"
              cx="100"
              cy="100"
              r="84"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percent / 100)}
              transform="rotate(-90 100 100)"
            />
          </svg>

          <div className="orb__mark">
            <img src={logo} alt="" />
          </div>
        </div>

        <div className="pct rise" style={vars({ '--i': 1 })}>
          {percent}
          <span>%</span>
        </div>

        <p
          className="status rise"
          style={vars({ '--i': 2 })}
          aria-live="polite"
        >
          {status}
        </p>

        <p className="job rise" style={vars({ '--i': 3 })}>
          {fileName ? `${fileName}: ` : ''}
          {fromFormat && toFormat
            ? `${fromFormat} to ${toFormat}`
            : 'Resizing image'}
        </p>

        <div className="cta rise" style={vars({ '--i': 4 })}>
          <Btn variant="ghost" stop icon="stop" onClick={cancel}>
            Stop conversion
          </Btn>
        </div>
      </section>
    );
  } else if (page === 'result') {
    content = (
      <section className="done">
        <div className="topline rise" style={vars({ '--i': 0 })}>
          <BackBtn label="Edit conversion" onClick={editConversion} />
        </div>

        <div className="done__body">
          <div className="seal rise" style={vars({ '--i': 1 })}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle
                className="seal__pulse"
                cx="60"
                cy="60"
                r="54"
              />
              <circle
                className="seal__ring"
                cx="60"
                cy="60"
                r="54"
                pathLength={1}
              />
              <path
                className="seal__tick"
                d="M38 61l15 15 30-33"
                pathLength={1}
              />
            </svg>
          </div>

          <h1 className="display rise" style={vars({ '--i': 2 })}>
            Your file is ready
          </h1>

          <div className="output rise" style={vars({ '--i': 3 })}>
            <span className="output__icon">
              <Icon name="file" size={26} />
            </span>

            <span className="output__text">
              <strong>{outputName}</strong>
              <small>
                {savedTo ? savedTo : 'Not saved yet'}
              </small>
            </span>
          </div>

          {error && (
            <div className="notice rise" style={vars({ '--i': 4 })}>
              {error}
            </div>
          )}

          <div className="actions rise" style={vars({ '--i': 4 })}>
            <Btn full icon="save" onClick={() => void saveAs()}>
              {savedTo ? 'Save to another place' : 'Save as…'}
            </Btn>

            {savedTo && (
              <>
                <Btn
                  full
                  variant="ghost"
                  icon="open"
                  onClick={() => void openFile()}
                >
                  Open file
                </Btn>

                <Btn
                  full
                  variant="ghost"
                  icon="folder"
                  onClick={() => void openFolder()}
                >
                  Show in folder
                </Btn>
              </>
            )}

            {!savedTo && (
              <Btn
                full
                variant="ghost"
                onClick={() => void discardOutput()}
              >
                Don't keep it
              </Btn>
            )}
          </div>

          <div className="rise" style={vars({ '--i': 5 })}>
            <Btn variant="text" onClick={reset}>
              Convert another file
            </Btn>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className={`window${maximized ? ' is-max' : ''}`}>
      <TitleBar
        step={STEP[page]}
        ready={splash !== 'show'}
        maximized={maximized}
      />

      {splash !== 'show' && (
        <main className="stage">
          <div
            className="page"
            key={page}
            style={vars({ '--base': `${base}ms` })}
          >
            {content}
          </div>

          <div
            className={`wipe wipe--${wipe} wipe--${dir}`}
            aria-hidden="true"
          />
        </main>
      )}

            {splash !== 'gone' && (
        <Splash leaving={splash === 'exit'} onSkip={skipSplash} />
      )}

      {showSupport && splash === 'gone' && (
        <SupportModal onClose={dismissSupport} />
      )}

      <div className="frame" aria-hidden="true" />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);