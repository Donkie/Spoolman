import React from "react";
import { IResourceComponentsProps } from "@refinedev/core";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";

export const SpoolCreate: React.FC<IResourceComponentsProps> = () => {
  const { formProps, saveButtonProps, queryResult } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="First Used"
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
          <DatePicker format="lll" />
        </Form.Item>
        <Form.Item
          label="Last Used"
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
          <DatePicker format="lll" />
        </Form.Item>
        <Form.Item
          label="Filament"
          name={["filament", "name"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          {/* <Select {...filamentSelectProps} /> */}
        </Form.Item>
        <Form.Item
          label="Used Weight"
          name={["used_weight"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" />
        </Form.Item>
        <Form.Item
          label="Location"
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
          label="Lot Nr"
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
