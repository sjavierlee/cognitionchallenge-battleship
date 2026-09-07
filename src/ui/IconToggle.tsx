import type { ReactNode } from 'react';

type Props = {
  pressed: boolean;
  onToggle: () => void;
  /** Accessible names for the button in each state. */
  labelOn: string;
  labelOff: string;
  iconOn: ReactNode;
  iconOff: ReactNode;
};

/**
 * Icon-only toggle. Both icons stay in the DOM and cross-fade (opacity / scale / blur) so the
 * swap animates in both directions without a motion library.
 */
export function IconToggle({ pressed, onToggle, labelOn, labelOff, iconOn, iconOff }: Props) {
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label={pressed ? labelOn : labelOff}
    >
      <span className="icon-swap">
        <span className={`icon-swap-item${pressed ? ' icon-swap-item--shown' : ''}`}>{iconOn}</span>
        <span className={`icon-swap-item${pressed ? '' : ' icon-swap-item--shown'}`}>
          {iconOff}
        </span>
      </span>
    </button>
  );
}
