import React, { useState } from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, ColorPicker, message, Alert } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { IVendor } from "../vendors/model";
import { IFilament } from "./model";

export const FilamentEdit: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);

  const { formProps, saveButtonProps } = useForm<IFilament>({
    liveMode: "manual",
    onLiveEvent() {
      // Warn the user if the filament has been updated since the form was opened
      messageApi.warning(t("filament.form.filament_updated"));
      setHasChanged(true);
    },
  });

  const { selectProps } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
  });

  if (formProps.initialValues) {
    formProps.initialValues["vendor_id"] = formProps.initialValues["vendor"]?.id;
  }

  return (
    <Edit saveButtonProps={saveButtonProps}>
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
        <Form.Item
          label={t("filament.fields.color_hex")}
          name={["color_hex"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueFromEvent={(e) => {
            return e?.toHex();
          }}
        >
          <ColorPicker format="hex" />
        </Form.Item>
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
          <InputNumber precision={2} formatter={numberFormatter} parser={numberParser} />
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
          <InputNumber addonAfter="g/cm³" precision={2} formatter={numberFormatter} parser={numberParser} />
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
          <InputNumber addonAfter="mm" precision={2} formatter={numberFormatter} parser={numberParser} />
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
      </Form>
      {hasChanged && <Alert description={t("filament.form.filament_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default FilamentEdit;
