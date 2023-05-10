import React from "react";
import { IResourceComponentsProps } from "@refinedev/core";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";

export const SpoolEdit: React.FC<IResourceComponentsProps> = () => {
  const { formProps, saveButtonProps, queryResult } = useForm();

  const spoolData = queryResult?.data?.data;

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Id"
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
          label="Registered"
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
          <DatePicker disabled format="lll" />
        </Form.Item>
        <Form.Item
          label="First Used"
          name={["first_used"]}
          rules={[
            {
              required: true,
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
              required: true,
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
          <Input min={0} addonAfter="g" />
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
    </Edit>
  );
};
