import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm } from "@refinedev/antd";
import { Button, Form, Input } from "antd";
import TextArea from "antd/es/input/TextArea";
import { IVendor } from "./model";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const VendorCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const { form, formProps, saveButtonProps, formLoading, onFinish, redirect } = useForm<IVendor>();

  const handleSubmit = async (redirectTo: "list" | "edit" | "create") => {
    let values = await form.validateFields();
    await onFinish(values);
    redirect(redirectTo, (values as IVendor).id);
  }

  return (
    <Create
      title={props.mode === "create" ? t("vendor.titles.create") : t("vendor.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <Button type="primary" onClick={() => handleSubmit("list")}>{t("buttons.save")}</Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>{t("buttons.saveAndAdd")}</Button>
        </>
      )}
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

export default VendorCreate;
