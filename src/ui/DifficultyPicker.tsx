import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';

type Props = {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
};

export function DifficultyPicker({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset className="panel difficulty" disabled={disabled}>
      <legend className="panel-title">Opponent</legend>
      <div className="difficulty-options" role="radiogroup" aria-label="AI difficulty">
        {DIFFICULTIES.map((d) => (
          <label
            key={d.id}
            className={`difficulty-option${value === d.id ? ' difficulty-option--selected' : ''}`}
          >
            <input
              type="radio"
              name="difficulty"
              value={d.id}
              checked={value === d.id}
              onChange={() => onChange(d.id)}
            />
            <span className="difficulty-radio" aria-hidden="true" />
            <span className="difficulty-label">{d.label}</span>
            <span className="difficulty-blurb">{d.blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
