import { useTranslate } from "@refinedev/core";
import { Empty, Form, Space, Switch, Table, Tag, Typography, message } from "antd";
import { ColumnType } from "antd/es/table";
import { useState } from "react";
import { Trans } from "react-i18next";
import { useParams } from "react-router";
import {
  ComplexFieldState,
  ComplexFieldSurface,
  EntityType,
  useGetComplexFields,
  useSetComplexFieldEnabled,
} from "../../utils/queryFields";

export function ComplexFieldsSettings() {
  const { entityType } = useParams<{ entityType: EntityType }>();
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const complexFields = useGetComplexFields(entityType as EntityType);
  const setComplexFieldEnabled = useSetComplexFieldEnabled(entityType as EntityType);

  const niceName = t(`${entityType}.${entityType}`);

  const onToggle = async (record: ComplexFieldState, enabled: boolean) => {
    try {
      setPendingKey(record.key);
      await setComplexFieldEnabled.mutateAsync({
        key: record.key,
        enabled,
      });
      messageApi.success(
        t(enabled ? "settings.complex_fields.messages.enabled" : "settings.complex_fields.messages.disabled", {
          name: record.name,
        }),
      );
    } catch (errInfo) {
      if (errInfo instanceof Error) {
        messageApi.error(errInfo.message);
      }
    } finally {
      setPendingKey(null);
    }
  };

  const columns: ColumnType<ComplexFieldState>[] = [
    {
      title: t("settings.complex_fields.columns.name"),
      dataIndex: "name",
      key: "name",
      width: "18%",
    },
    {
      title: t("settings.complex_fields.columns.description"),
      dataIndex: "description",
      key: "description",
      width: "24%",
      render: (value: string) => (
        <Typography.Text style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{value}</Typography.Text>
      ),
    },
    {
      title: t("settings.complex_fields.columns.enable_description"),
      dataIndex: "enable_description",
      key: "enable_description",
      width: "32%",
      render: (value: string) => (
        <Typography.Text style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{value}</Typography.Text>
      ),
    },
    {
      title: t("settings.complex_fields.columns.surfaces"),
      dataIndex: "surfaces",
      key: "surfaces",
      width: "16%",
      render: (surfaces: ComplexFieldSurface[]) => (
        <Space size={[4, 4]} wrap>
          {surfaces.map((surface) => (
            <Tag key={surface}>{t(`settings.complex_fields.surfaces.${surface}`)}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t("settings.complex_fields.columns.enabled"),
      dataIndex: "enabled",
      key: "enabled",
      align: "center",
      width: "10%",
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          loading={pendingKey === record.key}
          onChange={(checked) => onToggle(record, checked)}
        />
      ),
    },
  ];

  const rows = complexFields.data || [];

  return (
    <>
      <h3>
        {t("settings.complex_fields.tab")} - {niceName}
      </h3>
      <Trans
        i18nKey={"settings.complex_fields.description"}
        components={{
          p: <p />,
        }}
      />
      <Form component={false} disabled={setComplexFieldEnabled.isPending}>
        <Table
          columns={columns}
          dataSource={rows}
          loading={complexFields.isLoading}
          pagination={false}
          locale={{
            emptyText: <Empty description={t("settings.complex_fields.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          rowKey="key"
        />
      </Form>
      {contextHolder}
    </>
  );
}
