import { useTranslate } from "@refinedev/core";
import { Avatar, Badge, Button, Card, Space, Switch, Tag, Typography } from "antd";
import { useNavigate } from "react-router";
import { ApplicationState, EntityType } from "../utils/queryFields";

interface ApplicationCardProps {
  appKey: string;
  name: string;
  description: string;
  icon: string | null;
  states: ApplicationState[];
  onToggle: (entityType: EntityType, key: string, enabled: boolean) => Promise<void>;
  toggling: { entityType: EntityType; key: string } | null;
}

const ENTITY_COLORS: Record<EntityType, string> = {
  [EntityType.spool]: "blue",
  [EntityType.filament]: "green",
  [EntityType.vendor]: "orange",
};

export function ApplicationCard({ appKey, name, description, icon, states, onToggle, toggling }: ApplicationCardProps) {
  const t = useTranslate();
  const navigate = useNavigate();

  const anyEnabled = states.some((s) => s.enabled);
  const allEnabled = states.length > 0 && states.every((s) => s.enabled);

  const badgeStatus = allEnabled ? "success" : anyEnabled ? "warning" : "default";
  const badgeText = allEnabled
    ? t("applications.columns.enabled")
    : anyEnabled
      ? t("applications.columns.enabled")
      : t("applications.all");

  const avatarContent = icon ?? name.charAt(0).toUpperCase();

  return (
    <Badge.Ribbon
      text={badgeText}
      color={badgeStatus === "success" ? "green" : badgeStatus === "warning" ? "orange" : "gray"}
    >
      <Card
        hoverable
        style={{ height: "100%" }}
        actions={[
          <Button key="configure" type="link" onClick={() => navigate(`/applications/${appKey}`)}>
            Configure
          </Button>,
        ]}
      >
        <Card.Meta
          avatar={
            <Avatar size={48} style={{ fontSize: "1.5em", backgroundColor: "#f0f0f0", color: "#333" }}>
              {avatarContent}
            </Avatar>
          }
          title={<Typography.Text strong>{name}</Typography.Text>}
          description={
            <Typography.Text type="secondary" style={{ whiteSpace: "normal" }}>
              {description}
            </Typography.Text>
          }
        />
        <Space wrap style={{ marginTop: 12 }}>
          {states.map((state) => (
            <Tag
              key={state.entity_type}
              color={ENTITY_COLORS[state.entity_type]}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              {t(`${state.entity_type}.${state.entity_type}`)}
              <Switch
                size="small"
                checked={state.enabled}
                loading={toggling?.entityType === state.entity_type && toggling?.key === state.key}
                onChange={(checked) => onToggle(state.entity_type, state.key, checked)}
                onClick={(_, e) => e.stopPropagation()}
                style={{ marginLeft: 4 }}
              />
            </Tag>
          ))}
        </Space>
      </Card>
    </Badge.Ribbon>
  );
}
