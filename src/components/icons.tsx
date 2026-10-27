import type { ReactNode } from 'react';

/** Tiny inline stroke icons (24×24), so the app needs no icon font or network. */
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconBack = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const IconUndo = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Icon>
);
export const IconRedo = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Icon>
);
export const IconEye = () => (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const IconEyeOff = () => (
  <Icon>
    <path d="M10.6 5.1A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.1 4M6.6 6.6A17 17 0 002 12s3.5 7 10 7a10 10 0 005.4-1.6" />
    <path d="M3 3l18 18" />
  </Icon>
);
export const IconOpacity = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 7h4M12 11h6M12 15h5" />
  </Icon>
);
export const IconMore = () => (
  <Icon>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);
export const IconSelect = () => (
  <Icon>
    <path d="M5 3l14 7-6 2-2 6z" />
  </Icon>
);
export const IconPolygon = () => (
  <Icon>
    <path d="M12 3l8 6-3 11H7L4 9z" />
    <circle cx="12" cy="3" r="1" fill="currentColor" />
  </Icon>
);
export const IconHand = () => (
  <Icon>
    <path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5v-8a1.5 1.5 0 013 0V12M14 11.5V5a1.5 1.5 0 013 0v7.5M17 9.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-1.5a6 6 0 01-4.6-2.1L4 15.5a1.6 1.6 0 012.3-2.2L8 15" />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const IconForward = () => (
  <Icon>
    <rect x="3" y="9" width="10" height="10" rx="1" />
    <rect x="9" y="4" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.35" />
  </Icon>
);
export const IconBackward = () => (
  <Icon>
    <rect x="9" y="4" width="11" height="11" rx="1" />
    <rect x="3" y="9" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.35" />
  </Icon>
);
export const IconToFront = () => (
  <Icon>
    <path d="M12 19V6M7 10l5-5 5 5M5 21h14" />
  </Icon>
);
export const IconToBack = () => (
  <Icon>
    <path d="M12 3v13M7 12l5 5 5-5M5 21h14" />
  </Icon>
);
export const IconCheck = () => (
  <Icon>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const IconPencil = () => (
  <Icon size={18}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13 7l4 4" />
  </Icon>
);
export const IconPlus = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconFit = () => (
  <Icon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);
export const IconDownload = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);
export const IconUpload = () => (
  <Icon>
    <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
  </Icon>
);
export const IconCircle = () => (
  <Icon>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);
export const IconRing = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
  </Icon>
);
