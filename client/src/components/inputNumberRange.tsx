import { InputNumber } from "antd";
import { formatNumberOnUserInput, numberParserAllowEmpty } from "../utils/parsing";

function parseValue(value?: (number | null)[]): [number | null, number | null] {
  if (value === undefined) {
    return [null, null];
  }

  if (!Array.isArray(value) || value.length !== 2) {
    return [null, null];
  }

  const [min, max] = value;

  return [min, max];
}

function parseInputNumberValue(value: string | number | null): number | null {
  if (typeof value === "number") return value;
  // antd typically emits numbers here, but its typings allow strings (e.g. with
  // stringMode). Parse those rather than dropping them, while still treating an
  // empty/null value as a deliberate clear.
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * An Ant Design compatible form input for a number range.
 * @param props
 * @returns
 */
export function InputNumberRange(props: {
  /** Decimal precision */ precision?: number;
  /** Unit to display */ unit?: string;
  /** Value state */ value?: (number | null)[] | undefined;
  /** Called when input changes. Used to update value state. */ onChange?: (value: (number | null)[]) => void;
}) {
  const [min, max] = parseValue(props.value);

  return (
    <>
      <InputNumber
        value={min}
        precision={props.precision ?? 0}
        addonAfter={props.unit}
        formatter={formatNumberOnUserInput}
        parser={numberParserAllowEmpty}
        style={{ maxWidth: 110 }}
        onChange={(value) => {
          if (props.onChange) {
            props.onChange([parseInputNumberValue(value), max]);
          }
        }}
      />
      {" \u2013 "}
      <InputNumber
        value={max}
        precision={props.precision ?? 0}
        addonAfter={props.unit}
        formatter={formatNumberOnUserInput}
        parser={numberParserAllowEmpty}
        style={{ maxWidth: 110 }}
        onChange={(value) => {
          if (props.onChange) {
            props.onChange([min, parseInputNumberValue(value)]);
          }
        }}
      />
    </>
  );
}
