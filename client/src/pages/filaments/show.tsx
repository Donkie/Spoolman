import React from "react";
import { IResourceComponentsProps, useShow, useTranslate } from "@refinedev/core";
import { Show, NumberField, DateField, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IFilament } from "./model";
import { enrichText } from "../../utils/parsing";
import { IVendor } from "../vendors/model";

dayjs.extend(utc);

const { Title } = Typography;

export const FilamentShow: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { queryResult } = useShow<IFilament>({
    liveMode: "auto",
  });
  const { data, isLoading } = queryResult;

  const record = data?.data;

  const formatTitle = (item: IFilament) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    return t("filament.titles.show_title", { id: item.id, name: vendorPrefix + item.name });
  };

  const formatVendor = (item: IVendor) => {
    const URL = `/vendor/show/${item.id}`;
    return <a href={URL}>{item.name}</a>;
  };

  return (
    <Show isLoading={isLoading} title={record ? formatTitle(record) : ""}>
      <Title level={5}>{t("filament.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("filament.fields.vendor")}</Title>
      <TextField value={record?.vendor ? formatVendor(record?.vendor) : ""} />
      <Title level={5}>{t("filament.fields.registered")}</Title>
      <DateField
        value={dayjs.utc(record?.registered).local()}
        title={dayjs.utc(record?.registered).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("filament.fields.name")}</Title>
      <TextField value={record?.name} />
      {/* <Title level={5}>{t("filament.fields.id")}</Title>
      {vendorIsLoading ? <>Loading...</> : <>{vendorData?.data?.id}</>} */}
      <Title level={5}>{t("filament.fields.color_hex")}</Title>
      <TextField value={record?.color_hex} />
      <Title level={5}>{t("filament.fields.material")}</Title>
      <TextField value={record?.material} />
      <Title level={5}>{t("filament.fields.price")}</Title>
      <NumberField value={record?.price ?? ""} />
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
      <Title level={5}>{t("filament.fields.comment")}</Title>
      <TextField value={enrichText(record?.comment)} />
    </Show>
  );
};

export default FilamentShow;
