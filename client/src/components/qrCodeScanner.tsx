import React, { useState } from "react";
import { FloatButton, Modal, Space } from "antd";
import { QrScanner } from "@yudiel/react-qr-scanner";
import { useNavigate } from "react-router-dom";
import { CameraOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";

const QRCodeScannerModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const t = useTranslate();
  const navigate = useNavigate();

  const onScan = (result: string) => {
    // Check for the spoolman ID format
    const match = result.match(/^web\+spoolman:s-(?<id>[0-9]+)$/);
    if (match && match.groups) {
      setVisible(false);
      navigate(`/spool/show/${match.groups.id}`);
    }
  };

  return (
    <>
      <FloatButton type="primary" onClick={() => setVisible(true)} icon={<CameraOutlined />} shape="circle" />
      <Modal open={visible} onCancel={() => setVisible(false)} footer={null} title={t("scanner.title")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <p>{t("scanner.description")}</p>
          <QrScanner
            viewFinder={
              lastError
                ? () => (
                    <div
                      style={{
                        position: "absolute",
                        textAlign: "center",
                        width: "100%",
                        top: "50%",
                      }}
                    >
                      <p>{lastError}</p>
                    </div>
                  )
                : undefined
            }
            onDecode={onScan}
            onError={(error: Error) => {
              console.error(error);
              if (error.name === "NotAllowedError") {
                setLastError(t("scanner.error.notAllowed"));
              } else if (
                error.name === "InsecureContextError" ||
                (location.protocol !== "https:" && navigator.mediaDevices === undefined)
              ) {
                setLastError(t("scanner.error.insecureContext"));
              } else if (error.name === "StreamApiNotSupportedError") {
                setLastError(t("scanner.error.streamApiNotSupported"));
              } else if (error.name === "NotReadableError") {
                setLastError(t("scanner.error.notReadable"));
              } else {
                setLastError(t("scanner.error.unknown", { error: error.name }));
              }
            }}
          />
        </Space>
      </Modal>
    </>
  );
};

export default QRCodeScannerModal;
