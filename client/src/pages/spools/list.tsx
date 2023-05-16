import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  NumberField,
  TextField,
} from "@refinedev/antd";
import { Table, Space } from "antd";

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  tableProps.dataSource?.forEach((element) => {
    if ("vendor" in element.filament) {
      element.filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
    } else {
      element.filament_name = element.filament.name;
    }
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="Id" />
        <Table.Column dataIndex="filament_name" title="Filament" />
        <Table.Column
          dataIndex="used_weight"
          title="Used Weight"
          render={(value) => {
            return (
              <NumberField
                value={value}
                options={{
                  unitDisplay: "short",
                  unit: "gram",
                  style: "unit",
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column
          dataIndex="remaining_weight"
          title="Estimated Remaining Weight"
          render={(value) => {
            if (value === null || value === undefined) {
              return <TextField value="Unknown" />;
            }
            return (
              <NumberField
                value={Math.max(value, 0)}
                options={{
                  unitDisplay: "short",
                  unit: "gram",
                  style: "unit",
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column dataIndex="location" title="Location" />
        <Table.Column dataIndex="lot_nr" title="Lot Nr" />
        <Table.Column
          dataIndex={["first_used"]}
          title="First Used"
          render={(value) => (
            <DateField value={value} format="YYYY-MM-DD HH:mm:ss" />
          )}
        />
        <Table.Column
          dataIndex={["last_used"]}
          title="Last Used"
          render={(value) => (
            <DateField value={value} format="YYYY-MM-DD HH:mm:ss" />
          )}
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
