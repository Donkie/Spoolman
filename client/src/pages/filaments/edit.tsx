import { Edit, useForm, useSelect } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { Alert, ColorPicker, DatePicker, Form, Input, InputNumber, message, Radio, Select, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { MultiColorPicker } from "../../components/multiColorPicker";
import { toComparableState } from "../../utils/formState";
import { formatNumberOnUserInput, numberParser, numberParserAllowEmpty } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { getCurrencySymbol, useCurrency } from "../../utils/settings";
import { IVendor } from "../vendors/model";
import { IFilament, IFilamentParsedExtras } from "./model";

/*
The API returns the extra fields as JSON values, but we need to parse them into their real types
in order for Ant design's form to work properly. ParsedExtras does this for us.
We also need to stringify them again before sending them back to the API, which is done by overriding
the form's onFinish method. Form.Item's normalize should do this, but it doesn't seem to work.
*/

const comparableDefaults = {
  name: "",
  vendor_id: null,
  material: "",
  price: null,
  density: null,
  diameter: null,
  weight: null,
  spool_weight: null,
  settings_extruder_temp: null,
  settings_bed_temp: null,
  article_number: "",
  external_id: "",
  comment: "",
  color_hex: "",
  multi_color_direction: "",
  multi_color_hexes: "",
  extra: {},
} as const;
// This list is the source of truth for which inputs participate in the Save-button dirty check.

export const FilamentEdit = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);
  const extraFields = useGetFields(EntityType.filament);
  const currency = useCurrency();
  const [colorType, setColorType] = useState<"single" | "multi">("single");

  const { formProps, saveButtonProps } = useForm<IFilament, HttpError, IFilament, IFilament>({
    liveMode: "manual",
    onLiveEvent() {
      // Warn the user if the filament has been updated since the form was opened
      messageApi.warning(t("filament.form.filament_updated"));
      setHasChanged(true);
    },
  });

  // Get vendor selection options
  const { selectProps } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
    pagination: { mode: "off" },
  });
  const watchedAllValues = Form.useWatch([], formProps.form);

  // Initialize form fields and parse extra fields
  useEffect(() => {
    if (formProps.initialValues && formProps.form) {
      const parsed = ParsedExtras(formProps.initialValues);
      formProps.form.setFieldsValue({
        ...parsed,
        vendor_id: formProps.initialValues.vendor?.id,
      } as unknown as IFilament);
    }
  }, [formProps, formProps.initialValues?.id]);

  // Update colorType state
  useEffect(() => {
    if (formProps.initialValues?.multi_color_hexes) {
      setColorType("multi");
    } else {
      setColorType("single");
    }
  }, [formProps.initialValues?.multi_color_hexes]);

  // Override the form's onFinish method to stringify the extra fields
  const originalOnFinish = formProps.onFinish;
  formProps.onFinish = (allValues: IFilamentParsedExtras) => {
    if (allValues !== undefined && allValues !== null) {
      if (colorType == "single") {
        allValues.multi_color_hexes = "";
      }
      // Lot of stupidity here to make types work
      const stringifiedAllValues = StringifiedExtras<IFilamentParsedExtras>(allValues);
      originalOnFinish?.({
        extra: {},
        ...stringifiedAllValues,
      });
    }
  };

  const initialComparableState = useMemo(
    // ParsedExtras normalizes extra-field values from raw API JSON strings to their actual
    // types so the initial snapshot matches the form state that setFieldsValue produces.
    () =>
      toComparableState(
        formProps.initialValues ? ParsedExtras(formProps.initialValues) : formProps.initialValues,
        comparableDefaults,
        {
          // Single-color mode should ignore any dormant multi-color payload when deciding whether Save is needed.
          multi_color_hexes: (normalized: Record<string, unknown>) =>
            colorType === "single" ? "" : ((normalized.multi_color_hexes as string | undefined) ?? ""),
        },
      ),
    [formProps.initialValues, colorType],
  );
  const watchedComparableState = useMemo(
    () =>
      toComparableState(watchedAllValues, comparableDefaults, {
        multi_color_hexes: (normalized: Record<string, unknown>) =>
          colorType === "single" ? "" : ((normalized.multi_color_hexes as string | undefined) ?? ""),
      }),
    [watchedAllValues, colorType],
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
          label={t("filament.fields.id")}
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
          label={t("filament.fields.registered")}
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
          label={t("filament.fields.name")}
          help={t("filament.fields_help.name")}
          name={["name"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.vendor")}
          name={["vendor_id"]}
          rules={[
            {
              required: false,
            },
          ]}
          // Applying this to Form.Item Select's causes a cleared select to send null
          normalize={(value) => {
            if (value === undefined) {
              return null;
            }
            return value;
          }}
        >
          <Select
            {...selectProps}
            allowClear
            filterSort={(a, b) => {
              return a?.label && b?.label
                ? (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" })
                : 0;
            }}
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item label={t("filament.fields.color_hex")}>
          <Radio.Group
            onChange={(value) => {
              setColorType(value.target.value);
            }}
            defaultValue={colorType}
            value={colorType}
          >
            <Radio.Button value={"single"}>{t("filament.fields.single_color")}</Radio.Button>
            <Radio.Button value={"multi"}>{t("filament.fields.multi_color")}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {colorType == "single" && (
          <Form.Item
            name={"color_hex"}
            rules={[
              {
                required: false,
              },
            ]}
            getValueFromEvent={(e) => {
              return e?.toHex();
            }}
          >
            <ColorPicker />
          </Form.Item>
        )}
        {colorType == "multi" && (
          <Form.Item
            name={"multi_color_direction"}
            help={t("filament.fields_help.multi_color_direction")}
            rules={[
              {
                required: true,
              },
            ]}
            initialValue={"coaxial"}
          >
            <Radio.Group>
              <Radio.Button value={"coaxial"}>{t("filament.fields.coaxial")}</Radio.Button>
              <Radio.Button value={"longitudinal"}>{t("filament.fields.longitudinal")}</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}
        {colorType == "multi" && (
          <Form.Item
            name={"multi_color_hexes"}
            rules={[
              {
                required: false,
              },
            ]}
          >
            <MultiColorPicker min={2} max={14} />
          </Form.Item>
        )}
        <Form.Item
          label={t("filament.fields.material")}
          help={t("filament.fields_help.material")}
          name={["material"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.price")}
          help={t("filament.fields_help.price")}
          name={["price"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber
            addonAfter={getCurrencySymbol(undefined, currency)}
            precision={2}
            formatter={formatNumberOnUserInput}
            parser={numberParserAllowEmpty}
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.density")}
          name={["density"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 100,
            },
          ]}
        >
          <InputNumber addonAfter="g/cm³" precision={2} formatter={formatNumberOnUserInput} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.diameter")}
          name={["diameter"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 10,
            },
          ]}
        >
          <InputNumber addonAfter="mm" precision={2} formatter={formatNumberOnUserInput} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.weight")}
          help={t("filament.fields_help.weight")}
          name={["weight"]}
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
          label={t("filament.fields.spool_weight")}
          help={t("filament.fields_help.spool_weight")}
          name={["spool_weight"]}
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
          label={t("filament.fields.settings_extruder_temp")}
          name={["settings_extruder_temp"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.settings_bed_temp")}
          name={["settings_bed_temp"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.article_number")}
          help={t("filament.fields_help.article_number")}
          name={["article_number"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.external_id")}
          name={["external_id"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
      {hasChanged && <Alert description={t("filament.form.filament_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default FilamentEdit;
