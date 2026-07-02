import { FileOutlined, HighlightOutlined, IdcardOutlined, ToolOutlined, UserOutlined } from "@ant-design/icons";
import { List } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Menu, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useLocation, useNavigate } from "react-router";
import { ExtraFieldsSettings } from "./extraFieldsSettings";
import { EntityType } from "../../utils/queryFields";
import { GeneralSettings } from "./generalSettings";
import { SwatchSettings } from "./swatchSettings";
import "./settings.css";

dayjs.extend(utc);

const { useToken } = theme;

const panels: Record<string, React.ReactNode> = {
  general: <GeneralSettings />,
  swatches: <SwatchSettings />,
  "extra-spool": <ExtraFieldsSettings entityType={EntityType.spool} />,
  "extra-filament": <ExtraFieldsSettings entityType={EntityType.filament} />,
  "extra-vendor": <ExtraFieldsSettings entityType={EntityType.vendor} />,
};

// Map between menu keys and the URL path under /settings.
const keyToPath: Record<string, string> = {
  general: "/settings",
  swatches: "/settings/swatches",
  "extra-spool": "/settings/extra/spool",
  "extra-filament": "/settings/extra/filament",
  "extra-vendor": "/settings/extra/vendor",
};

const getActiveKey = (pathname: string): string => {
  const sub = pathname.replace(/^\/settings\/?/, "").replace(/\/$/, "");
  if (sub.startsWith("swatches")) return "swatches";
  if (sub.startsWith("extra/spool")) return "extra-spool";
  if (sub.startsWith("extra/filament")) return "extra-filament";
  if (sub.startsWith("extra/vendor")) return "extra-vendor";
  return "general";
};

export const Settings = () => {
  const { token } = useToken();
  const t = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = getActiveKey(location.pathname);

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
            onClick={(e) => navigate(keyToPath[e.key] ?? "/settings")}
            items={[
              {
                key: "general",
                icon: <ToolOutlined />,
                label: t("settings.general.tab"),
              },
              {
                key: "swatches",
                icon: <IdcardOutlined />,
                label: t("settings.swatch.tab"),
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
        <div className="settings-content">{panels[activeKey]}</div>
      </div>
    </List>
  );
};

export default Settings;
