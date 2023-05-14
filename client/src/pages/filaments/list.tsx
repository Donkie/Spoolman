import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  NumberField,
} from "@refinedev/antd";
import { Table, Space } from "antd";

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="Id" />
        <Table.Column dataIndex={["vendor", "name"]} title="Vendor" />
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="material" title="Material" />
        <Table.Column dataIndex="price" title="Price" />
        <Table.Column
          dataIndex="density"
          title="Density"
          render={(value) => (
            <NumberField
              value={value}
              options={{
                unitDisplay: "short",
                unit: "gram",
                style: "unit",
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="diameter"
          title="Diameter"
          render={(value) => (
            <NumberField
              value={value}
              options={{
                unitDisplay: "short",
                unit: "millimeter",
                style: "unit",
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="weight"
          title="Weight"
          render={(value) => (
            <NumberField
              value={value}
              options={{
                unitDisplay: "short",
                unit: "gram",
                style: "unit",
                maximumFractionDigits: 1,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="spool_weight"
          title="Spool Weight"
          render={(value) => (
            <NumberField
              value={value}
              options={{
                unitDisplay: "short",
                unit: "gram",
                style: "unit",
                maximumFractionDigits: 1,
              }}
            />
          )}
        />
        <Table.Column dataIndex="article_number" title="Article Number" />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          render={(value: any) => <DateField value={value} />}
        />
        <Table.Column dataIndex={["comment"]} title="Comment" />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
