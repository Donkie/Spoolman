import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";
import TextArea from "antd/es/input/TextArea";
import { IVendor } from "./model";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const VendorCreate: React.FC<
  IResourceComponentsProps & CreateOrCloneProps
> = (props) => {
  const t = useTranslate();

  const { formProps, saveButtonProps, formLoading } = useForm<IVendor>();

  return (
    <Create
      title={
        props.mode === "create"
          ? t("vendor.titles.create")
          : t("vendor.titles.clone")
      }
      isLoading={formLoading}
      saveButtonProps={saveButtonProps}
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
      </Form>
    </Create>
  );
};
