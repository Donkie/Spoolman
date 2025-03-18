import { PlusOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import {
  Button,
  Checkbox,
  Flex,
  Form,
  FormInstance,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from "antd";
import { FormItemProps, Rule } from "antd/es/form";
import { ColumnType } from "antd/es/table";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useState } from "react";
import { Trans } from "react-i18next";
import { useParams } from "react-router";
import { DateTimePicker } from "../../components/dateTimePicker";
import { InputNumberRange } from "../../components/inputNumberRange";
import { EntityType, Field, FieldType, useDeleteField, useGetFields, useSetField } from "../../utils/queryFields";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

// Localized date time format with timezone
const dateTimeFormat = "YYYY-MM-DD HH:mm:ss";

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  record: FieldHolder;
  editing: boolean;
  dataIndex: string;
  form: FormInstance;
  children: React.ReactNode;
}

interface FieldHolder {
  key: string;
  field: Field;
  is_new: boolean;
}

const canEditField = (dataIndex: string, isNew: boolean) => {
  if (isNew) {
    return true;
  }
  return dataIndex !== "key" && dataIndex !== "field_type" && dataIndex !== "multi_choice";
};

const EditableCell: React.FC<EditableCellProps> = ({ record, editing, dataIndex, children, form, ...restProps }) => {
  const t = useTranslate();

  if (!editing || !canEditField(dataIndex, record.is_new)) {
    return (
      <td
        {...restProps}
        style={{
          wordBreak: "break-word",
        }}
      >
        {children}
      </td>
    );
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
      max: 64,
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
      max: 128,
    });
  } else if (dataIndex === "order") {
    inputNode = <InputNumber style={{ width: "60px" }} />;
    rules.push({
      required: true,
      min: 0,
      type: "integer",
    });
  } else if (dataIndex === "unit") {
    if (
      fieldType === FieldType.integer ||
      fieldType === FieldType.integer_range ||
      fieldType === FieldType.float ||
      fieldType === FieldType.float_range
    ) {
      inputNode = <Input style={{ width: "60px" }} />;
    } else {
      inputNode = null;
    }
    rules.push({
      required: false,
      max: 16,
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
        type: "number",
      });
    } else if (fieldType === FieldType.integer_range) {
      inputNode = <InputNumberRange precision={0} />;
      rules.push({
        type: "array",
        len: 2,
      });
    } else if (fieldType === FieldType.float_range) {
      inputNode = <InputNumberRange precision={3} />;
      rules.push({
        type: "array",
        len: 2,
      });
    } else if (fieldType === FieldType.datetime) {
      inputNode = <DateTimePicker />;
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
  const deleteField = useDeleteField(entityType as EntityType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newField, setNewField] = useState<FieldHolder | null>(null);

  const [messageApi, contextHolder] = message.useMessage();

  const [editingKey, setEditingKey] = useState("");

  const isEditing = (record: FieldHolder) => record.field.key === editingKey;

  const edit = (record: Partial<Field> & { key: React.Key }) => {
    const values = { ...record };

    if (values.default_value && typeof values.default_value === "string") {
      const def = JSON.parse(values.default_value);
      if (values.field_type === FieldType.boolean) {
        values.default_value = def ? true : false;
      } else {
        values.default_value = def;
      }
    } else {
      values.default_value = undefined;
    }
    form.setFieldsValue(values);
    setEditingKey(record.key);
  };

  const cancel = () => {
    setEditingKey("");
    setNewField(null);
  };

  const del = async (field: Field) => {
    try {
      await deleteField.mutateAsync(field.key);
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    }
  };

  const addNewField = () => {
    // Calculate new order by getting the highest order and adding 1
    const newOrder = Math.max(...(fields.data?.map((field) => field.order) || []), 0) + 1;

    const newFieldData: Field = {
      key: "new_field",
      name: "",
      entity_type: entityType as EntityType,
      field_type: FieldType.text,
      unit: "",
      order: newOrder,
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
  };

  const save = async (record: FieldHolder) => {
    let row;
    try {
      row = (await form.validateFields()) as Field;
    } catch (errInfo) {
      // Ignore these errors because they are already handled by the form
      return;
    }

    const updatedField = {
      ...record.field,
      ...row,
    };

    // Do some value conversions
    try {
      // Convert float and integer range to array using the validation regex
      if (
        (updatedField.field_type === FieldType.float_range || updatedField.field_type === FieldType.integer_range) &&
        updatedField.default_value !== undefined
      ) {
        if (Array.isArray(updatedField.default_value)) {
          const val1 = updatedField.default_value[0];
          const val2 = updatedField.default_value[1];
          updatedField.default_value = JSON.stringify([val1, val2]);
        } else {
          console.warn("Invalid default_value for range", updatedField.default_value);
        }
      } else {
        // Just stringify all other values
        updatedField.default_value = JSON.stringify(updatedField.default_value);
      }

      // Set multi_choice if it's not set and field_type is choice
      if (updatedField.field_type === FieldType.choice && updatedField.multi_choice === undefined) {
        updatedField.multi_choice = false;
      }

      // If it's not choice, remove choices and multi_choice
      if (updatedField.field_type !== FieldType.choice) {
        updatedField.choices = undefined;
        updatedField.multi_choice = undefined;
      }

      // If unit is an empty string, set it to null instead
      if (updatedField.unit === "") {
        updatedField.unit = undefined;
      }
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(t("notifications.validationError", { error: errInfo.message }));
        // Check if errInfo has the errorFields property, then we should skip the error message
      }
      return;
    }

    // Validate that updatedField.key is unique and not among the other keys
    if (record.is_new) {
      const keys = new Set(fields.data?.map((field) => field.key) || []);
      if (keys.has(updatedField.key)) {
        messageApi.error(t("settings.extra_fields.non_unique_key_error"));
        return;
      }
    }

    // Submit it!
    try {
      setIsSubmitting(true);

      setField.reset();

      await setField.mutateAsync({
        key: updatedField.key,
        params: updatedField,
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

  const columns: ColumnType<FieldHolder>[] = [
    {
      title: t("settings.extra_fields.params.key"),
      dataIndex: ["field", "key"],
      key: "key",
      width: "10%",
    },
    {
      title: t("settings.extra_fields.params.order"),
      dataIndex: ["field", "order"],
      key: "order",
      width: "3%",
    },
    {
      title: t("settings.extra_fields.params.name"),
      dataIndex: ["field", "name"],
    },
    {
      title: t("settings.extra_fields.params.field_type"),
      dataIndex: ["field", "field_type"],
      render(value) {
        return t(`settings.extra_fields.field_type.${value}`);
      },
      width: "15%",
    },
    {
      title: t("settings.extra_fields.params.unit"),
      dataIndex: ["field", "unit"],
      width: "6%",
    },
    {
      title: t("settings.extra_fields.params.default_value"),
      dataIndex: ["field", "default_value"],
      render(value, record) {
        const val = JSON.parse(value || "null");
        if (typeof val === "boolean") {
          return val ? t("settings.extra_fields.boolean_true") : t("settings.extra_fields.boolean_false");
        } else if (typeof val === "string" && record.field.field_type === FieldType.datetime) {
          return dayjs(val).format(dateTimeFormat);
        } else if (typeof val === "number" || typeof val === "string") {
          return val;
        } else if (Array.isArray(val) && record.field.field_type === FieldType.choice) {
          return val.join(", ");
        } else if (
          Array.isArray(val) && (
            record.field.field_type === FieldType.integer_range || record.field.field_type === FieldType.float_range
          )
        ) {
          let lower = val[0] ?? "";
          let upper = val[1] ?? "";
          if (lower === "" && upper === "") {
            return null;
          }
          return `${lower} \u2013 ${upper}`;
        } else {
          return null;
        }
      },
      width: "15%",
    },
    {
      title: t("settings.extra_fields.params.choices"),
      dataIndex: ["field", "choices"],
      render(value, record) {
        if (record.field.field_type === FieldType.choice && Array.isArray(value)) {
          return value.join(", ");
        } else {
          return null;
        }
      },
      width: "15%",
    },
    {
      title: t("settings.extra_fields.params.multi_choice"),
      dataIndex: ["field", "multi_choice"],
      render(value, record) {
        if (record.field.field_type === FieldType.choice) {
          return value ? t("settings.extra_fields.boolean_true") : t("settings.extra_fields.boolean_false");
        } else {
          return null;
        }
      },
      width: "10%",
    },
    {
      title: "",
      dataIndex: "operation",
      render: (_: unknown, record: FieldHolder) => {
        const editing = isEditing(record);
        return editing ? (
          <Space>
            <Button onClick={() => save(record)} size="small" type="primary">
              {t("buttons.save")}
            </Button>
            <Button onClick={() => cancel()} size="small">
              {t("buttons.cancel")}
            </Button>
          </Space>
        ) : (
          <>
            <Space>
              <Button disabled={editingKey !== ""} onClick={() => edit(record.field)} size="small">
                {t("buttons.edit")}
              </Button>
              <Popconfirm
                title={t("settings.extra_fields.delete_confirm", { name: record.field.name })}
                description={t("settings.extra_fields.delete_confirm_description", { name: record.field.name })}
                onConfirm={() => del(record.field)}
                disabled={editingKey !== ""}
                okText={t("buttons.delete")}
                cancelText={t("buttons.cancel")}
              >
                <Button disabled={editingKey !== ""} danger size="small">
                  {t("buttons.delete")}
                </Button>
              </Popconfirm>
            </Space>
          </>
        );
      },
      width: "10%",
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
    ...(fields.data || [])
      .sort((a, b) => a.order - b.order)
      .map((field) => ({
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
            onClick={() => addNewField()}
          />
        </Flex>
      )}
      {contextHolder}
    </>
  );
}
