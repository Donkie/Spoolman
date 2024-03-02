import { DefaultOptionType } from "antd/es/cascader";

// Base types that can be exported to CSV.
type BaseTypes = string | number | boolean | Date | null | undefined;

export type ExportOption<T> = {
  [K in keyof T]: {
    disabled?: boolean;
    [name: string]: any;
    disableCheckbox?: boolean;
    value?: K extends string ? K : never;
    label: string;
    children?: Required<T>[K] extends BaseTypes ? never : Array<ExportOption<Required<T>[K]>>;
  };
}[keyof T] & DefaultOptionType;