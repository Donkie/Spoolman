import React from "react";
import { IResourceComponentsProps, useShow, useTranslate } from "@refinedev/core";
import { Show, NumberField, DateField, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IVendor } from "./model";
import { enrichText } from "../../utils/parsing";

dayjs.extend(utc);

const { Title } = Typography;

export const VendorShow: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { queryResult } = useShow<IVendor>();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
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
    </Show>
  );
};

export default VendorShow;
