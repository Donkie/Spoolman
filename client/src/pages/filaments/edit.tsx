import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import {
  Form,
  Input,
  DatePicker,
  Select,
  InputNumber,
  ColorPicker,
} from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { IVendor } from "../vendors/model";
import { IFilament } from "./model";

export const FilamentEdit: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { formProps, saveButtonProps } = useForm<IFilament>();

  const { selectProps } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
  });

  if (formProps.initialValues) {
    formProps.initialValues["vendor_id"] =
      formProps.initialValues["vendor"]?.id;
  }

  return (
    <Edit saveButtonProps={saveButtonProps}>
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
          <Select {...selectProps} allowClear />
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
            },
          ]}
        >
          <InputNumber
            min={0}
            precision={2}
            formatter={numberFormatter}
            parser={numberParser}
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.density")}
          name={["density"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber
            min={0}
            addonAfter="g/cm³"
            precision={3}
            formatter={numberFormatter}
            parser={numberParser}
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.diameter")}
          name={["diameter"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber
            min={0}
            addonAfter="mm"
            precision={2}
            formatter={numberFormatter}
            parser={numberParser}
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.weight")}
          help={t("filament.fields_help.weight")}
          name={["weight"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.spool_weight")}
          help={t("filament.fields_help.spool_weight")}
          name={["spool_weight"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.settings_extruder_temp")}
          name={["settings_extruder_temp"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.settings_bed_temp")}
          name={["settings_bed_temp"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="°C" precision={0} />
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
    </Edit>
  );
};

export default FilamentEdit;
