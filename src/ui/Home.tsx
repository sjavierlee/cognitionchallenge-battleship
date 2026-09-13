import { useId, useState, type FormEvent } from 'react';
import { isValidRoomCode, normalizeRoomCode } from '../net/roomCode';
import { MAX_NAME_LENGTH } from '../net/protocol';
import type { LastMode } from '../storage/record';
import { LinkIcon, RobotIcon, ShipWheelIcon } from './icons';

type Props = {
  name: string;
  onNameChange: (name: string) => void;
  lastMode: LastMode | null;
  /** Room code taken from a share link, if the page was opened with one. */
  pendingCode: string | null;
  onPlayAi: () => void;
  onHost: () => void;
  onJoin: (code: string) => void;
};

export function Home({
  name,
  onNameChange,
  lastMode,
  pendingCode,
  onPlayAi,
  onHost,
  onJoin,
}: Props) {
  const [codeInput, setCodeInput] = useState(pendingCode ?? '');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [seenCode, setSeenCode] = useState(pendingCode);
  if (pendingCode !== seenCode) {
    setSeenCode(pendingCode);
    if (pendingCode) {
      setCodeInput(pendingCode);
      setCodeError(null);
    } else if (codeInput === seenCode) {
      setCodeInput('');
    }
  }
  const nameId = useId();
  const codeId = useId();
  const code = normalizeRoomCode(codeInput);
  const codeOk = isValidRoomCode(code);

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk) {
      setCodeError('Codes are 6 letters or digits, like K7Q2ZD.');
      return;
    }
    setCodeError(null);
    onJoin(code);
  };

  return (
    <main className="home">
      <section className="home-intro">
        <h2 className="home-title">Choose your battle</h2>
        <p className="home-sub">
          Sink all five enemy ships before yours go down. Play the computer, or send a friend a link
          and play them live — no accounts needed.
        </p>
        <label className="field home-name">
          <span className="field-label" id={nameId}>
            Your name <span className="field-hint">(optional)</span>
          </span>
          <input
            type="text"
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Captain"
            autoComplete="nickname"
            aria-labelledby={nameId}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </label>
      </section>

      <div className="home-modes">
        <article
          className={`mode-card${lastMode === 'ai' && !pendingCode ? ' mode-card--last' : ''}`}
        >
          <RobotIcon className="mode-icon" />
          <h3 className="mode-title">Play vs AI</h3>
          <p className="mode-blurb">
            Three difficulties. The AI hunts, then targets — it does not fire at random.
          </p>
          <button type="button" className="btn btn--primary btn--big" onClick={onPlayAi}>
            Play vs AI
          </button>
          {lastMode === 'ai' && !pendingCode && <span className="mode-last">Last played</span>}
        </article>

        <article
          className={`mode-card${lastMode === 'friend' && !pendingCode ? ' mode-card--last' : ''}`}
        >
          <ShipWheelIcon className="mode-icon" />
          <h3 className="mode-title">Play a friend</h3>
          <p className="mode-blurb">
            Host a room and share the link. Your browsers connect directly; both of you need to be
            online at the same time.
          </p>
          <button type="button" className="btn btn--primary btn--big" onClick={onHost}>
            Host a game
          </button>
          {lastMode === 'friend' && !pendingCode && <span className="mode-last">Last played</span>}
        </article>

        <form
          className={`mode-card${pendingCode ? ' mode-card--last' : ''}`}
          onSubmit={submitJoin}
          noValidate
        >
          <LinkIcon className="mode-icon" />
          <h3 className="mode-title">Join with a code</h3>
          <p className="mode-blurb">
            {pendingCode
              ? 'You opened an invite link. Set a name if you like, then join.'
              : 'Paste the code or link your friend sent you.'}
          </p>
          <label className="field">
            <span className="field-label" id={codeId}>
              Room code
            </span>
            <input
              type="text"
              className="input input--code"
              value={codeInput}
              placeholder="K7Q2ZD"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-labelledby={codeId}
              aria-invalid={codeError ? true : undefined}
              onChange={(e) => {
                setCodeInput(e.target.value);
                setCodeError(null);
              }}
            />
          </label>
          {codeError && (
            <p className="field-error" role="alert">
              {codeError}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--big">
            Join game
          </button>
        </form>
      </div>
    </main>
  );
}
