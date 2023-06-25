import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

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
            <NumberFieldUnit
              value={value}
              unit="g/cm³"
              options={{
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="diameter"
          title="Diameter"
          render={(value) => (
            <NumberFieldUnit
              value={value}
              unit="mm"
              options={{
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="weight"
          title="Weight"
          render={(value) => {
            if (value === null || value === undefined) {
              return <></>;
            }
            return (
              <NumberFieldUnit
                value={value}
                unit="g"
                options={{
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column
          dataIndex="spool_weight"
          title="Spool Weight"
          render={(value) => {
            if (value === null || value === undefined) {
              return <></>;
            }
            return (
              <NumberFieldUnit
                value={value}
                unit="g"
                options={{
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column dataIndex="article_number" title="Article Number" />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          render={(value) => (
            <DateField
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column dataIndex={["comment"]} title="Comment" />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton
                hideText
                title="Edit"
                size="small"
                recordItemId={record.id}
              />
              <ShowButton
                hideText
                title="Show"
                size="small"
                recordItemId={record.id}
              />
              <CloneButton
                hideText
                title="Clone"
                size="small"
                recordItemId={record.id}
              />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
