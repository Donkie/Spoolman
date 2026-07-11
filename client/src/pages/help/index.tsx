import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Divider, List, Typography, theme } from "antd";
import { Content } from "antd/es/layout/layout";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect } from "react";
import { Trans } from "react-i18next";
import { Link, useLocation } from "react-router";

dayjs.extend(utc);

const { useToken } = theme;
const { Paragraph, Text } = Typography;

export const Help = () => {
  const { token } = useToken();
  const t = useTranslate();
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const targetId = decodeURIComponent(location.hash.replace(/^#/, ""));
    let attempts = 0;
    const maxAttempts = 12;

    const focusHashTarget = () => {
      const element = document.getElementById(targetId);
      if (!element) {
        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(focusHashTarget, 100);
        }
        return;
      }

      element.scrollIntoView({ behavior: "auto", block: "start" });
      if (!element.hasAttribute("tabindex")) {
        element.setAttribute("tabindex", "-1");
      }
      (element as HTMLElement).focus({ preventScroll: true });
    };

    focusHashTarget();
  }, [location.hash]);

  return (
    <Content
      style={{
        padding: 20,
        minHeight: 280,
        maxWidth: 1000,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      <Trans
        i18nKey={"help.description"}
        components={{
          p: <p />,
          title: <Title />,
          filamentCreateLink: <Link to="/filament/create" />,
          spoolCreateLink: <Link to="/spool/create" />,
          vendorCreateLink: <Link to="/vendor/create" />,
          readmeLink: <Link to="https://github.com/Donkie/Spoolman#integration-status" target="_blank" />,
          itemsHelp: (
            <List
              itemLayout="horizontal"
              size="large"
              dataSource={[
                {
                  title: t("filament.filament"),
                  description: t("help.resources.filament"),
                  icon: <HighlightOutlined />,
                },
                {
                  title: t("spool.spool"),
                  description: t("help.resources.spool"),
                  icon: <FileOutlined />,
                },
                {
                  title: t("vendor.vendor"),
                  description: t("help.resources.vendor"),
                  icon: <UserOutlined />,
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta avatar={item.icon} title={item.title} description={item.description} />
                </List.Item>
              )}
            />
          ),
        }}
      />
      <Divider />
      <section id="template-syntax">
        <Title level={2} style={{ marginBottom: 8 }}>
          {t("help.templateSyntax.title")}
        </Title>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.intro")}
        </Paragraph>
        <Divider orientation="left" plain>
          {t("help.templateSyntax.basicsHeading")}
        </Divider>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.basicsInsertBefore")} <Text code>{`{id}`}</Text>{" "}
          {t("help.templateSyntax.basicsInsertMiddle")} <Text code>{`{filament.material}`}</Text>{" "}
          {t("help.templateSyntax.basicsInsertAfter")} <Text code>?</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.basicsCopyBefore")} <Text code>{t("printing.qrcode.templateTagButton")}</Text>{" "}
          {t("help.templateSyntax.basicsCopyAfter")} <Text code>{`{tag}`}</Text> {t("help.templateSyntax.and")}{" "}
          <Text code>{`{tag|modifier}`}</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.basicsMissingBefore")} <Text code>{`{{comment}}`}</Text>{" "}
          {t("help.templateSyntax.basicsMissingAfter")}
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.basicsConditionalBefore")} <Text code>{`{Lot Nr: {lot_nr}}`}</Text>{" "}
          {t("help.templateSyntax.basicsConditionalAfter")}
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.basicsBoldBefore")} <Text code>**text**</Text>{" "}
          {t("help.templateSyntax.basicsBoldAfter")}
        </Paragraph>
        <Divider orientation="left" plain>
          {t("help.templateSyntax.datetimeHeading")}
        </Divider>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.datetimeSupportedBefore")} <Text code>date</Text>, <Text code>time</Text>,{" "}
          <Text code>date_local</Text>, <Text code>time_local</Text>, <Text code>datetime_short</Text>,{" "}
          <Text code>datetime_short_local</Text> {t("help.templateSyntax.datetimeSupportedAfter")}
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.datetimeOrderBefore")} <Text code>:ymd</Text>, <Text code>:mdy</Text>,{" "}
          <Text code>:dmy</Text> {t("help.templateSyntax.datetimeOrderAfter")} <Text code>_local</Text>{" "}
          {t("help.templateSyntax.datetimeLocal")}
        </Paragraph>
        <Divider orientation="left" plain>
          {t("help.templateSyntax.numberHeading")}
        </Divider>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.numberSupportedBefore")} <Text code>round</Text>, <Text code>fixed1</Text>,{" "}
          <Text code>fixed2</Text> {t("help.templateSyntax.numberSupportedAfter")}
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.numberPurpose")}
        </Paragraph>
        <Divider orientation="left" plain>
          {t("help.templateSyntax.examplesHeading")}
        </Divider>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7 }}>
          {t("help.templateSyntax.examplesDatetimeBefore")} <Text code>{`{first_used|date}`}</Text>{" "}
          {t("help.templateSyntax.examplesDatetimeDate")} <Text code>2026-03-04</Text>,{" "}
          <Text code>{`{first_used|date:dmy}`}</Text> {t("help.templateSyntax.examplesDatetimeDmy")}{" "}
          <Text code>04/03/2026</Text>, {t("help.templateSyntax.and")} <Text code>{`{first_used|time}`}</Text>{" "}
          {t("help.templateSyntax.examplesDatetimeTime")} <Text code>18:27</Text>.{" "}
          <Text code>{`{first_used|datetime_short_local:mdy}`}</Text> {t("help.templateSyntax.examplesDatetimeLocal")}.
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, lineHeight: 1.7, marginBottom: 0 }}>
          {t("help.templateSyntax.examplesNumberBefore")} <Text code>{`{remaining_weight|round}`}</Text>{" "}
          {t("help.templateSyntax.examplesNumberRound")} <Text code>1235</Text>,{" "}
          <Text code>{`{remaining_weight|fixed1}`}</Text> {t("help.templateSyntax.examplesNumberFixed1")}{" "}
          <Text code>1234.6</Text>, {t("help.templateSyntax.and")} <Text code>{`{remaining_weight|fixed2}`}</Text>{" "}
          {t("help.templateSyntax.examplesNumberFixed2")} <Text code>1234.57</Text>.
        </Paragraph>
      </section>
    </Content>
  );
};

export default Help;
