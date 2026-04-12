import { DownloadOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Alert, Button, Descriptions, Input, Modal, Segmented, Space, Spin, Typography } from "antd";
import React, { useCallback, useState } from "react";
import { isWebNfcSupported, useNfcEncode, useNfcStatus, useNfcWrite } from "../utils/nfc";
import { ISpool } from "../pages/spools/model";
import { encodeTigerTag, mapSpoolToTigerTag } from "../utils/tigertagCodec";

const { Text } = Typography;

interface NfcWriteModalProps {
  spool?: ISpool;
  visible: boolean;
  onClose: () => void;
}

const NfcWriteModal: React.FC<NfcWriteModalProps> = ({ spool, visible, onClose }) => {
  const [modeOverride, setModeOverride] = useState<"browser" | "server" | null>(null);
  const [tagFormat, setTagFormat] = useState<"tigertag" | "qidi">("tigertag");
  const [userMessage, setUserMessage] = useState("");
  const [browserWriting, setBrowserWriting] = useState(false);
  const [browserResult, setBrowserResult] = useState<{ success: boolean; message: string } | null>(null);
  const t = useTranslate();

  const nfcStatus = useNfcStatus();
  const nfcWriteMutation = useNfcWrite();
  const nfcEncodeMutation = useNfcEncode();

  const serverEnabled = nfcStatus.data?.enabled === true && nfcStatus.data?.status === "connected";
  const webNfcAvailable = isWebNfcSupported();

  // Default to server if available, then browser, then browser anyway (for download button)
  const mode = modeOverride ?? (serverEnabled ? "server" : "browser");
  const canWrite = mode === "server" ? serverEnabled : webNfcAvailable;

  const handleServerWrite = useCallback(async () => {
    if (!spool) return;

    await nfcWriteMutation.mutateAsync({
      spool_id: spool.id,
      tag_format: tagFormat,
      user_message: tagFormat === "tigertag" ? userMessage : undefined,
    });
  }, [spool, userMessage, tagFormat, nfcWriteMutation]);

  const handleBrowserWrite = useCallback(async () => {
    if (!spool || !window.NDEFReader) {
      setBrowserResult({ success: false, message: t("nfc.error.not_supported") });
      return;
    }

    setBrowserWriting(true);
    setBrowserResult(null);

    try {
      const reader = new window.NDEFReader();
      const tagData = mapSpoolToTigerTag(spool, userMessage);
      const binaryPayload = encodeTigerTag(tagData);

      // Write as NDEF external type record with TigerTag binary payload
      await reader.write({
        records: [
          {
            recordType: "tigertag.io:maker",
            data: binaryPayload,
          },
        ],
      });

      setBrowserWriting(false);
      setBrowserResult({ success: true, message: t("nfc.browser_write_success") });
    } catch (error) {
      setBrowserWriting(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setBrowserResult({ success: false, message: t("nfc.error.permission_denied") });
      } else {
        setBrowserResult({ success: false, message: t("nfc.write_error") });
      }
    }
  }, [spool, userMessage, t]);

  const handleDownloadBinary = useCallback(async () => {
    if (!spool) return;

    try {
      const result = await nfcEncodeMutation.mutateAsync({
        spool_id: spool.id,
        user_message: userMessage,
      });

      if (result.success && result.binary_b64) {
        const binaryString = atob(result.binary_b64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spool-${spool.id}-tigertag.bin`;
        a.click();
        URL.revokeObjectURL(url);
        setBrowserResult({ success: true, message: t("nfc.download_success") });
      } else {
        setBrowserResult({ success: false, message: result.message || t("nfc.error.encode_failed") });
      }
    } catch {
      setBrowserResult({ success: false, message: t("nfc.error.encode_failed") });
    }
  }, [spool, userMessage, nfcEncodeMutation, t]);

  const handleOk = () => {
    if (mode === "server") {
      handleServerWrite();
    } else {
      handleBrowserWrite();
    }
  };

  const filament = spool?.filament;

  return (
    <Modal
      title={t("nfc.encode_title")}
      open={visible}
      onOk={handleOk}
      onCancel={() => {
        onClose();
        setBrowserResult(null);
        setUserMessage("");
        setModeOverride(null);
        setTagFormat("tigertag");
      }}
      okText={nfcWriteMutation.isPending || browserWriting ? t("nfc.writing") : t("nfc.encode_button")}
      okButtonProps={{ loading: nfcWriteMutation.isPending || browserWriting, disabled: !canWrite }}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Segmented
          block
          options={[
            { label: t("nfc.mode_server"), value: "server", disabled: !serverEnabled },
            { label: t("nfc.mode_browser"), value: "browser" },
          ]}
          value={mode}
          onChange={(value) => setModeOverride(value as "browser" | "server")}
        />

        {mode === "server" && (
          <div>
            <Text>{t("nfc.tag_format_label")}</Text>
            <Segmented
              block
              options={[
                { label: "TigerTag (NTAG213)", value: "tigertag" },
                { label: "Qidi (MIFARE Classic)", value: "qidi" },
              ]}
              value={tagFormat}
              onChange={(value) => setTagFormat(value as "tigertag" | "qidi")}
              style={{ marginTop: 4 }}
            />
          </div>
        )}

        {filament && (
          <>
            <Text strong>{t("nfc.preview_title")}</Text>
            <Descriptions column={1} size="small" bordered>
              {filament.vendor && (
                <Descriptions.Item label={t("filament.fields.vendor")}>{filament.vendor.name}</Descriptions.Item>
              )}
              {filament.name && (
                <Descriptions.Item label={t("filament.fields.name")}>{filament.name}</Descriptions.Item>
              )}
              {filament.material && (
                <Descriptions.Item label={t("filament.fields.material")}>{filament.material}</Descriptions.Item>
              )}
              <Descriptions.Item label={t("filament.fields.diameter")}>{filament.diameter} mm</Descriptions.Item>
              {filament.color_hex && (
                <Descriptions.Item label={t("filament.fields.color_hex")}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 16,
                      height: 16,
                      backgroundColor: `#${filament.color_hex}`,
                      border: "1px solid #ccc",
                      marginRight: 8,
                      verticalAlign: "middle",
                    }}
                  />
                  #{filament.color_hex}
                </Descriptions.Item>
              )}
              {filament.weight && (
                <Descriptions.Item label={t("filament.fields.weight")}>{filament.weight} g</Descriptions.Item>
              )}
              {filament.settings_extruder_temp && (
                <Descriptions.Item label={t("filament.fields.settings_extruder_temp")}>
                  {filament.settings_extruder_temp} °C
                </Descriptions.Item>
              )}
              {filament.settings_bed_temp && (
                <Descriptions.Item label={t("filament.fields.settings_bed_temp")}>
                  {filament.settings_bed_temp} °C
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}

        {tagFormat === "tigertag" && (
          <div>
            <Text>{t("nfc.user_message")}</Text>
            <Input
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value.slice(0, 28))}
              maxLength={28}
              placeholder={t("nfc.user_message_help")}
            />
          </div>
        )}

        {tagFormat === "qidi" && mode === "server" && (
          <Alert type="info" message={t("nfc.qidi_write_info")} showIcon />
        )}

        {mode === "server" && (nfcWriteMutation.isPending || browserWriting) && (
          <Spin tip={t("nfc.place_tag")}>
            <div style={{ padding: 30 }} />
          </Spin>
        )}

        {mode === "server" && nfcWriteMutation.isSuccess && (
          <Alert
            type={nfcWriteMutation.data?.success ? "success" : "error"}
            message={nfcWriteMutation.data?.message}
            showIcon
          />
        )}

        {mode === "server" && nfcWriteMutation.isError && (
          <Alert type="error" message={t("nfc.write_error")} showIcon />
        )}

        {mode === "browser" && browserWriting && (
          <Spin tip={t("nfc.place_tag")}>
            <div style={{ padding: 30 }} />
          </Spin>
        )}

        {mode === "browser" && browserResult && (
          <Alert
            type={browserResult.success ? "success" : "error"}
            message={browserResult.message}
            showIcon
          />
        )}

        {mode === "browser" && (
          <>
            <Alert type="warning" message={t("nfc.browser_ndef_warning")} showIcon />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadBinary}
              loading={nfcEncodeMutation.isPending}
            >
              {t("nfc.download_raw_binary")}
            </Button>
          </>
        )}
      </Space>
    </Modal>
  );
};

export default NfcWriteModal;
