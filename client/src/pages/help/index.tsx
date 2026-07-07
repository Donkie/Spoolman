import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { List as RefineList } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Card, List, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Trans } from "react-i18next";
import { Link } from "react-router";

dayjs.extend(utc);

const { useToken } = theme;

export const Help = () => {
  const { token } = useToken();
  const t = useTranslate();

  const resources = [
    {
      title: t("filament.filament"),
      description: t("help.resources.filament"),
      icon: <HighlightOutlined style={{ fontSize: 24, color: token.colorPrimary }} />,
    },
    {
      title: t("spool.spool"),
      description: t("help.resources.spool"),
      icon: <FileOutlined style={{ fontSize: 24, color: token.colorPrimary }} />,
    },
    {
      title: t("vendor.vendor"),
      description: t("help.resources.vendor"),
      icon: <UserOutlined style={{ fontSize: 24, color: token.colorPrimary }} />,
    },
  ];

  return (
    <RefineList headerButtons={() => null} title={t("help.help")}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Card
          style={{
            marginBottom: 16,
            background: token.colorBgContainer,
          }}
        >
          <Trans
            i18nKey={"help.description"}
            components={{
              p: <p style={{ marginBottom: 12, lineHeight: 1.7 }} />,
              title: <span style={{ display: "none" }} />,
              filamentCreateLink: <Link to="/filament/create" />,
              spoolCreateLink: <Link to="/spool/create" />,
              vendorCreateLink: <Link to="/vendor/create" />,
              readmeLink: <Link to="https://github.com/Donkie/Spoolman#integration-status" target="_blank" />,
              itemsHelp: (
                <List
                  itemLayout="horizontal"
                  size="large"
                  dataSource={resources}
                  style={{ marginTop: 16, marginBottom: 16 }}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta avatar={item.icon} title={item.title} description={item.description} />
                    </List.Item>
                  )}
                />
              ),
            }}
          />
        </Card>
      </div>
    </RefineList>
  );
};

export default Help;
