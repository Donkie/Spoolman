import { Edit, useForm } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { Alert, DatePicker, Form, Input, InputNumber, message, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor, IVendorParsedExtras } from "./model";

/*
The API returns the extra fields as JSON values, but we need to parse them into their real types
in order for Ant design's form to work properly. ParsedExtras does this for us.
We also need to stringify them again before sending them back to the API, which is done by overriding
the form's onFinish method. Form.Item's normalize should do this, but it doesn't seem to work.
*/

export const VendorEdit = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);
  const extraFields = useGetFields(EntityType.vendor);

  const { formProps, saveButtonProps } = useForm<IVendor, HttpError, IVendor, IVendor>({
    liveMode: "manual",
    onLiveEvent() {
      // Warn the user if the vendor has been updated since the form was opened
      messageApi.warning(t("vendor.form.vendor_updated"));
      setHasChanged(true);
    },
  });
  const watchedAllValues = Form.useWatch([], formProps.form);

  // Parse the extra fields from string values into real types
  if (formProps.initialValues) {
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  // Override the form's onFinish method to stringify the extra fields
  const originalOnFinish = formProps.onFinish;
  formProps.onFinish = (allValues: IVendorParsedExtras) => {
    if (allValues !== undefined && allValues !== null) {
      // Lot of stupidity here to make types work
      const stringifiedAllValues = StringifiedExtras<IVendorParsedExtras>(allValues);
      originalOnFinish?.({
        extra: {},
        ...stringifiedAllValues,
      });
    }
  };

  const normalizeForCompare = (value: unknown): unknown => {
    if (dayjs.isDayjs(value)) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(normalizeForCompare);
    }
    if (value && typeof value === "object") {
      const objectValue = value as Record<string, unknown>;
      return Object.keys(objectValue)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const normalizedValue = normalizeForCompare(objectValue[key]);
          if (normalizedValue !== undefined) {
            acc[key] = normalizedValue;
          }
          return acc;
        }, {});
    }
    return value;
  };

  const toComparableState = (value: unknown): string => {
    const normalized = normalizeForCompare(value) as Record<string, unknown> | undefined;
    const normalizedExtra = { ...(normalized?.extra as Record<string, unknown> | undefined) };

    // Compare only the fields this form actually edits so live metadata and nested
    // objects do not keep the Save button permanently "dirty".
    return JSON.stringify({
      name: normalized?.name ?? "",
      comment: normalized?.comment ?? "",
      empty_spool_weight: normalized?.empty_spool_weight ?? null,
      external_id: normalized?.external_id ?? "",
      extra: normalizedExtra,
    });
  };

  const initialComparableState = useMemo(
    () => (formProps.initialValues ? toComparableState(formProps.initialValues) : null),
    [formProps.initialValues],
  );
  const watchedComparableState = useMemo(
    () => (watchedAllValues ? toComparableState(watchedAllValues) : null),
    [watchedAllValues],
  );
  const hasFormChanges =
    initialComparableState !== null && watchedComparableState !== null && initialComparableState !== watchedComparableState;
  const saveButtonState = {
    ...saveButtonProps,
    type: hasFormChanges ? ("primary" as const) : ("default" as const),
    disabled: saveButtonProps.disabled || !hasFormChanges,
  };

  return (
    <Edit saveButtonProps={saveButtonState}>
      {contextHolder}
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("vendor.fields.id")}
          name={["id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input readOnly disabled />
        </Form.Item>
        <Form.Item
          label={t("vendor.fields.registered")}
          name={["registered"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker disabled showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
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
        <Form.Item
          label={t("vendor.fields.external_id")}
          name={["external_id"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
      {hasChanged && <Alert description={t("vendor.form.vendor_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default VendorEdit;
