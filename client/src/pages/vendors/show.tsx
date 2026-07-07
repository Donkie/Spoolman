import { Show, TextField } from "@refinedev/antd";
import { useShow, useTranslate } from "@refinedev/core";
import { Col, Row, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ExtraFieldDisplay } from "../../components/extraFields";
import VendorLogo from "../../components/vendorLogo";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor } from "./model";

dayjs.extend(utc);

const { Text, Title } = Typography;

export const VendorShow = () => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.vendor);

  const { query } = useShow<IVendor>({
    liveMode: "auto",
  });
  const { data, isLoading } = query;

  const record = data?.data;

  const formatTitle = (item: IVendor) => {
    return t("vendor.titles.show_title", { id: item.id, name: item.name, interpolation: { escapeValue: false } });
  };

  return (
    <Show isLoading={isLoading} title={record ? formatTitle(record) : ""}>
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        {`${t("vendor.fields.registered")} ${
          record?.registered ? dayjs.utc(record.registered).local().format("YYYY-MM-DD HH:mm:ss") : "-"
        }`}
      </Text>
      <Row gutter={[24, 24]} align="top">
        <Col xs={24} lg={16}>
          <Title level={5}>{t("vendor.fields.name")}</Title>
          <TextField value={record?.name} />
        </Col>
        <Col xs={24} lg={8}>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 8,
              padding: 8,
              border: "1px solid #d9d9d9",
            }}
          >
            <VendorLogo
              vendor={record}
              showFallbackText
              imgStyle={{
                display: "block",
                width: "100%",
                maxHeight: "64px",
                objectFit: "contain",
                objectPosition: "left center",
              }}
              fallbackStyle={{
                width: "100%",
                fontWeight: 700,
                fontSize: "24px",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#111",
              }}
            />
          </div>
        </Col>
      </Row>
      <Title level={5}>{t("vendor.fields.comment")}</Title>
      <TextField value={enrichText(record?.comment)} />
      <Title level={5}>{t("vendor.fields.empty_spool_weight")}</Title>
      <TextField value={record?.empty_spool_weight} />
      <Title level={5}>{t("vendor.fields.external_id")}</Title>
      <TextField value={record?.external_id} />
      <Title level={5}>Print Logo</Title>
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          padding: 8,
          border: "1px solid #d9d9d9",
          maxWidth: "360px",
        }}
      >
        <VendorLogo
          vendor={record}
          usePrintLogo
          showFallbackText
          imgStyle={{
            display: "block",
            width: "100%",
            maxHeight: "64px",
            objectFit: "contain",
            objectPosition: "left center",
          }}
          fallbackStyle={{
            width: "100%",
            fontWeight: 700,
            fontSize: "24px",
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "#111",
          }}
        />
      </div>
      <Title level={4}>{t("settings.extra_fields.tab")}</Title>
      {extraFields?.data?.map((field, index) => (
        <ExtraFieldDisplay key={index} field={field} value={record?.extra[field.key]} />
      ))}
    </Show>
  );
};

export default VendorShow;
