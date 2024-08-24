import { DateField, TextField } from "@refinedev/antd";
import { Checkbox, Form, Input, InputNumber, Select, Typography } from "antd";
import { FormItemProps, Rule } from "antd/es/form";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { enrichText } from "../utils/parsing";
import { Field, FieldType } from "../utils/queryFields";
import { DateTimePicker } from "./dateTimePicker";
import { InputNumberRange } from "./inputNumberRange";
import { NumberFieldUnit, NumberFieldUnitRange } from "./numberField";

dayjs.extend(utc);

const { Title } = Typography;

/**
 * Title and value to display an extra field. Used for the show pages.
 * @param props
 * @returns
 */
export function ExtraFieldDisplay(props: { field: Field; value: string | undefined }) {
  const { field, value } = props;

  let item;
  if (value !== undefined) {
    const parsedValue = JSON.parse(value);

    if (field.field_type === FieldType.integer) {
      item = (
        <NumberFieldUnit
          value={parsedValue ?? ""}
          unit={field.unit ?? ""}
          options={{
            maximumFractionDigits: 0,
            minimumFractionDigits: 0,
          }}
        />
      );
    } else if (field.field_type === FieldType.float) {
      item = (
        <NumberFieldUnit
          value={parsedValue ?? ""}
          unit={field.unit ?? ""}
          options={{
            maximumFractionDigits: 3,
            minimumFractionDigits: 0,
          }}
        />
      );
    } else if (field.field_type === FieldType.integer_range || field.field_type === FieldType.float_range) {
      if (!Array.isArray(parsedValue) || parsedValue.length !== 2) {
        return <TextField value={parsedValue} />;
      }
      item = (
        <NumberFieldUnitRange
          value={parsedValue}
          unit={field.unit ?? ""}
          options={{
            maximumFractionDigits: field.field_type === FieldType.float_range ? 3 : 0,
            minimumFractionDigits: 0,
          }}
        />
      );
    } else if (field.field_type === FieldType.text) {
      item = <TextField value={enrichText(parsedValue)} />;
    } else if (field.field_type === FieldType.datetime) {
      item = (
        <DateField
          value={dayjs.utc(parsedValue).local()}
          title={dayjs.utc(parsedValue).local().format()}
          format="YYYY-MM-DD HH:mm:ss"
        />
      );
    } else if (field.field_type === FieldType.boolean) {
      item = <TextField value={parsedValue ? "Yes" : "No"} />;
    } else if (field.field_type === FieldType.choice && !field.multi_choice) {
      item = <TextField value={parsedValue} />;
    } else if (field.field_type === FieldType.choice && field.multi_choice) {
      item = <TextField value={parsedValue.join(", ")} />;
    } else {
      throw new Error(`Unknown field type: ${field.field_type}`);
    }
  } else {
    item = <></>;
  }

  return (
    <>
      <Title level={5}>{field.name}</Title>
      {item}
    </>
  );
}

/**
 * Form item for an extra field. Used for the edit pages.
 * @param props
 * @returns
 */
export function ExtraFieldFormItem(props: { field: Field; setDefaultValue?: boolean }) {
  const { field } = props;

  let inputNode;
  const rules: Rule[] = [
    {
      required: false,
    },
  ];
  const formItemProps: FormItemProps = {};
  if (field.field_type === FieldType.integer) {
    inputNode = <InputNumber addonAfter={field.unit} precision={0} />;
    rules.push({
      type: "integer",
    });
  } else if (field.field_type === FieldType.float) {
    inputNode = <InputNumber addonAfter={field.unit} precision={3} />;
    rules.push({
      type: "number",
    });
  } else if (field.field_type === FieldType.integer_range) {
    inputNode = <InputNumberRange unit={field.unit} precision={0} />;
  } else if (field.field_type === FieldType.float_range) {
    inputNode = <InputNumberRange unit={field.unit} precision={3} />;
  } else if (field.field_type === FieldType.text) {
    inputNode = <Input />;
    rules.push({
      type: "string",
    });
  } else if (field.field_type === FieldType.datetime) {
    inputNode = <DateTimePicker />;
  } else if (field.field_type === FieldType.boolean) {
    inputNode = <Checkbox />;
    formItemProps.valuePropName = "checked";
    rules.push({
      type: "boolean",
    });
  } else if (field.field_type === FieldType.choice) {
    inputNode = (
      <Select
        mode={field.multi_choice ? "multiple" : undefined}
        options={field.choices?.map((choice) => ({ label: choice, value: choice }))}
      />
    );
    rules.push({
      type: field.multi_choice ? "array" : "string",
    });
  } else {
    throw new Error(`Unknown field type: ${field.field_type}`);
  }

  if (props.setDefaultValue) {
    formItemProps.initialValue = field.default_value;
  }

  return (
    <Form.Item label={field.name} name={["extra", field.key]} rules={rules} {...formItemProps}>
      {inputNode}
    </Form.Item>
  );
}

/**
 * Convert the string-based value extra key-values of an entity to their JSON-parsed values.
 * @param obj
 * @returns
 */
export function ParsedExtras<T extends { extra?: { [key: string]: string } }>(
  obj: T
): Omit<T, "extra"> & { extra?: { [key: string]: unknown } } {
  if (obj.extra) {
    const newExtra: { [key: string]: unknown } = {};
    Object.entries(obj.extra).forEach(([key, value]) => {
      try {
        newExtra[key] = JSON.parse(value);
      } catch (e) {
        newExtra[key] = value;
      }
    });
    return {
      ...obj,
      extra: newExtra,
    };
  } else {
    return obj;
  }
}

/**
 * Convert the JSON-parsed value extra key-values of an entity to their string values.
 * @param obj
 * @returns
 */
export function StringifiedExtras<T extends { extra?: { [key: string]: unknown } }>(
  obj: T
): Omit<T, "extra"> & { extra?: { [key: string]: string } } {
  if (obj.extra) {
    const newExtra: { [key: string]: string } = {};
    Object.entries(obj.extra).forEach(([key, value]) => {
      newExtra[key] = JSON.stringify(value);
    });
    return {
      ...obj,
      extra: newExtra,
    };
  } else {
    return {
      ...obj,
      extra: undefined,
    };
  }
}
