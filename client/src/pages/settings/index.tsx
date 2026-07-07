import { FileOutlined, HighlightOutlined, ToolOutlined, UserOutlined } from "@ant-design/icons";
import { List } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Menu, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useState } from "react";
import { ExtraFieldsSettings } from "./extraFieldsSettings";
import { EntityType } from "../../utils/queryFields";
import { GeneralSettings } from "./generalSettings";
import "./settings.css";

dayjs.extend(utc);

const { useToken } = theme;

export const Settings = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [activeKey, setActiveKey] = useState("general");

  const panels: Record<string, React.ReactNode> = {
    general: <GeneralSettings />,
    "extra-spool": <ExtraFieldsSettings entityType={EntityType.spool} />,
    "extra-filament": <ExtraFieldsSettings entityType={EntityType.filament} />,
    "extra-vendor": <ExtraFieldsSettings entityType={EntityType.vendor} />,
  };

  return (
    <List headerButtons={() => null}>
      <div
        className="settings-layout"
        style={{
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          color: token.colorText,
        }}
      >
        <div className="settings-nav">
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            onClick={(e) => setActiveKey(e.key)}
            items={[
              {
                key: "general",
                icon: <ToolOutlined />,
                label: t("settings.general.tab"),
              },
              { type: "divider" },
              {
                key: "extra-spool",
                icon: <FileOutlined />,
                label: `${t("settings.extra_fields.tab")} - ${t("spool.spool")}`,
              },
              {
                key: "extra-filament",
                icon: <HighlightOutlined />,
                label: `${t("settings.extra_fields.tab")} - ${t("filament.filament")}`,
              },
              {
                key: "extra-vendor",
                icon: <UserOutlined />,
                label: `${t("settings.extra_fields.tab")} - ${t("vendor.vendor")}`,
              },
            ]}
          />
        </div>
        <div className="settings-content">
          {panels[activeKey]}
        </div>
      </div>
    </List>
  );
};

export default Settings;
