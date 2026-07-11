import { useTranslate } from "@refinedev/core";
import { Col, Empty, Row, Segmented, Spin, Typography, message, theme } from "antd";
import { useMemo, useState } from "react";
import { ApplicationCard } from "../../components/applicationCard";
import { ApplicationState, EntityType, useGetApplications, useSetApplicationEnabled } from "../../utils/queryFields";

type FilterMode = "all" | "enabled" | "disabled";

interface TogglingState {
  entityType: EntityType;
  key: string;
}

export const Applications = () => {
  const t = useTranslate();
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [toggling, setToggling] = useState<TogglingState | null>(null);

  const spoolApps = useGetApplications(EntityType.spool);
  const filamentApps = useGetApplications(EntityType.filament);
  const vendorApps = useGetApplications(EntityType.vendor);

  const setSpoolEnabled = useSetApplicationEnabled(EntityType.spool);
  const setFilamentEnabled = useSetApplicationEnabled(EntityType.filament);
  const setVendorEnabled = useSetApplicationEnabled(EntityType.vendor);

  const isLoading = spoolApps.isLoading || filamentApps.isLoading || vendorApps.isLoading;

  // Merge all states by app_key, falling back to key
  const groupedApps = useMemo(() => {
    const all: ApplicationState[] = [
      ...(spoolApps.data ?? []),
      ...(filamentApps.data ?? []),
      ...(vendorApps.data ?? []),
    ];

    const byAppKey = new Map<string, ApplicationState[]>();
    for (const state of all) {
      const groupKey = state.app_key ?? state.key;
      if (!byAppKey.has(groupKey)) {
        byAppKey.set(groupKey, []);
      }
      byAppKey.get(groupKey)!.push(state);
    }
    return byAppKey;
  }, [spoolApps.data, filamentApps.data, vendorApps.data]);

  const filteredGroups = useMemo(() => {
    const entries = Array.from(groupedApps.entries());
    if (filter === "enabled") return entries.filter(([, states]) => states.some((s) => s.enabled));
    if (filter === "disabled") return entries.filter(([, states]) => states.every((s) => !s.enabled));
    return entries;
  }, [groupedApps, filter]);

  const handleToggle = async (entityType: EntityType, key: string, enabled: boolean) => {
    setToggling({ entityType, key });
    try {
      const setter =
        entityType === EntityType.spool
          ? setSpoolEnabled
          : entityType === EntityType.filament
            ? setFilamentEnabled
            : setVendorEnabled;
      await setter.mutateAsync({ key, enabled });
      messageApi.success(
        enabled
          ? t("applications.messages.enabled", { name: key })
          : t("applications.messages.disabled", { name: key }),
      );
    } catch (err) {
      if (err instanceof Error) {
        messageApi.error(err.message);
      }
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      {contextHolder}
      <h1 style={{ color: token.colorText }}>{t("applications.tab")}</h1>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t("applications.description")}
      </Typography.Paragraph>
      <Segmented
        options={[
          { label: t("applications.all"), value: "all" },
          { label: t("applications.columns.enabled"), value: "enabled" },
        ]}
        value={filter}
        onChange={(val) => setFilter(val as FilterMode)}
        style={{ marginBottom: 24 }}
      />
      {isLoading ? (
        <Spin size="large" style={{ display: "block", margin: "48px auto" }} />
      ) : filteredGroups.length === 0 ? (
        <Empty description={t("applications.empty")} style={{ marginTop: 48 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredGroups.map(([appKey, states]) => {
            const first = states[0];
            return (
              <Col key={appKey} xs={24} sm={12} md={8} lg={6} style={{ display: "flex" }}>
                <ApplicationCard
                  appKey={appKey}
                  name={first.name}
                  description={first.description}
                  icon={first.icon}
                  states={states}
                  onToggle={handleToggle}
                  toggling={toggling}
                />
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
};

export default Applications;
