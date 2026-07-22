import { Edit, useForm } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { Alert, DatePicker, Form, Input, InputNumber, message, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import { useMemo, useState, useEffect } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { toComparableState } from "../../utils/formState";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor, IVendorEditForm, IVendorParsedExtras } from "./model";

/*
The API returns the extra fields as JSON values, but we need to parse them into their real types
in order for Ant design's form to work properly. ParsedExtras does this for us.
We also need to stringify them again before sending them back to the API, which is done by overriding
the form's onFinish method. Form.Item's normalize should do this, but it doesn't seem to work.
*/

// comparableDefaults is typed against IVendorEditForm so TypeScript will report a compile
// error here if a new editable field is added to the model without updating this list.
const comparableDefaults: Record<keyof IVendorEditForm, unknown> = {
  name: "",
  comment: "",
  empty_spool_weight: null,
  external_id: "",
  extra: {},
};
// This list is the source of truth for which inputs participate in the Save-button dirty check.

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

  // Initialize form fields and parse extra fields
  useEffect(() => {
    if (formProps.initialValues && formProps.form) {
      const parsed = ParsedExtras(formProps.initialValues);
      formProps.form.setFieldsValue(parsed as unknown as IVendor);
    }
  }, [formProps.form, formProps.initialValues?.id]);

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
      // Clear the live-update warning: user has seen and chosen to save over the conflict.
      // Dismissed on submit intent (not on server confirm) — useForm handles server errors separately.
      setHasChanged(false);
    }
  };

  const initialComparableState = useMemo(
    // ParsedExtras normalizes extra-field values from raw API JSON strings to their actual
    // types so the initial snapshot matches the form state that setFieldsValue produces.
    () =>
      toComparableState(
        formProps.initialValues ? ParsedExtras(formProps.initialValues) : formProps.initialValues,
        comparableDefaults,
      ),
    [formProps.initialValues],
  );
  const watchedComparableState = useMemo(
    () => toComparableState(watchedAllValues, comparableDefaults),
    [watchedAllValues],
  );
  const hasFormChanges =
    initialComparableState !== null &&
    watchedComparableState !== null &&
    initialComparableState !== watchedComparableState;
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
