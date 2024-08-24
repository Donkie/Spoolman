import { useTranslate } from "@refinedev/core";
import { Button, Form, Input, message } from "antd";
import { useEffect } from "react";
import { useGetSettings, useSetSetting } from "../../utils/querySettings";

export function GeneralSettings() {
  const settings = useGetSettings();
  const setQrCodeUrl = useSetSetting("qr_code_url");
  const setCurrency = useSetSetting("currency");
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const t = useTranslate();

  // Set initial form values
  useEffect(() => {
    if (settings.data) {
      form.setFieldsValue({
        currency: JSON.parse(settings.data.currency.value),
        qr_code_url: JSON.parse(settings.data.qr_code_url.value),
      });
    }
  }, [settings.data, form]);

  // Popup message if setSetting is successful
  useEffect(() => {
    if (setCurrency.isSuccess) {
      messageApi.success(t("notifications.saveSuccessful"));
    }
  }, [setCurrency.isSuccess, messageApi, t]);

  // Handle form submit
  const onFinish = (values: { currency: string; qr_code_url: string }) => {
    // Check if the currency has changed
    if (settings.data?.currency.value !== JSON.stringify(values.currency)) {
      setCurrency.mutate(values.currency);
    }
    // Check if the QR code URL has changed
    if (settings.data?.qr_code_url.value !== JSON.stringify(values.qr_code_url)) {
      setQrCodeUrl.mutate(values.qr_code_url);
    }
  };

  return (
    <>
      <Form
        form={form}
        labelCol={{ span: 8 }}
        wrapperCol={{ span: 16 }}
        initialValues={{
          currency: settings.data?.currency.value,
        }}
        onFinish={onFinish}
        style={{
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        <Form.Item
          label={t("settings.general.currency.label")}
          name="currency"
          rules={[
            {
              required: true,
            },
            {
              pattern: /^[A-Z]{3}$/,
            },
          ]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label={t("settings.general.qr_code_url.label")}
          tooltip={t("settings.general.qr_code_url.tooltip")}
          name="qr_code_url"
          rules={[
            {
              required: false,
            },
            {
              pattern: /^https?:\/\/.*/,
            },
          ]}
        >
          <Input placeholder="https://example.com:8000/" />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
          <Button type="primary" htmlType="submit" loading={settings.isFetching || setCurrency.isLoading}>
            {t("buttons.save")}
          </Button>
        </Form.Item>
      </Form>
      {contextHolder}
    </>
  );
}
