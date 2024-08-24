import { Create, useForm } from "@refinedev/antd";
import { HttpError, IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Button, Form, Input, InputNumber, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor, IVendorParsedExtras } from "./model";

dayjs.extend(utc);

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const VendorCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.vendor);

  const { form, formProps, formLoading, onFinish, redirect } = useForm<
    IVendor,
    HttpError,
    IVendorParsedExtras,
    IVendorParsedExtras
  >();

  if (!formProps.initialValues) {
    formProps.initialValues = {};
  }

  if (props.mode === "clone") {
    // Parse the extra fields from string values into real types
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  const handleSubmit = async (redirectTo: "list" | "edit" | "create") => {
    const values = StringifiedExtras(await form.validateFields());
    await onFinish(values);
    redirect(redirectTo, (values as IVendor).id);
  };

  // Use useEffect to update the form's initialValues when the extra fields are loaded
  // This is necessary because the form is rendered before the extra fields are loaded
  useEffect(() => {
    extraFields.data?.forEach((field) => {
      if (formProps.initialValues && field.default_value) {
        const parsedValue = JSON.parse(field.default_value as string);
        form.setFieldsValue({ extra: { [field.key]: parsedValue } });
      }
    });
  }, [form, extraFields.data, formProps.initialValues]);

  return (
    <Create
      title={props.mode === "create" ? t("vendor.titles.create") : t("vendor.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <Button type="primary" onClick={() => handleSubmit("list")}>
            {t("buttons.save")}
          </Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>
            {t("buttons.saveAndAdd")}
          </Button>
        </>
      )}
    >
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("vendor.fields.name")}
          name={["name"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("vendor.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
        <Form.Item
          label={t("vendor.fields.empty_spool_weight")}
          help={t("vendor.fields_help.empty_spool_weight")}
          name={["empty_spool_weight"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="g" precision={1} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
    </Create>
  );
};

export default VendorCreate;
