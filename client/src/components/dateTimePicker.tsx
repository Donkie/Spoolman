import { DatePicker } from "antd";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

// Localized date time format with timezone
const dateTimeFormat = "YYYY-MM-DD HH:mm:ss";

export function DateTimePicker<T extends string | dayjs.Dayjs>(props: { value?: T; onChange?: (value?: T) => void }) {
  return (
    <DatePicker
      showTime={{ use12Hours: false }}
      format={dateTimeFormat}
      value={props.value ? dayjs(props.value) : undefined}
      onChange={(value) => {
        if (value) {
          if (typeof props.value === "string") {
            props.onChange?.(value.toISOString() as T);
          } else {
            props.onChange?.(value as T);
          }
        } else {
          props.onChange?.(undefined);
        }
      }}
    />
  );
}
