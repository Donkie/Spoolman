import { FileOutlined, HighlightOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import { IResourceComponentsProps, useList, useTranslate } from "@refinedev/core";
import { Card, Col, Row, Statistic, theme } from "antd";
import { Content } from "antd/es/layout/layout";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React, { ReactNode } from "react";
import { Trans } from "react-i18next";
import { Link } from "react-router";
import Logo from "../../icon.svg?react";
import { ISpool } from "../spools/model";

dayjs.extend(utc);

const { useToken } = theme;

export const Home: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();

  const spools = useList<ISpool>({
    resource: "spool",
    pagination: { pageSize: 1 },
  });
  const filaments = useList<ISpool>({
    resource: "filament",
    pagination: { pageSize: 1 },
  });
  const vendors = useList<ISpool>({
    resource: "vendor",
    pagination: { pageSize: 1 },
  });

  const hasSpools = !spools.result || spools.result.data.length > 0;

  const ResourceStatsCard = (props: { loading: boolean; value: number; resource: string; icon: ReactNode }) => (
    <Col xs={12} md={6}>
      <Card
        loading={props.loading}
        actions={[
          <Link to={`/${props.resource}`}>
            <UnorderedListOutlined />
          </Link>,
          <Link to={`/${props.resource}/create`}>
            <PlusOutlined />
          </Link>,
        ]}
      >
        <Statistic title={t(`${props.resource}.${props.resource}`)} value={props.value} prefix={props.icon} />
      </Card>
    </Col>
  );

  return (
    <Content
      style={{
        padding: "2em 20px",
        minHeight: 280,
        maxWidth: 800,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      <Title
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: token.fontSizeHeading1,
        }}
      >
        <div
          style={{
            display: "inline-block",
            height: "1.5em",
            marginRight: "0.5em",
          }}
        >
          <Logo />
        </div>
        Spoolman
      </Title>
      <Row justify="center" gutter={[16, 16]} style={{ marginTop: "3em" }}>
        <ResourceStatsCard
          resource="spool"
          value={spools.result?.total || 0}
          loading={spools.query.isLoading}
          icon={<FileOutlined />}
        />
        <ResourceStatsCard
          resource="filament"
          value={filaments.result?.total || 0}
          loading={filaments.query.isLoading}
          icon={<HighlightOutlined />}
        />
        <ResourceStatsCard
          resource="vendor"
          value={vendors.result?.total || 0}
          loading={vendors.query.isLoading}
          icon={<UserOutlined />}
        />
      </Row>
      {!hasSpools && (
        <>
          <p style={{ marginTop: 32 }}>{t("home.welcome")}</p>
          <p>
            <Trans
              i18nKey="home.description"
              components={{
                helpPageLink: <Link to="/help" />,
              }}
            />
          </p>
        </>
      )}
    </Content>
  );
};

export default Home;
