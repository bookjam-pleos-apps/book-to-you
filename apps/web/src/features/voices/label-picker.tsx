import { Chip, ChipGroup } from "../../shared/ui/chip";
import { TextField } from "../../shared/ui/field";

// 차 책장 이름으로 쓰인다("엄마 목소리 책장"). 서버는 1~32자를 받는다.
const PRESET_LABELS = ["엄마", "아빠", "할머니", "할아버지"] as const;
const MAX_LABEL_LENGTH = 32;

type LabelPickerProps = { readonly label: string; readonly onChange: (label: string) => void };

const LabelChips = ({ label, onChange }: LabelPickerProps) => (
  <ChipGroup>
    {PRESET_LABELS.map((preset) => (
      <Chip key={preset} selected={preset === label} onClick={() => onChange(preset)}>
        {preset}
      </Chip>
    ))}
  </ChipGroup>
);

export const LabelPicker = ({ label, onChange }: LabelPickerProps) => (
  <>
    <LabelChips label={label} onChange={onChange} />
    <TextField placeholder="직접 입력 (예: 이모)" maxLength={MAX_LABEL_LENGTH} value={label}
      onChange={(event) => onChange(event.target.value)} aria-label="목소리 이름" />
  </>
);
