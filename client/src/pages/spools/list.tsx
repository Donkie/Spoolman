import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  TextField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter } from "../../utils/sorting";

dayjs.extend(utc);

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps, sorters } = useTable({
    syncWithLocation: false,
    pagination: {
      mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
    },
    sorters: {
      mode: "off", // Disable server-side sorting
      initial: [
        {
          field: "id",
          order: "asc",
        },
      ],
    },
  });

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Sort dataSource by the sorters
  dataSource.sort(genericSorter(sorters));

  // Add a filament_name field to the dataSource
  dataSource.forEach((element) => {
    if ("vendor" in element.filament) {
      element.filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
    } else {
      element.filament_name = element.filament.name;
    }
  });

  return (
    <List>
      <Table
        {...tableProps}
        dataSource={dataSource}
        pagination={{ showSizeChanger: true, pageSize: 20 }}
        rowKey="id"
      >
        <Table.Column
          dataIndex="id"
          title="Id"
          sorter={true}
          defaultSortOrder="ascend"
        />
        <Table.Column
          dataIndex="filament_name"
          title="Filament"
          sorter={true}
        />
        <Table.Column
          dataIndex="used_weight"
          title="Used Weight"
          sorter={true}
          render={(value) => {
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
          dataIndex="remaining_weight"
          title="Estimated Remaining Weight"
          sorter={true}
          render={(value) => {
            if (value === null || value === undefined) {
              return <TextField value="Unknown" />;
            }
            return (
              <NumberFieldUnit
                value={Math.max(value, 0)}
                unit="g"
                options={{
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column dataIndex="location" title="Location" sorter={true} />
        <Table.Column dataIndex="lot_nr" title="Lot Nr" sorter={true} />
        <Table.Column
          dataIndex={["first_used"]}
          title="First Used"
          sorter={true}
          render={(value) => (
            <DateField
              hidden={!value}
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column
          dataIndex={["last_used"]}
          title="Last Used"
          sorter={true}
          render={(value) => (
            <DateField
              hidden={!value}
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column dataIndex={["comment"]} title="Comment" sorter={true} />
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
