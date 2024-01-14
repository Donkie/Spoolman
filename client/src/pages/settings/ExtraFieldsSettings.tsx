import {
  Button,
  Checkbox,
  DatePicker,
  Flex,
  Form,
  FormInstance,
  Input,
  InputNumber,
  Select,
  Table,
  Typography,
  message,
} from "antd";
import { EntityType, Field, FieldType, useGetFields, useSetField } from "./queryFields";
import { useTranslate } from "@refinedev/core";
import { useState } from "react";
import { ColumnType } from "antd/es/table";
import { Trans } from "react-i18next";
import { useParams } from "react-router-dom";
import { FormItemProps, Rule } from "antd/es/form";
import { PlusOutlined } from "@ant-design/icons";

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  record: FieldHolder;
  editing: boolean;
  dataIndex: string;
  form: FormInstance;
  children: React.ReactNode;
}

interface ColumnProps extends ColumnType<FieldHolder> {
  editable: boolean;
  required: boolean;
}

interface FieldHolder {
  key: string;
  field: Field;
  is_new: boolean;
}

const EditableCell: React.FC<EditableCellProps> = ({ record, editing, dataIndex, children, form, ...restProps }) => {
  const t = useTranslate();

  if (!editing) {
    return <td {...restProps}>{children}</td>;
  }

  const fieldType = form.getFieldValue("field_type") as FieldType;
  const choices = form.getFieldValue("choices") as string[];

  const title = t(`settings.extra_fields.params.${dataIndex}`);

  let inputNode;
  const rules: Rule[] = [];
  const formItemProps: FormItemProps = {};
  if (dataIndex === "key") {
    inputNode = <Input />;
    rules.push({
      required: true,
      min: 1,
      pattern: /^[a-z0-9_]+$/,
    });
    rules.push({
      validator: async (_, value) => {
        // Ensure key is not new_field
        if (value === "new_field") {
          throw new Error(t("settings.extra_fields.key_not_changed"));
        }
      },
    });
  } else if (dataIndex === "field_type") {
    inputNode = (
      <Select
        options={[
          {
            label: t(`settings.extra_fields.field_type.${FieldType.text}`),
            value: FieldType.text,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.integer}`),
            value: FieldType.integer,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.integer_range}`),
            value: FieldType.integer_range,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.float}`),
            value: FieldType.float,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.float_range}`),
            value: FieldType.float_range,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.datetime}`),
            value: FieldType.datetime,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.boolean}`),
            value: FieldType.boolean,
          },
          {
            label: t(`settings.extra_fields.field_type.${FieldType.choice}`),
            value: FieldType.choice,
          },
        ]}
        onChange={() => {
          // Reset default_value when changing field_type
          form.setFieldsValue({
            default_value: undefined,
          });
        }}
      />
    );
    rules.push({
      required: true,
    });
  } else if (dataIndex === "name") {
    inputNode = <Input />;
    rules.push({
      required: true,
      min: 1,
    });
  } else if (dataIndex === "unit") {
    if (
      fieldType === FieldType.integer ||
      fieldType === FieldType.integer_range ||
      fieldType === FieldType.float ||
      fieldType === FieldType.float_range
    ) {
      inputNode = <Input />;
    } else {
      inputNode = null;
    }
    rules.push({
      required: false,
    });
  } else if (dataIndex === "default_value") {
    if (fieldType === FieldType.boolean) {
      inputNode = <Checkbox />;
      formItemProps.valuePropName = "checked";
      rules.push({
        type: "boolean",
      });
    } else if (fieldType === FieldType.text) {
      inputNode = <Input />;
      rules.push({
        type: "string",
      });
    } else if (fieldType === FieldType.integer) {
      inputNode = <InputNumber />;
      rules.push({
        type: "integer",
      });
    } else if (fieldType === FieldType.float) {
      inputNode = <InputNumber />;
      rules.push({
        type: "float",
      });
    } else if (fieldType === FieldType.integer_range) {
      inputNode = <Input placeholder="Example: 180 - 210" />;
      rules.push({
        type: "string",
        pattern: /^-?\d+\s*-\s*-?\d+$/,
      });
    } else if (fieldType === FieldType.float_range) {
      inputNode = <Input placeholder="Example: 1.34 - 2.90" />;
      rules.push({
        type: "string",
        pattern: /^-?\d+([.,]\d+)?\s*-\s*-?\d+([.,]\d+)?$/,
      });
    } else if (fieldType === FieldType.datetime) {
      inputNode = <DatePicker format="YYYY-MM-DD hh:mm:ss" showTime={{ use12Hours: false }} />;
    } else if (fieldType === FieldType.choice) {
      inputNode = (
        <Select
          mode={form.getFieldValue("multi_choice") ? "multiple" : undefined}
          options={choices.map((choice) => ({ label: choice, value: choice }))}
        />
      );
      rules.push({
        type: form.getFieldValue("multi_choice") ? "array" : "string",
      });
    }
  } else if (dataIndex === "choices") {
    if (fieldType === FieldType.choice) {
      inputNode = <Select mode="tags" tokenSeparators={[","]} open={false} />;
      rules.push({
        required: true,
        min: 1,
        type: "array",
        validator: async (_, value) => {
          // Verify that all values in record.choices are in value
          const recordChoices = record.field.choices || [];
          const valueChoices = value || [];
          const missingChoices = recordChoices.filter((choice) => !valueChoices.includes(choice));
          if (missingChoices.length > 0) {
            throw new Error(
              t("settings.extra_fields.choices_missing_error", {
                choices: missingChoices.join(", "),
              })
            );
          }
        },
      });
    } else {
      inputNode = null;
    }
  } else if (dataIndex === "multi_choice") {
    if (fieldType === FieldType.choice) {
      inputNode = (
        <Checkbox
          onChange={() => {
            // Reset default_value when changing multi_choice
            form.setFieldsValue({
              default_value: undefined,
            });
          }}
        >
          {title}
        </Checkbox>
      );
      formItemProps.valuePropName = "checked";
      rules.push({
        type: "boolean",
      });
    } else {
      inputNode = null;
    }
  } else {
    inputNode = null;
  }

  const formItem = inputNode ? (
    <Form.Item
      name={dataIndex}
      messageVariables={{ label: title }}
      style={{ margin: 0 }}
      rules={rules}
      {...formItemProps}
    >
      {inputNode}
    </Form.Item>
  ) : null;

  return <td {...restProps}>{formItem}</td>;
};

