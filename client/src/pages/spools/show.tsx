import React from "react";
import { IResourceComponentsProps, useShow } from "@refinedev/core";
import {
  Show,
  NumberField,
  DateField,
  TagField,
  TextField,
} from "@refinedev/antd";
import { Typography } from "antd";

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
      <DateField value={record?.registered} format="lll" />
      <Title level={5}>First Used</Title>
      <DateField value={record?.first_used} format="lll" />
      <Title level={5}>Last Used</Title>
      <DateField value={record?.last_used} format="lll" />
      <Title level={5}>Filament</Title>
      {/* {filamentIsLoading ? (
                <>Loading...</>
            ) : (
                <>{filamentData?.data?.id}</>
            )} */}
      <Title level={5}>Remaining Weight</Title>
      <NumberField
        value={record?.remaining_weight ?? ""}
        options={{
          unitDisplay: "short",
          unit: "gram",
          style: "unit",
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>Used Weight</Title>
      <NumberField
        value={record?.used_weight ?? ""}
        options={{
          unitDisplay: "short",
          unit: "gram",
          style: "unit",
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
