import { DateField, NumberField, Show, TextField } from "@refinedev/antd";
import { useShow, useTranslate } from "@refinedev/core";
import { PrinterOutlined } from "@ant-design/icons";
import { Button, Col, Row, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useNavigate } from "react-router";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { NumberFieldUnit } from "../../components/numberField";
import SpoolIcon from "../../components/spoolIcon";
import VendorLogo from "../../components/vendorLogo";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useCurrencyFormatter } from "../../utils/settings";
import { getBasePath, stripBasePath } from "../../utils/url";
import { IFilament } from "./model";
dayjs.extend(utc);

const { Title } = Typography;

export const FilamentShow = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const extraFields = useGetFields(EntityType.filament);
  const currencyFormatter = useCurrencyFormatter();
  const { query } = useShow<IFilament>({
    liveMode: "auto",
  });
  const { data, isLoading } = query;

  const record = data?.data;

  const formatTitle = (item: IFilament) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    return t("filament.titles.show_title", {
      id: item.id,
      name: vendorPrefix + item.name,
      interpolation: { escapeValue: false },
    });
  };

  const gotoSpools = (): undefined => {
    const URL = `/spool#filters=[{"field":"filament.id","operator":"in","value":[${record?.id}]}]`;
    navigate(URL);
  };

  const vendorURL = (item: IFilament) => {
    if (!item.vendor) {
      return null;
    }
    const url = `/vendor/show/${item.vendor.id}`;
    return <a href={url}>{item.vendor.name}</a>;
  };

  const colorObj = record?.multi_color_hexes
    ? {
        colors: record.multi_color_hexes.split(","),
        vertical: record.multi_color_direction === "longitudinal",
      }
    : record?.color_hex;

  return (
    <Show
      isLoading={isLoading}
      title={record ? formatTitle(record) : ""}
      headerButtons={({ defaultButtons }) => (
        <>
          <Button type="primary" onClick={gotoSpools}>
            {t("filament.fields.spools")}
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            href={
              getBasePath() +
              "/filament/labels?filaments=" +
              record?.id +
              "&return=" +
              encodeURIComponent(stripBasePath(window.location.pathname))
            }
          >
            {t("printing.qrcode.selectButton")}
          </Button>
          {defaultButtons}
        </>
      )}
    >
      <Row gutter={[32, 24]}>
        <Col xs={24} lg={16}>
          <Title level={5}>{t("filament.fields.id")}</Title>
          <NumberField value={record?.id ?? ""} />
          <Title level={5}>{t("filament.fields.registered")}</Title>
          <DateField
            value={dayjs.utc(record?.registered).local()}
            title={dayjs.utc(record?.registered).local().format()}
            format="YYYY-MM-DD HH:mm:ss"
          />
          <Title level={5}>{t("filament.fields.name")}</Title>
          <TextField value={record?.name} />
          <Title level={5}>{t("filament.fields.color_hex")}</Title>
          {colorObj && <SpoolIcon color={colorObj} size="large" no_margin />}
          {record?.color_hex && <TextField value={`#${record?.color_hex}`} />}
          <Title level={5}>{t("filament.fields.material")}</Title>
          <TextField value={record?.material} />
          <Title level={5}>{t("filament.fields.price")}</Title>
          <TextField value={record?.price ? currencyFormatter.format(record.price) : ""} />
          <Title level={5}>{t("filament.fields.density")}</Title>
          <NumberFieldUnit
            value={record?.density ?? ""}
            unit="g/cm³"
            options={{
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }}
          />
          <Title level={5}>{t("filament.fields.diameter")}</Title>
          <NumberFieldUnit
            value={record?.diameter ?? ""}
            unit="mm"
            options={{
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }}
          />
          <Title level={5}>{t("filament.fields.weight")}</Title>
          <NumberFieldUnit
            value={record?.weight ?? ""}
            unit="g"
            options={{
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            }}
          />
          <Title level={5}>{t("filament.fields.spool_weight")}</Title>
          <NumberFieldUnit
            value={record?.spool_weight ?? ""}
            unit="g"
            options={{
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            }}
          />
          <Title level={5}>{t("filament.fields.settings_extruder_temp")}</Title>
          {!record?.settings_extruder_temp ? (
            <TextField value="Not Set" />
          ) : (
            <NumberFieldUnit value={record?.settings_extruder_temp ?? ""} unit="°C" />
          )}
          <Title level={5}>{t("filament.fields.settings_bed_temp")}</Title>
          {!record?.settings_bed_temp ? (
            <TextField value="Not Set" />
          ) : (
            <NumberFieldUnit value={record?.settings_bed_temp ?? ""} unit="°C" />
          )}
          <Title level={5}>{t("filament.fields.article_number")}</Title>
          <TextField value={record?.article_number} />
          <Title level={5}>{t("filament.fields.external_id")}</Title>
          <TextField value={record?.external_id} />
          <Title level={5}>{t("filament.fields.comment")}</Title>
          <TextField value={enrichText(record?.comment)} />
          <Title level={4}>{t("settings.extra_fields.tab")}</Title>
          {extraFields?.data?.map((field, index) => (
            <ExtraFieldDisplay key={index} field={field} value={record?.extra[field.key]} />
          ))}
        </Col>
        <Col xs={24} lg={8}>
          <Title level={5}>{t("filament.fields.vendor")}</Title>
          <TextField value={record ? vendorURL(record) : ""} />
          {record?.vendor && (
            <div style={{ marginTop: 12 }}>
              <VendorLogo
                vendor={record.vendor}
                showFallbackText
                imgStyle={{
                  display: "block",
                  width: "100%",
                  maxWidth: "100%",
                  maxHeight: "72px",
                  objectFit: "contain",
                  objectPosition: "left center",
                }}
                fallbackStyle={{
                  width: "100%",
                  fontWeight: 700,
                  fontSize: "1.5rem",
                  lineHeight: 1.15,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
              />
            </div>
          )}
        </Col>
      </Row>
    </Show>
  );
};

export default FilamentShow;
