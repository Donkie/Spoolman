import { getBasePath } from "../../utils/url";
import { InboxOutlined, PrinterOutlined, ToTopOutlined, ToolOutlined, FireOutlined } from "@ant-design/icons";
import { DateField, NumberField, Show, TextField } from "@refinedev/antd";
import { IResourceComponentsProps, useInvalidate, useShow, useTranslate } from "@refinedev/core";
import { Button, Modal, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { NumberFieldUnit } from "../../components/numberField";
import SpoolIcon from "../../components/spoolIcon";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useCurrencyFormatter } from "../../utils/settings";
import { IFilament } from "../filaments/model";
import { setSpoolArchived, useSpoolAdjustModal, useSpoolDryModal } from "./functions";
import { ISpool } from "./model";

dayjs.extend(utc);

const { Title } = Typography;
const { confirm } = Modal;

export const SpoolShow: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.spool);
  const currencyFormatter = useCurrencyFormatter();
  const invalidate = useInvalidate();

  const { queryResult } = useShow<ISpool>({
    liveMode: "auto",
  });
  const { data, isLoading } = queryResult;

  const record = data?.data;

  const spoolPrice = (item?: ISpool) => {
    const price = item?.price ?? item?.filament.price;
    if (price === undefined) {
      return "";
    }
    return currencyFormatter.format(price);
  };

  // Provides the function to open the spool adjustment modal and the modal component itself
  const { openSpoolAdjustModal, spoolAdjustModal } = useSpoolAdjustModal();
  // Provides the function to open the spool drying modal and the modal component itself
  const { openSpoolDryModal, spoolDryModal } = useSpoolDryModal();

  // Function for opening an ant design modal that asks for confirmation for archiving a spool
  const archiveSpool = async (spool: ISpool, archive: boolean) => {
    await setSpoolArchived(spool, archive);
    invalidate({
      resource: "spool",
      id: spool.id,
      invalidates: ["list", "detail"],
    });
  };

  const archiveSpoolPopup = async (spool: ISpool | undefined) => {
    if (spool === undefined) {
      return;
    }
    // If the spool has no remaining weight, archive it immediately since it's likely not a mistake
    if (spool.remaining_weight != undefined && spool.remaining_weight <= 0) {
      await archiveSpool(spool, true);
    } else {
      confirm({
        title: t("spool.titles.archive"),
        content: t("spool.messages.archive"),
        okText: t("buttons.archive"),
        okType: "primary",
        cancelText: t("buttons.cancel"),
        onOk() {
          return archiveSpool(spool, true);
        },
      });
    }
  };

  const formatFilament = (item: IFilament) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = "";
    if (item.material) {
      material = ` - ${item.material}`;
    }
    return `${vendorPrefix}${name}${material}`;
  };

  const filamentURL = (item: IFilament) => {
    const URL = `/filament/show/${item.id}`;
    return <a href={URL}>{formatFilament(item)}</a>;
  };

  const formatTitle = (item: ISpool) => {
    return t("spool.titles.show_title", {
      id: item.id,
      name: formatFilament(item.filament),
      interpolation: { escapeValue: false },
    });
  };

  const colorObj = record?.filament.multi_color_hexes
    ? {
      colors: record.filament.multi_color_hexes.split(","),
      vertical: record.filament.multi_color_direction === "longitudinal",
    }
    : record?.filament.color_hex;

  return (
    <Show
      isLoading={isLoading}
      title={record ? formatTitle(record) : ""}
      headerButtons={({ defaultButtons }) => (
        <>
          <Button
            type="primary"
            icon={<ToolOutlined />}
            onClick={() => record && openSpoolAdjustModal(record)}
          >
            {t("spool.titles.adjust")}
          </Button>
          <Button
            type="primary"
            icon={<FireOutlined />}
            onClick={() => record && openSpoolDryModal(record)}
          >
            {t("spool.titles.dry")}
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            href={getBasePath() + "/spool/print?spools=" + record?.id + "&return=" + encodeURIComponent(window.location.pathname)}
          >
            {t("printing.qrcode.button")}
          </Button>
          {record?.archived ? (
            <Button icon={<ToTopOutlined />} onClick={() => archiveSpool(record, false)}>
              {t("buttons.unArchive")}
            </Button>
          ) : (
            <Button danger icon={<InboxOutlined />} onClick={() => archiveSpoolPopup(record)}>
              {t("buttons.archive")}
            </Button>
          )}

          {defaultButtons}
          {spoolAdjustModal}
          {spoolDryModal}
        </>
      )}
    >
      <Title level={5}>{t("spool.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("spool.fields.filament")}</Title>
      {colorObj && <SpoolIcon color={colorObj} size="large" no_margin />}
      <TextField value={record ? filamentURL(record?.filament) : ""} />
      <Title level={5}>{t("spool.fields.price")}</Title>
      <TextField value={spoolPrice(record)} />
      <Title level={5}>{t("spool.fields.registered")}</Title>
      <DateField
        value={dayjs.utc(record?.registered).local()}
        title={dayjs.utc(record?.registered).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("spool.fields.first_used")}</Title>
      <DateField
        hidden={!record?.first_used}
        value={dayjs.utc(record?.first_used).local()}
        title={dayjs.utc(record?.first_used).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("spool.fields.last_used")}</Title>
      <DateField
        hidden={!record?.last_used}
        value={dayjs.utc(record?.last_used).local()}
        title={dayjs.utc(record?.last_used).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("spool.fields.remaining_length")}</Title>
      <NumberFieldUnit
        value={record?.remaining_length ?? ""}
        unit="mm"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.used_length")}</Title>
      <NumberFieldUnit
        value={record?.used_length ?? ""}
        unit="mm"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.remaining_weight")}</Title>
      <NumberFieldUnit
        value={record?.remaining_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.used_weight")}</Title>
      <NumberFieldUnit
        value={record?.used_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.location")}</Title>
      <TextField value={record?.location} />
      <Title level={5}>{t("spool.fields.lot_nr")}</Title>
      <TextField value={record?.lot_nr} />
      <Title level={5}>{t("spool.fields.comment")}</Title>
      <TextField value={enrichText(record?.comment)} />
      <Title level={5}>{t("spool.fields.archived")}</Title>
      <TextField value={record?.archived ? t("yes") : t("no")} />
      <Title level={5}>{t("spool.fields.dried")}</Title>
      {Array.isArray(record?.dried) && record.dried.length > 0 ? (
        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
          {record.dried.map((driedDate, idx) => (
            <li key={idx}>
              <DateField
                value={dayjs.utc(driedDate).local()}
                title={dayjs.utc(driedDate).local().format()}
                format="YYYY-MM-DD HH:mm:ss"
              />
            </li>
          ))}
        </ul>
      ) : (
        <TextField value="-" />
      )}
      <Title level={5}>{t("spool.fields.last_dried")}</Title>
      {record?.last_dried ? (
        <DateField
          value={dayjs.utc(record.last_dried).local()}
          title={dayjs.utc(record.last_dried).local().format()}
          format="YYYY-MM-DD HH:mm:ss"
        />
      ) : (
        <TextField value="-" />
      )}
      <Title level={4}>{t("settings.extra_fields.tab")}</Title>
      {extraFields?.data?.map((field, index) => (
        <ExtraFieldDisplay key={index} field={field} value={record?.extra[field.key]} />
      ))}
    </Show>
  );
};

export default SpoolShow;
