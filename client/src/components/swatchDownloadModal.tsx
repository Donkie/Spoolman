import { DownloadOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Form, Modal, Radio, Select, Typography } from "antd";
import { useMemo, useState } from "react";
import { buildScanPayload } from "../utils/scan";
import { parseStringSettingValue, useGetSetting } from "../utils/querySettings";
import { useSavedState } from "../utils/saveload";
import {
  SWATCH_STYLES,
  SwatchFilamentFields,
  buildSwatchLayoutForStyle,
  generateFilamentSwatch,
  getSwatchStyle,
  saveBinaryFile,
  swatchInputFromFilament,
} from "../utils/swatch";
import SwatchPreview from "./swatchPreview";

const { Text } = Typography;

interface SwatchDownloadModalProps {
  /** The filament to generate a swatch for; null keeps the modal closed. */
  filament: SwatchFilamentFields | null;
  /** Vendor name override for callers whose records have no vendor object (collapsed table rows). */
  vendorName?: string;
  onClose: () => void;
}

/**
 * Modal that previews and downloads a 3D-printable swatch card (3MF) for a
 * filament: base card in the filament color, label text + QR code as a
 * one-layer top part in black or white depending on the filament color.
 */
const SwatchDownloadModal = ({ filament, vendorName, onClose }: SwatchDownloadModalProps) => {
  const t = useTranslate();
  const baseUrlSetting = useGetSetting("base_url");
  const baseUrl = parseStringSettingValue(baseUrlSetting.data?.value);
  const baseUrlRoot = baseUrl !== "" ? baseUrl : window.location.origin;
  const [useHTTPUrl, setUseHTTPUrl] = useSavedState("swatch-useHTTPUrl", false);

  // The server-wide default style (settings page); the select below can
  // override it for a single download.
  const styleSetting = useGetSetting("swatch_style");
  const defaultStyleKey = getSwatchStyle(parseStringSettingValue(styleSetting.data?.value)).key;
  const [styleOverride, setStyleOverride] = useState<string | null>(null);
  const styleKey = styleOverride ?? defaultStyleKey;

  const input = useMemo(() => {
    if (!filament) return null;
    return swatchInputFromFilament(filament, {
      qrPayload: buildScanPayload("filament", filament.id, useHTTPUrl ? baseUrlRoot : undefined),
      vendorName,
    });
  }, [filament, vendorName, useHTTPUrl, baseUrlRoot]);
  const layout = useMemo(() => (input ? buildSwatchLayoutForStyle(input, styleKey) : null), [input, styleKey]);

  const markingColorName =
    layout?.markingColor === "white" ? t("filament.swatch.marking_white") : t("filament.swatch.marking_black");

  return (
    <Modal
      open={filament !== null}
      title={t("filament.swatch.title")}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t("buttons.cancel")}
        </Button>,
        <Button
          key="download"
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => {
            if (!input) return;
            const { data, filename } = generateFilamentSwatch(input, styleKey);
            saveBinaryFile(data, filename);
          }}
        >
          {t("filament.swatch.download")}
        </Button>,
      ]}
    >
      {layout && input && (
        <>
          <Text type="secondary">
            {t("filament.swatch.description", {
              width: layout.widthMm,
              height: layout.heightMm,
              color: markingColorName,
            })}
          </Text>
          <div style={{ margin: "16px 0" }}>
            <SwatchPreview layout={layout} />
          </div>
          {layout.textLines.some((line) => line.truncated) && (
            <div>
              <Text type="warning">{t("filament.swatch.truncated_warning")}</Text>
            </div>
          )}
          <Form layout="vertical">
            <Form.Item label={t("filament.swatch.style")} style={{ marginBottom: 8, marginTop: 8 }}>
              <Select
                value={styleKey}
                onChange={(value) => setStyleOverride(value)}
                options={SWATCH_STYLES.map((style) => ({
                  value: style.key,
                  label: t(`filament.swatch.styles.${style.key}`, { defaultValue: style.name }),
                }))}
              />
            </Form.Item>
            <Form.Item
              label={t("printing.qrcode.useHTTPUrl.label")}
              tooltip={t("printing.qrcode.useHTTPUrl.tooltip")}
              style={{ marginBottom: 0 }}
            >
              <Radio.Group onChange={(e) => setUseHTTPUrl(e.target.value)} value={useHTTPUrl}>
                <Radio value={false}>{t("printing.qrcode.useHTTPUrl.options.default")}</Radio>
                <Radio value={true}>{t("printing.qrcode.useHTTPUrl.options.url")}</Radio>
              </Radio.Group>
            </Form.Item>
            <Text code style={{ overflowWrap: "anywhere" }}>
              {input.qrPayload}
            </Text>
          </Form>
          <Text type="secondary">{t("filament.swatch.print_hint", { color: markingColorName })}</Text>
        </>
      )}
    </Modal>
  );
};

export default SwatchDownloadModal;
