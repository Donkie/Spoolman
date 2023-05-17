import React from "react";
import { Typography } from "antd";
import { NumberFieldProps } from "@refinedev/antd/dist/components/fields/types";

const { Text } = Typography;

function toLocaleStringSupportsOptions() {
  return !!(
    typeof Intl == "object" &&
    Intl &&
    typeof Intl.NumberFormat == "function"
  );
}

type Props = NumberFieldProps & {
  unit: string;
};

/**
 * This field is used to display a number formatted according to the browser locale, right aligned. and uses {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl `Intl`} to display date format.
 *
 * @see {@link https://refine.dev/docs/ui-frameworks/antd/components/fields/number} for more details.
 */
export const NumberFieldUnit: React.FC<Props> = ({
  value,
  locale,
  options,
  ...rest
}) => {
  const number = Number(value);

  return (
    <Text {...rest}>
      {toLocaleStringSupportsOptions()
        ? number.toLocaleString(locale, options)
        : number}{" "}
      {rest.unit}
    </Text>
  );
};
