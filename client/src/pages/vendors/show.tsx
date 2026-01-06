import { DateField, NumberField, Show, TextField } from "@refinedev/antd";
import { IResourceComponentsProps, useShow, useTranslate } from "@refinedev/core";
import { Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor } from "./model";

dayjs.extend(utc);

const { Title } = Typography;

export const VendorShow: React.FC<IResourceComponentsProps> = () => {
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
      <Title level={5}>{t("vendor.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("vendor.fields.registered")}</Title>
      <DateField
        value={dayjs.utc(record?.registered).local()}
        title={dayjs.utc(record?.registered).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("vendor.fields.name")}</Title>
      <TextField value={record?.name} />
      <Title level={5}>{t("vendor.fields.comment")}</Title>
      <TextField value={enrichText(record?.comment)} />
      <Title level={5}>{t("vendor.fields.empty_spool_weight")}</Title>
      <TextField value={record?.empty_spool_weight} />
      <Title level={5}>{t("vendor.fields.external_id")}</Title>
      <TextField value={record?.external_id} />
      <Title level={4}>{t("settings.extra_fields.tab")}</Title>
      {extraFields?.data?.map((field, index) => (
        <ExtraFieldDisplay key={index} field={field} value={record?.extra[field.key]} />
      ))}
    </Show>
  );
};

export default VendorShow;