export function ExtraFieldsSettings() {
  const { entityType } = useParams<{ entityType: EntityType }>();
  const t = useTranslate();
  const [form] = Form.useForm();
  const fields = useGetFields(entityType as EntityType);
  const setField = useSetField(entityType as EntityType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newField, setNewField] = useState<FieldHolder | null>(null);

  const [messageApi, contextHolder] = message.useMessage();

  const [editingKey, setEditingKey] = useState("");

  const isEditing = (record: FieldHolder) => record.field.key === editingKey;

  const edit = (record: Partial<Field> & { key: React.Key }) => {
    const values = { ...record };
    console.log(values);
    if (values.default_value) {
      values.default_value = JSON.parse(values.default_value);
    } else {
      values.default_value = "";
    }
    form.setFieldsValue(values);
    setEditingKey(record.key);
  };

  const cancel = () => {
    setEditingKey("");
  };

  const save = async (_key: React.Key) => {
    let row;
    try {
      row = (await form.validateFields()) as Field;
    } catch (errInfo) {
      // Ignore these errors because they are already handled by the form
      return;
    }

    // Do some value conversions
    try {
      // Convert float and integer range to array using the validation regex
      if (row.field_type === FieldType.float_range && typeof row.default_value === "string") {
        const pattern = /^(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)$/;
        const matches = row.default_value.match(pattern);
        if (matches) {
          const val1 = parseFloat(matches[1].replace(",", "."));
          const val2 = parseFloat(matches[2].replace(",", "."));
          row.default_value = JSON.stringify([Math.min(val1, val2), Math.max(val1, val2)]);
        }
      } else if (row.field_type === FieldType.integer_range && typeof row.default_value === "string") {
        const pattern = /^(-?\d+)\s*-\s*(-?\d+)$/;
        const matches = row.default_value.match(pattern);
        if (matches) {
          const val1 = parseInt(matches[1]);
          const val2 = parseInt(matches[2]);
          row.default_value = JSON.stringify([Math.min(val1, val2), Math.max(val1, val2)]);
        }
      } else {
        // Just stringify all other values
        row.default_value = JSON.stringify(row.default_value);
      }

      // Set multi_choice if it's not set and field_type is choice
      if (row.field_type === FieldType.choice && row.multi_choice === undefined) {
        row.multi_choice = false;
      }

      // If unit is an empty string, set it to null instead
      if (row.unit === "") {
        row.unit = undefined;
      }
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(t("notifications.validationError", { error: errInfo.message }));
        // Check if errInfo has the errorFields property, then we should skip the error message
      }
      return;
    }

    // Validate that row.key is unique and not among the other keys
    const keys = new Set(fields.data?.map((field) => field.key) || []);
    if (keys.has(row.key)) {
      messageApi.error(t("settings.extra_fields.non_unique_key_error"));
      return;
    }

    // Submit it!
    try {
      console.log(row);

      setIsSubmitting(true);

      setField.reset();

      await setField.mutateAsync({
        key: row.key,
        params: row,
      });

      setEditingKey("");
      setNewField(null);
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
    setIsSubmitting(false);
  };

  const niceName = t(`${entityType}.${entityType}`);

  const columns: ColumnProps[] = [
    {
      title: t("settings.extra_fields.params.key"),
      dataIndex: ["field", "key"],
      key: "key",
      editable: false,
      required: true,
    },
    {
      title: t("settings.extra_fields.params.name"),
      dataIndex: ["field", "name"],
      editable: true,
      required: true,
    },
    {
      title: t("settings.extra_fields.params.field_type"),
      dataIndex: ["field", "field_type"],
      editable: false,
      required: true,
      render(value) {
        return t(`settings.extra_fields.field_type.${value}`);
      },
    },
    {
      title: t("settings.extra_fields.params.unit"),
      dataIndex: ["field", "unit"],
      editable: true,
      required: false,
    },
    {
      title: t("settings.extra_fields.params.default_value"),
      dataIndex: ["field", "default_value"],
      editable: true,
      required: false,
      render(value, record) {
        const val = JSON.parse(value || "null");
        if (typeof val === "boolean") {
          return val ? t("settings.extra_fields.boolean_true") : t("settings.extra_fields.boolean_false");
        } else if (typeof val === "number" || typeof val === "string") {
          return val;
        } else if (Array.isArray(val) && record.field.field_type === FieldType.choice) {
          return val.join(", ");
        } else if (
          (Array.isArray(val) && record.field.field_type === FieldType.integer_range) ||
          record.field.field_type === FieldType.float_range
        ) {
          return `${val[0]} - ${val[1]}`;
        } else {
          return null;
        }
      },
    },
    {
      title: t("settings.extra_fields.params.choices"),
      dataIndex: ["field", "choices"],
      editable: true,
      required: false,
      render(value, record) {
        if (record.field.field_type === FieldType.choice && Array.isArray(value)) {
          return value.join(", ");
        } else {
          return null;
        }
      },
    },
    {
      title: t("settings.extra_fields.params.multi_choice"),
      dataIndex: ["field", "multi_choice"],
      editable: false,
      required: false,
      render(value, record) {
        if (record.field.field_type === FieldType.choice) {
          return value ? t("settings.extra_fields.boolean_true") : t("settings.extra_fields.boolean_false");
        } else {
          return null;
        }
      },
    },
    {
      title: "",
      dataIndex: "operation",
      editable: false,
      required: false,
      render: (_: unknown, record: FieldHolder) => {
        const editable = isEditing(record);
        return editable ? (
          <span>
            <Typography.Link onClick={() => save(record.field.key)} style={{ marginRight: 8 }}>
              Save
            </Typography.Link>
            <Typography.Link onClick={() => cancel()}>Cancel</Typography.Link>
          </span>
        ) : (
          <Typography.Link disabled={editingKey !== ""} onClick={() => edit(record.field)}>
            Edit
          </Typography.Link>
        );
      },
    },
  ];

  const mergedColumns = columns.map((col) => {
    if (col.dataIndex === "operation") {
      return col;
    }
    return {
      ...col,
      onCell: function (record: FieldHolder): EditableCellProps {
        return {
          record,
          editing: isEditing(record),
          dataIndex: (col.dataIndex?.toString() || "").split(",").pop() || "",
          form: form,
          children: [],
        };
      },
    };
  });

  const tableFields: FieldHolder[] = [
    ...(fields.data || []).map((field) => ({
      key: field.key,
      field,
      is_new: false,
    })),
    ...(newField ? [newField] : []),
  ];

  return (
    <>
      <h3>
        {t("settings.extra_fields.tab")} - {niceName}
      </h3>
      <Trans
        i18nKey={"settings.extra_fields.description"}
        components={{
          p: <p />,
        }}
      />
      <Form form={form} component={false} disabled={isSubmitting}>
        <Table
          components={{
            body: {
              cell: EditableCell,
            },
          }}
          columns={mergedColumns}
          dataSource={tableFields}
          loading={fields.isLoading}
          rowClassName="editable-row"
          pagination={false}
        />
      </Form>
      {newField == null && (
        <Flex justify="center">
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            size="large"
            style={{
              margin: "1em",
            }}
            onClick={() => {
              const newFieldData: Field = {
                key: "new_field",
                name: "",
                entity_type: entityType as EntityType,
                field_type: FieldType.text,
                unit: "",
                default_value: "",
                choices: [],
                multi_choice: false,
              };

              setNewField({
                key: "new_field",
                field: newFieldData,
                is_new: true,
              });
              form.setFieldsValue(newFieldData);
              setEditingKey("new_field");
            }}
          />
        </Flex>
      )}
      {contextHolder}
    </>
  );
}
