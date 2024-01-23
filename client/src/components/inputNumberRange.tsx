import { InputNumber } from "antd";

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
        style={{ maxWidth: 110 }}
        onChange={(value) => {
          if (props.onChange) {
            props.onChange([value, max]);
          }
        }}
      />
      {" \u2013 "}
      <InputNumber
        value={max}
        precision={props.precision ?? 0}
        addonAfter={props.unit}
        style={{ maxWidth: 110 }}
        onChange={(value) => {
          if (props.onChange) {
            props.onChange([min, value]);
          }
        }}
      />
    </>
  );
}
