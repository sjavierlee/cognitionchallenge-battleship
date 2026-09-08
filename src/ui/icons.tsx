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

export function ShuffleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h2.2c1.1 0 2.1.5 2.8 1.4l3 5.2c.7.9 1.7 1.4 2.8 1.4h2.2M3.5 14h2.2c1.1 0 2.1-.5 2.8-1.4l.5-.9M11.5 7.4l.5-.9A3.5 3.5 0 0 1 14.3 6h2.2" />
      <path d="M14.5 4l2 2-2 2M14.5 12l2 2-2 2" />
    </Icon>
  );
}
