import React from "react";
import { IResourceComponentsProps } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, ColorPicker } from "antd";
import TextArea from "antd/es/input/TextArea";
import { IVendor } from "../vendors/model";

export const FilamentCreate: React.FC<IResourceComponentsProps> = () => {
  const { formProps, saveButtonProps } = useForm();

  const { selectProps } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Name"
          help="Filament name, to distinguish this filament type among others from the same vendor. Should contain the color for example."
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
          label="Vendor"
          name={["vendor_id"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Select {...selectProps} allowClear />
        </Form.Item>
        <Form.Item
          label="Color"
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
          label="Material"
          help="E.g. PLA, ABS, PETG, etc."
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
          label="Price"
          help="Price of a full spool in the system configured currency."
          name={["price"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} />
        </Form.Item>
        <Form.Item
          label="Density"
          name={["density"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g/cm³" />
        </Form.Item>
        <Form.Item
          label="Diameter"
          name={["diameter"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="mm" />
        </Form.Item>
        <Form.Item
          label="Weight"
          help="The filament weight of a full spool (net weight)."
          name={["weight"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" />
        </Form.Item>
        <Form.Item
          label="Spool Weight"
          help="The weight of an empty spool."
          name={["spool_weight"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" />
        </Form.Item>
        <Form.Item
          label="Override Extruder Temperature"
          help="Override the extruder temperature for this filament type."
          name={["settings_extruder_temp"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="°C" />
        </Form.Item>
        <Form.Item
          label="Override Bed Temperature"
          help="Override the bed temperature for this filament type."
          name={["settings_bed_temp"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="°C" />
        </Form.Item>
        <Form.Item
          label="Article Number"
          name={["article_number"]}
          help="E.g. EAN, UPC, etc."
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label="Comment"
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
    </Create>
  );
};
