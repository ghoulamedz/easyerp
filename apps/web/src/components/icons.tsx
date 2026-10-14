/** Small inline icon set. No icon library: these are the only glyphs needed. */

type IconProps = { readonly className?: string };

const base = 'size-5 shrink-0';

export function IconGrid({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9.5 12l1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMonitor({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="12" rx="2" />
      <path d="M8.5 20h7M12 16v4" strokeLinecap="round" />
    </svg>
  );
}

export function IconGlobe({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 4l9 16H3l9-16z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconDatabase({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

export function IconServer({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" strokeLinecap="round" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconReceipt({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5L10 21l-2-1.5L6 21V3z" strokeLinejoin="round" />
      <path d="M9.5 8h5M9.5 12h5" strokeLinecap="round" />
    </svg>
  );
}

export function IconSparkles({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" strokeLinejoin="round" />
      <path d="M18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArrow({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCart({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 14l-3 3V17M21 14l-3-3V11M3 10h12M12 16h7" strokeLinecap="round" />
    </svg>
  );
}

export function IconBox({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M21 16V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2z" />
      <path d="M1 16v-3a2 2 0 012-2h16a2 2 0 012 2v3" />
      <path d="M8 16v-4a2 2 0 012-2h4a2 2 0 012 2v4" />
    </svg>
  );
}

export function IconTruck({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M16 8.5l4-4M22 5h-6.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconFileText({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h2M8 17h2M10 13h2M10 17h2" strokeLinecap="round" />
    </svg>
  );
}

export function IconDollar({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10a2 2 0 110-4h.01C12.36 6 16 6.73 19 10" strokeLinecap="round" />
      <path d="M12 13v-6" />
      <path d="M17 8a3.5 3.5 0 00-7 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconFactory({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2 20a2 2 0 002 2h16a2 2 0 002-2V8l-7 5V8l-7 5V8l-7 5V20z" />
      <path d="M12 15l-4-4m0 0l4-4m0 4l4-4" strokeLinecap="round" />
    </svg>
  );
}

export function IconPackage({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M16.5 9.4l-9-5.19A2 2 0 006 3.55V22a2 2 0 001.95 1.8l9-5.19a2 2 0 001.95-1.8v-8.44a2 2 0 00-1.95-1.11z" />
      <path d="M16.5 9.4L19 7" strokeLinecap="round" />
      <path d="M2 10h20" />
      <path d="M2 14h20" />
      <path d="M2 18h20" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="10" r="5" />
      <path d="M12 18c.6 0 1.3.1 1.8.3" />
      <path d="M14.3 20l-1-2.6L12 19" strokeLinecap="round" />
      <path d="M12 20l1-2.4L13.7 20" strokeLinecap="round" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="9" cy="8" r="4" />
      <path d="M16 11c-1.1 0-2 .9-2 2v5l-4 2-4-2v-5c0-1.1.9-2 2-2" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

export function IconKey({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M22 11a9 9 0 01-9 9c-4 0-8-3-8-8a8 8 0 1114-3.8z" />
      <path d="M16 2l4 4" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2.1 11.5c3.5-3.5 8.5-3.5 12 0s8.5 3.5 12 0" strokeLinecap="round" />
      <circle cx="12" cy="11.5" r="3" />
    </svg>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M17.9 17.9A10 10 0 012.1 2.1" strokeLinecap="round" />
      <path d="M2.1 11.5c3.5-3.5 8.5-3.5 12 0s8.5 3.5 12 0" strokeLinecap="round" />
      <circle cx="12" cy="11.5" r="3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPrinter({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
      <path d="M6 15H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="1" width="12" height="5" rx="1" />
    </svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M10.288 16.24l-6.806 2.063a1 1 0 0 1-1.186-1.097L7.447 7.94a1 1 0 0 1 .974-.752h.011c.513 0 1.018.165 1.44.47l4.593 3.354a1 1 0 0 1 .062 1.553l-3.249 2.681a1 1 0 0 0-.017 1.431z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15v-3" strokeLinecap="round" />
      <circle cx="12" cy="18.83" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg className={className ?? base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}