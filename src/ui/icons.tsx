import type { SVGProps } from 'react';

/** 20px-grid outline icons drawn with `currentColor`; 1.75px stroke sits well beside 500–600 weight text. */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.5v1.75M10 15.75v1.75M2.5 10h1.75M15.75 10h1.75M4.7 4.7l1.24 1.24M14.06 14.06l1.24 1.24M4.7 15.3l1.24-1.24M14.06 5.94l1.24-1.24" />
    </Icon>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
    </Icon>
  );
}

export function SpeakerOnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.75h2.6L10 4.5v11l-3.9-3.25H3.5Z" />
      <path d="M13 7.25a3.9 3.9 0 0 1 0 5.5M15.3 5a7 7 0 0 1 0 10" />
    </Icon>
  );
}

export function SpeakerOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.75h2.6L10 4.5v11l-3.9-3.25H3.5Z" />
      <path d="M13 8l4 4M17 8l-4 4" />
    </Icon>
  );
}

export function AnchorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="4.25" r="1.75" />
      <path d="M10 6v11.5M6.25 9.5h7.5M3.25 12.25a6.75 6.75 0 0 0 13.5 0" />
    </Icon>
  );
}

export function RotateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M15.75 3.5v3h-3" />
    </Icon>
  );
}

export function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="7" width="12" height="9" rx="2" />
      <path d="M10 4v3M7.5 16v1.5M12.5 16v1.5M2 11v2M18 11v2" />
      <circle cx="7.75" cy="11.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.25" cy="11.25" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ShipWheelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="5" />
      <circle cx="10" cy="10" r="1.5" />
      <path d="M10 2.5V5M10 15v2.5M2.5 10H5M15 10h2.5M4.7 4.7l1.8 1.8M13.5 13.5l1.8 1.8M4.7 15.3l1.8-1.8M13.5 6.5l1.8-1.8" />
    </Icon>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8.5 11.5l3-3" />
      <path d="M7.25 12.75l-1.5 1.5a2.65 2.65 0 0 1-3.75-3.75l3-3a2.65 2.65 0 0 1 3.75 0" />
      <path d="M12.75 7.25l1.5-1.5a2.65 2.65 0 0 1 3.75 3.75l-3 3a2.65 2.65 0 0 1-3.75 0" />
    </Icon>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.75" />
      <path d="M13 7V5.25A1.75 1.75 0 0 0 11.25 3.5H5.25A1.75 1.75 0 0 0 3.5 5.25v6A1.75 1.75 0 0 0 5.25 13H7" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </Icon>
  );
}

export function ShuffleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h2.2c1.1 0 2.1.5 2.8 1.4l3 5.2c.7.9 1.7 1.4 2.8 1.4h2.2M3.5 14h2.2c1.1 0 2.1-.5 2.8-1.4l.5-.9M11.5 7.4l.5-.9A3.5 3.5 0 0 1 14.3 6h2.2" />
      <path d="M14.5 4l2 2-2 2M14.5 12l2 2-2 2" />
    </Icon>
  );
}
