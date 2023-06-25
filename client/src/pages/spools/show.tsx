import React from "react";
import { IResourceComponentsProps, useShow } from "@refinedev/core";
import { Show, NumberField, DateField, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const { Title } = Typography;

export const SpoolShow: React.FC<IResourceComponentsProps> = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Id</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>Registered</Title>
      <DateField
        value={dayjs.utc(record?.registered).local()}
        title={dayjs.utc(record?.registered).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>First Used</Title>
      <DateField
        hidden={!record?.first_used}
        value={dayjs.utc(record?.first_used).local()}
        title={dayjs.utc(record?.first_used).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>Last Used</Title>
      <DateField
        hidden={!record?.last_used}
        value={dayjs.utc(record?.last_used).local()}
        title={dayjs.utc(record?.last_used).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>Filament</Title>
      {/* {filamentIsLoading ? (
                <>Loading...</>
            ) : (
                <>{filamentData?.data?.id}</>
            )} */}
      <Title level={5}>Remaining Weight</Title>
      <NumberFieldUnit
        value={record?.remaining_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>Used Weight</Title>
      <NumberFieldUnit
        value={record?.used_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>Location</Title>
      <TextField value={record?.location} />
      <Title level={5}>Lot Nr</Title>
      <TextField value={record?.lot_nr} />
      <Title level={5}>Comment</Title>
      <TextField value={record?.comment} />
    </Show>
  );
};
