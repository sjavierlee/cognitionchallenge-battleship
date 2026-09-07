import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';

type Props = {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
};

export function DifficultyPicker({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset className="difficulty" disabled={disabled}>
      <legend className="difficulty-legend">AI difficulty</legend>
      <div className="difficulty-options">
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
            <span className="difficulty-label">{d.label}</span>
            <span className="difficulty-blurb">{d.blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
