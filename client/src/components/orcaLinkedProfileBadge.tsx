import { CloudOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Typography } from "antd";

const { Text } = Typography;

/**
 * Shows which OrcaCloud profile a filament is linked to, if any. Prefers orca_setting_id since
 * that's already OrcaSlicer's human-readable preset name (e.g. "Generic PLA @Bambu Lab X1
 * Carbon"); falls back to the less-readable orca_filament_id. Renders nothing if neither extra
 * field is set on this filament — deliberately no live OrcaCloud lookup here, so it works
 * offline/without a connection.
 */
export function OrcaLinkedProfileBadge(props: { settingId?: string | null; filamentId?: string | null }) {
  const t = useTranslate();
  const label = props.settingId || props.filamentId;
  if (!label) {
    return null;
  }
  return (
    <Text type="secondary">
      <CloudOutlined style={{ marginRight: 6 }} />
      {t("filament.form.linked_orca_profile")} <Text strong>{label}</Text>
    </Text>
  );
}
