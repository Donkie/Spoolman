import React, { useEffect, useRef, useState } from "react";
import { Button, FloatButton, Modal, Space } from "antd";
import QrScanner from "qr-scanner"; // Make sure to import from the correct path
import { useNavigate } from "react-router-dom";
import { CameraOutlined } from "@ant-design/icons";

const QRCodeScannerModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanner = useRef<QrScanner | null>(null);
  const navigate = useNavigate();
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    const onScan = (result: string) => {
      // Check for the spoolman ID format
      const match = result.match(/^web+spoolman:s-(?<id>[0-9]+)$/);
      if (match && match.groups) {
        navigate(`/spool/show/${match.groups.id}`);
      }
    };

    const startCamera = async () => {
      console.log("Starting camera");
      if (!(await QrScanner.hasCamera())) {
        console.log("No camera found on this device");
        setHasCamera(false);
        return;
      } else {
        console.log("Camera found on this device");
        setHasCamera(true);
        if (videoRef.current) {
          scanner.current = new QrScanner(
            videoRef.current,
            (result) => {
              console.log("QR Code detected:", result);
              onScan(result.data);
            },
            {
              preferredCamera: "environment",
            }
          );
          console.log("Starting scanner");
          try {
            await scanner.current.start();
          } catch (e) {
            setHasCamera(false);
            console.log(e);
          }
        } else {
          console.log("No video ref");
        }
      }
    };
    if (visible) {
      startCamera();
    }

    return () => {
      console.log("Destroying scanner");
      scanner.current?.destroy();
      scanner.current = null;
    };
  }, [visible, navigate]);

  // Draw a centered div if no camera was found

  return (
    <>
      <FloatButton
        type="primary"
        onClick={() => setVisible(true)}
        icon={<CameraOutlined />}
        shape="circle"
      />
      <Modal
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        title="QR Code Scanner"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <p>Scan a Spoolman QR code to view details about the spool.</p>
          <video
            style={{
              width: "100%",
              display: hasCamera ? "block" : "none",
            }}
            ref={videoRef}
          />
          {!hasCamera && (
            <div
              style={{
                width: "100%",
                position: "relative",
                backgroundColor: "black",
                display: hasCamera ? "none" : "block",
                padding: "4rem 0rem",
                textAlign: "center",
              }}
            >
              No camera detected.
              <br />
              <br />
              Ensure you have given the browser permission to use the camera.
            </div>
          )}
        </Space>
      </Modal>
    </>
  );
};

export default QRCodeScannerModal;
