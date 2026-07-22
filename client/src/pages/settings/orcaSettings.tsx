import {
  AppleFilled,
  CheckCircleFilled,
  CloudDownloadOutlined,
  CloudOutlined,
  GoogleOutlined,
} from "@ant-design/icons";
import { Alert, Button, Divider, Form, Input, Space, Statistic, Steps, Typography } from "antd";
import { useState } from "react";
import { useOrcaConnectionStatus } from "../../utils/queryOrca";
import { getAPIURL } from "../../utils/url";

const { Title, Paragraph, Text } = Typography;

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export function OrcaSettings() {
  const [callbackForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [connecting, setConnecting] = useState(false);
  const [startingProvider, setStartingProvider] = useState<"google" | "apple" | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const connectionStatus = useOrcaConnectionStatus();

  const startSignIn = async (provider: "google" | "apple") => {
    setStartingProvider(provider);
    setConnectError(null);
    try {
      const resp = await fetch(`${getAPIURL()}/orca/auth/start?provider=${provider}`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? "Could not start sign-in");
      setSessionId(data.session_id as string);
      window.open(data.auth_url as string, "_blank", "noopener");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Network error");
    } finally {
      setStartingProvider(null);
    }
  };

  const onCallbackFinish = async (values: { callback_url: string }) => {
    if (!sessionId) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const cbResp = await fetch(`${getAPIURL()}/orca/auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, callback_url: values.callback_url.trim() }),
      });
      const cbData = await cbResp.json();
      if (!cbResp.ok) throw new Error(cbData.message ?? "Sign-in failed");

      setSessionId(null);
      callbackForm.resetFields();
      await connectionStatus.refetch();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Network error");
    } finally {
      setConnecting(false);
    }
  };

  const onPasswordFinish = async (values: { email: string; password: string }) => {
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      const resp = await fetch(`${getAPIURL()}/orca/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? "Sign-in failed");

      passwordForm.resetFields();
      await connectionStatus.refetch();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPasswordLoading(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(`${getAPIURL()}/orca/auth`, { method: "DELETE" });
      setResult(null);
      await connectionStatus.refetch();
    } finally {
      setDisconnecting(false);
    }
  };

  const runBulkImport = async () => {
    setImporting(true);
    setImportError(null);
    setResult(null);
    try {
      const importResp = await fetch(`${getAPIURL()}/orca/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const importData = await importResp.json();
      if (!importResp.ok) throw new Error(importData.message ?? "Import failed");
      setResult(importData as ImportResult);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Network error");
    } finally {
      setImporting(false);
    }
  };

  const resultBlock = result && (
    <>
      <Divider />
      <Alert type="success" message="Import complete" showIcon style={{ maxWidth: 520, marginBottom: 16 }} />
      <Space size="large">
        <Statistic title="Created" value={result.created} valueStyle={{ color: "#3f8600" }} />
        <Statistic title="Updated" value={result.updated} valueStyle={{ color: "#1677ff" }} />
        <Statistic title="Skipped" value={result.skipped} valueStyle={{ color: "#888" }} />
      </Space>
      <Text type="secondary" style={{ display: "block", marginTop: 12 }}>
        Skipped profiles are non-filament entries (printer configs, process settings, etc.)
      </Text>
    </>
  );

  const connected = connectionStatus.data?.connected === true;

  return (
    <>
      <Title level={4}>
        <CloudOutlined style={{ marginRight: 8 }} />
        OrcaCloud
      </Title>
      <Paragraph type="secondary">
        Connect Spoolman to your OrcaCloud account. Once connected, use the <Text strong>Link OrcaCloud Profile</Text>{" "}
        button on a filament&apos;s create/edit page to assign it a synced profile and fill in matching extra fields —
        nothing is created or changed automatically just by connecting.
      </Paragraph>

      {connected ? (
        <Space direction="vertical" style={{ marginBottom: 16 }}>
          <Space>
            <CheckCircleFilled style={{ color: "#3f8600" }} />
            <Text strong>Connected to OrcaCloud</Text>
            <Button size="small" danger loading={disconnecting} onClick={disconnect}>
              Disconnect
            </Button>
          </Space>
        </Space>
      ) : (
        <>
          <Steps
            direction="vertical"
            size="small"
            style={{ maxWidth: 620 }}
            items={[
              {
                title: "Sign in with Google or Apple",
                description: (
                  <Space style={{ marginTop: 6 }}>
                    <Button
                      type="primary"
                      icon={<GoogleOutlined />}
                      loading={startingProvider === "google"}
                      disabled={startingProvider !== null}
                      onClick={() => startSignIn("google")}
                    >
                      Sign in with Google
                    </Button>
                    <Button
                      icon={<AppleFilled />}
                      loading={startingProvider === "apple"}
                      disabled={startingProvider !== null}
                      onClick={() => startSignIn("apple")}
                    >
                      Sign in with Apple
                    </Button>
                  </Space>
                ),
              },
              {
                title: "Copy the URL your browser lands on",
                description: (
                  <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, maxWidth: 560 }}>
                    After you finish signing in, the tab will try to open a <Text code>localhost:41172</Text> address
                    and fail to load — that&apos;s expected, nothing needs to be running there. Copy the{" "}
                    <Text strong>full URL</Text> from the address bar (it contains an auth code).
                  </Paragraph>
                ),
              },
              {
                title: "Paste it here to connect",
                description: (
                  <Form form={callbackForm} onFinish={onCallbackFinish} style={{ marginTop: 8, maxWidth: 560 }}>
                    <Form.Item name="callback_url" rules={[{ required: true, message: "Paste the callback URL" }]}>
                      <Input
                        placeholder="http://localhost:41172/callback?code=…"
                        autoComplete="off"
                        disabled={!sessionId}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button type="primary" htmlType="submit" loading={connecting} disabled={!sessionId}>
                        {connecting ? "Connecting…" : "Connect"}
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          {connectError && (
            <Alert
              type="error"
              message="Connection failed"
              description={connectError}
              showIcon
              style={{ maxWidth: 520, marginTop: 8 }}
            />
          )}

          <Divider>or</Divider>

          <Title level={5}>Sign in with email and password</Title>
          <Paragraph type="secondary" style={{ maxWidth: 520 }}>
            No browser redirect needed for this one — just your OrcaCloud account credentials.
          </Paragraph>
          <Form form={passwordForm} layout="vertical" onFinish={onPasswordFinish} style={{ maxWidth: 400 }}>
            <Form.Item name="email" rules={[{ required: true, type: "email", message: "Enter your email" }]}>
              <Input placeholder="Email" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: "Enter your password" }]}>
              <Input.Password placeholder="Password" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={passwordLoading}>
                {passwordLoading ? "Signing in…" : "Sign in"}
              </Button>
            </Form.Item>
          </Form>

          {passwordError && (
            <Alert
              type="error"
              message="Sign-in failed"
              description={passwordError}
              showIcon
              style={{ maxWidth: 520, marginTop: 8 }}
            />
          )}
        </>
      )}

      <Divider />

      <Title level={5}>Bulk import</Title>
      <Paragraph type="secondary" style={{ maxWidth: 620 }}>
        Creates or updates a Spoolman filament for <Text strong>every</Text> synced OrcaCloud profile at once, matched
        by Orca UUID. This is an all-or-nothing action, separate from linking individual filaments above — most people
        want the per-filament picker instead.
      </Paragraph>
      <Button icon={<CloudDownloadOutlined />} loading={importing} disabled={!connected} onClick={runBulkImport}>
        {importing ? "Importing…" : "Import all profiles as filaments"}
      </Button>

      {importError && (
        <Alert
          type="error"
          message="Import failed"
          description={importError}
          showIcon
          style={{ maxWidth: 520, marginTop: 8 }}
        />
      )}

      {resultBlock}
    </>
  );
}
