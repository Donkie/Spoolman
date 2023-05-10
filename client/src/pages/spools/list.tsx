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

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="Id" />
        <Table.Column
          dataIndex={["filament", "vendor", "name"]}
          title="Vendor"
        />
        <Table.Column dataIndex={["filament", "name"]} title="Filament Name" />
        <Table.Column
          dataIndex="remaining_weight"
          title="Estimated Remaining Weight"
          render={(value: any) => (
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
          dataIndex={["first_used"]}
          title="First Used"
          render={(value: any) => <DateField value={value} format="lll" />}
        />
        <Table.Column
          dataIndex={["last_used"]}
          title="Last Used"
          render={(value: any) => <DateField value={value} format="lll" />}
        />
        <Table.Column dataIndex="location" title="Location" />
        <Table.Column dataIndex="lot_nr" title="Lot Nr" />
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
