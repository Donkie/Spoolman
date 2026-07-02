import { useTranslate } from "@refinedev/core";
import { Button, Col, Form, Row, Select, Typography, message } from "antd";
import { useEffect } from "react";
import SwatchPreview from "../../components/swatchPreview";
import { parseStringSettingValue, useGetSettings, useSetSetting } from "../../utils/querySettings";
import {
  DEFAULT_SWATCH_STYLE_KEY,
  SWATCH_STYLES,
  SwatchInput,
  buildSwatchLayoutForStyle,
  getSwatchStyle,
} from "../../utils/swatch";

const { Text } = Typography;

// Two demo filaments so the preview shows both marking colors: black text on a
// light filament and white text (with inverted QR) on a dark one.
const SAMPLE_LIGHT: SwatchInput = {
  id: 42,
  name: "Sunrise Yellow",
  vendorName: "Vendor",
  material: "PLA",
  diameterMm: 1.75,
  weightG: 1000,
  extruderTempC: 215,
  bedTempC: 60,
  articleNumber: "ART-0042",
  colorHexes: ["f5c211"],
  qrPayload: "WEB+SPOOLMAN:F-42",
};
const SAMPLE_DARK: SwatchInput = {
  ...SAMPLE_LIGHT,
  id: 7,
  name: "Galaxy Black",
  material: "PETG",
  extruderTempC: 240,
  bedTempC: 80,
  articleNumber: "ART-0007",
  colorHexes: ["23233a"],
  qrPayload: "WEB+SPOOLMAN:F-7",
};

export function SwatchSettings() {
  const settings = useGetSettings();
  const setSwatchStyle = useSetSetting("swatch_style");
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const t = useTranslate();

  // Set initial form values
  useEffect(() => {
    if (settings.data) {
      form.setFieldsValue({
        swatch_style: getSwatchStyle(parseStringSettingValue(settings.data.swatch_style?.value)).key,
      });
    }
  }, [settings.data, form]);

  // Popup message if setSetting is successful
  useEffect(() => {
    if (setSwatchStyle.isSuccess) {
      messageApi.success(t("notifications.saveSuccessful"));
    }
  }, [setSwatchStyle.isSuccess, messageApi, t]);

  const selectedStyleKey: string = Form.useWatch("swatch_style", form) ?? DEFAULT_SWATCH_STYLE_KEY;

  const onFinish = (values: { swatch_style: string }) => {
    if (settings.data?.swatch_style?.value !== JSON.stringify(values.swatch_style)) {
      setSwatchStyle.mutate(values.swatch_style);
    }
  };

  return (
    <>
      <Form form={form} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} onFinish={onFinish}>
        <Form.Item
          label={t("settings.swatch.default_style.label")}
          tooltip={t("settings.swatch.default_style.tooltip")}
          name="swatch_style"
        >
          <Select
            options={SWATCH_STYLES.map((style) => ({
              value: style.key,
              label: t(`filament.swatch.styles.${style.key}`, { defaultValue: style.name }),
            }))}
          />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
          <Button type="primary" htmlType="submit" loading={settings.isFetching || setSwatchStyle.isPending}>
            {t("buttons.save")}
          </Button>
        </Form.Item>
      </Form>
      <Text type="secondary">{t("settings.swatch.preview_description")}</Text>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <SwatchPreview layout={buildSwatchLayoutForStyle(SAMPLE_LIGHT, selectedStyleKey)} />
        </Col>
        <Col xs={24} lg={12}>
          <SwatchPreview layout={buildSwatchLayoutForStyle(SAMPLE_DARK, selectedStyleKey)} />
        </Col>
      </Row>
      {contextHolder}
    </>
  );
}
