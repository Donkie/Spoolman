import { CameraOutlined, ScanOutlined, WifiOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { FloatButton, Modal, Segmented, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { NfcScannerPanel, useNfcAvailability } from "./nfcScannerModal";
import { QRScannerPanel } from "./qrCodeScanner";

const { Text } = Typography;

/**
 * Unified "Scan" affordance for the global chrome. A single floating button opens
 * one modal that offers camera/QR scanning, plus an NFC option when server-side or
 * Web NFC scanning is available. On desktop browsers without Web NFC it is QR-only,
 * with a hint that NFC scanning needs Android Chrome. Both scanning surfaces are
 * composed from the existing scanner panels rather than reimplemented.
 */
const ScanModal = () => {
  const t = useTranslate();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"qr" | "nfc">("qr");

  const { available: nfcAvailable } = useNfcAvailability();

  // If NFC stops being available while the modal is open, fall back to QR.
  useEffect(() => {
    if (!nfcAvailable && mode === "nfc") {
      setMode("qr");
    }
  }, [nfcAvailable, mode]);

  const close = () => setVisible(false);

  return (
    <>
      <FloatButton type="primary" onClick={() => setVisible(true)} icon={<ScanOutlined />} shape="circle" />
      <Modal open={visible} destroyOnHidden onCancel={close} footer={null} title={t("scan.title")}>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          {nfcAvailable ? (
            <Segmented
              block
              options={[
                { label: t("scan.qr"), value: "qr", icon: <CameraOutlined /> },
                { label: t("scan.nfc"), value: "nfc", icon: <WifiOutlined /> },
              ]}
              value={mode}
              onChange={(value) => setMode(value as "qr" | "nfc")}
            />
          ) : (
            <Text type="secondary">{t("scan.nfc_hint")}</Text>
          )}
          {mode === "qr" && <QRScannerPanel onClose={close} />}
          {mode === "nfc" && nfcAvailable && <NfcScannerPanel active={visible && mode === "nfc"} onClose={close} />}
        </Space>
      </Modal>
    </>
  );
};

export default ScanModal;
