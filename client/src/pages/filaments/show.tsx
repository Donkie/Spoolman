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

export const FilamentShow: React.FC<IResourceComponentsProps> = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Id</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>Registered</Title>
      <DateField value={record?.registered} format="lll" />
      <Title level={5}>Name</Title>
      <TextField value={record?.name} />
      <Title level={5}>Vendor</Title>
      {/* {vendorIsLoading ? <>Loading...</> : <>{vendorData?.data?.id}</>} */}
      <Title level={5}>Material</Title>
      <TextField value={record?.material} />
      <Title level={5}>Price</Title>
      <NumberField value={record?.price ?? ""} />
      <Title level={5}>Density</Title>
      <NumberField
        value={record?.density ?? ""}
        options={{
          unitDisplay: "short",
          unit: "gram",
          style: "unit",
          maximumFractionDigits: 2,
        }}
      />
      <Title level={5}>Diameter</Title>
      <NumberField
        value={record?.diameter ?? ""}
        options={{
          unitDisplay: "short",
          unit: "millimeter",
          style: "unit",
          maximumFractionDigits: 2,
        }}
      />
      <Title level={5}>Weight</Title>
      <NumberField
        value={record?.weight ?? ""}
        options={{
          unitDisplay: "short",
          unit: "gram",
          style: "unit",
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>Spool Weight</Title>
      <NumberField
        value={record?.spool_weight ?? ""}
        options={{
          unitDisplay: "short",
          unit: "gram",
          style: "unit",
          maximumFractionDigits: 1,
        }}
      />
      <Title level={5}>Article Number</Title>
      <TextField value={record?.article_number} />
      <Title level={5}>Comment</Title>
      <TextField value={record?.comment} />
    </Show>
  );
};
