import { LeftOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Avatar, Button, Col, Empty, Form, Row, Space, Switch, Table, Tag, Typography, message, theme } from "antd";
import { ColumnType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ApplicationState,
  ApplicationSurface,
  EntityType,
  useGetApplications,
  useSetApplicationEnabled,
} from "../../../utils/queryFields";

const ENTITY_COLORS: Record<EntityType, string> = {
  [EntityType.spool]: "blue",
  [EntityType.filament]: "green",
  [EntityType.vendor]: "orange",
};

export const ApplicationDetail = () => {
  const { appKey } = useParams<{ appKey: string }>();
  const t = useTranslate();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const spoolApps = useGetApplications(EntityType.spool);
  const filamentApps = useGetApplications(EntityType.filament);
  const vendorApps = useGetApplications(EntityType.vendor);

  const setSpoolEnabled = useSetApplicationEnabled(EntityType.spool);
  const setFilamentEnabled = useSetApplicationEnabled(EntityType.filament);
  const setVendorEnabled = useSetApplicationEnabled(EntityType.vendor);

  const states = useMemo(() => {
    const all: ApplicationState[] = [
      ...(spoolApps.data ?? []),
      ...(filamentApps.data ?? []),
      ...(vendorApps.data ?? []),
    ];
    return all.filter((s) => (s.app_key ?? s.key) === appKey);
  }, [spoolApps.data, filamentApps.data, vendorApps.data, appKey]);

  const isLoading = spoolApps.isLoading || filamentApps.isLoading || vendorApps.isLoading;
  const first = states[0];

  const handleToggle = async (record: ApplicationState, enabled: boolean) => {
    setPendingKey(`${record.entity_type}:${record.key}`);
    try {
      const setter =
        record.entity_type === EntityType.spool
          ? setSpoolEnabled
          : record.entity_type === EntityType.filament
            ? setFilamentEnabled
            : setVendorEnabled;
      await setter.mutateAsync({ key: record.key, enabled });
      messageApi.success(
        t(enabled ? "applications.messages.enabled" : "applications.messages.disabled", { name: record.name }),
      );
    } catch (err) {
      if (err instanceof Error) {
        messageApi.error(err.message);
      }
    } finally {
      setPendingKey(null);
    }
  };

  const columns: ColumnType<ApplicationState>[] = [
    {
      title: t("applications.columns.name"),
      dataIndex: "name",
      key: "name",
      width: "18%",
    },
    {
      title: "Entity",
      dataIndex: "entity_type",
      key: "entity_type",
      width: "12%",
      render: (et: EntityType) => <Tag color={ENTITY_COLORS[et]}>{t(`${et}.${et}`)}</Tag>,
    },
    {
      title: t("applications.columns.description"),
      dataIndex: "description",
      key: "description",
      width: "24%",
      render: (value: string) => (
        <Typography.Text style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{value}</Typography.Text>
      ),
    },
    {
      title: t("applications.columns.enable_description"),
      dataIndex: "enable_description",
      key: "enable_description",
      width: "28%",
      render: (value: string) => (
        <Typography.Text style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{value}</Typography.Text>
      ),
    },
    {
      title: t("applications.columns.surfaces"),
      dataIndex: "surfaces",
      key: "surfaces",
      width: "10%",
      render: (surfaces: ApplicationSurface[]) => (
        <Space size={[4, 4]} wrap>
          {surfaces.map((s) => (
            <Tag key={s}>{t(`applications.surfaces.${s}`)}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t("applications.columns.enabled"),
      dataIndex: "enabled",
      key: "enabled",
      align: "center",
      width: "8%",
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          loading={pendingKey === `${record.entity_type}:${record.key}`}
          onChange={(checked) => handleToggle(record, checked)}
        />
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <Button
        type="text"
        icon={<LeftOutlined />}
        onClick={() => navigate("/applications")}
        style={{ marginBottom: 16 }}
      >
        {t("applications.tab")}
      </Button>

      {first && (
        <Row align="middle" gutter={16} style={{ marginBottom: 24 }}>
          <Col>
            <Avatar size={64} style={{ fontSize: "2em", backgroundColor: token.colorBgLayout, color: token.colorText }}>
              {first.icon ?? first.name.charAt(0).toUpperCase()}
            </Avatar>
          </Col>
          <Col>
            <Typography.Title level={2} style={{ margin: 0, color: token.colorText }}>
              {first.name}
            </Typography.Title>
            <Typography.Text type="secondary">{first.description}</Typography.Text>
          </Col>
        </Row>
      )}

      <Form component={false} disabled={pendingKey !== null}>
        <Table
          columns={columns}
          dataSource={states}
          loading={isLoading}
          pagination={false}
          rowKey={(r) => `${r.entity_type}:${r.key}`}
          locale={{
            emptyText: <Empty description={t("applications.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
        />
      </Form>
    </div>
  );
};

export default ApplicationDetail;
