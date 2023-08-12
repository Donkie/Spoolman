import React from "react";
import { IResourceComponentsProps, useShow, useTranslate } from "@refinedev/core";
import { Show, NumberField, DateField, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ISpool } from "./model";

dayjs.extend(utc);

const { Title } = Typography;

export const SpoolShow: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { queryResult } = useShow<ISpool>();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>{t("spool.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
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
      {/* <Title level={5}>{t("spool.fields.filament_id")}</Title>
      {filamentIsLoading ? (
                <>Loading...</>
            ) : (
                <>{filamentData?.data?.id}</>
            )} */}
      <Title level={5}>{t("spool.fields.remaining_weight")}</Title>
      <NumberFieldUnit
        value={record?.remaining_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.used_weight")}</Title>
      <NumberFieldUnit
        value={record?.used_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("spool.fields.location")}</Title>
      <TextField value={record?.location} />
      <Title level={5}>{t("spool.fields.lot_nr")}</Title>
      <TextField value={record?.lot_nr} />
      <Title level={5}>{t("spool.fields.comment")}</Title>
      <TextField value={record?.comment} />
      <Title level={5}>{t("spool.fields.archived")}</Title>
      <TextField value={record?.archived ? t("yes") : t("no")} />
    </Show>
  );
};

export default SpoolShow;
