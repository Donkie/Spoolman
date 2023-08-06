import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IFilament } from "../filaments/model";
import { ISpool } from "./model";

export const SpoolEdit: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { formProps, saveButtonProps } = useForm<ISpool>();

  const { queryResult } = useSelect<IFilament>({
    resource: "filament",
  });

  const filamentOptions = queryResult.data?.data.map((item) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = ""
	  if (item.material) {
      material = ` - ${item.material}`;
    }
    const label = `${vendorPrefix}${name}${material}`;

    return {
      label: label,
      value: item.id,
    };
  });

  if (formProps.initialValues) {
    formProps.initialValues["filament_id"] =
      formProps.initialValues["filament"].id;
  }

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("spool.fields.id")}
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
          label={t("spool.fields.registered")}
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
          label={t("spool.fields.first_used")}
          name={["first_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.last_used")}
          name={["last_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.filament")}
          name={["filament_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select options={filamentOptions} />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.used_weight")}
          help={t("spool.fields_help.used_weight")}
          name={["used_weight"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={0} />
          {/* TODO: Allow higher precision here.
          However, that requires that we can handle the , -> . replacement in the number parser
          more elegantly for locales which use , as a thousands separator. */}
        </Form.Item>
        <Form.Item
          label={t("spool.fields.location")}
          help={t("spool.fields_help.location")}
          name={["location"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.lot_nr")}
          help={t("spool.fields_help.lot_nr")}
          name={["lot_nr"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.comment")}
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

export default SpoolEdit;
