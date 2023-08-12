import React from "react";
import { IResourceComponentsProps, useInvalidate, useTranslate } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton, CloneButton } from "@refinedev/antd";
import { Table, Space, Button, Dropdown, Modal } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter, typeSorters } from "../../utils/sorting";
import { genericFilterer, typeFilters } from "../../utils/filtering";
import { ISpool } from "./model";
import { TableState, useInitialTableState, useSavedState, useStoreInitialState } from "../../utils/saveload";
import { EditOutlined, FilterOutlined, InboxOutlined, ToTopOutlined } from "@ant-design/icons";
import {
  DateColumn,
  FilteredColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import { setSpoolArchived } from "./functions";
import SelectAndPrint from "../../components/selectAndPrintDialog";

dayjs.extend(utc);

const { confirm } = Modal;

interface ISpoolCollapsed extends ISpool {
  filament_name: string;
  material?: string;
}

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();

  // Load initial state
  const initialState = useInitialTableState("spoolList");

  // State for the switch to show archived spools
  const [showArchived, setShowArchived] = useSavedState("spoolList-showArchived", false);

  // Fetch data from the API
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent, setPageSize } =
    useTable<ISpool>({
      meta: {
        queryParams: {
          ["allow_archived"]: showArchived,
        },
      },
      syncWithLocation: false,
      pagination: {
        mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
        current: initialState.pagination.current,
        pageSize: initialState.pagination.pageSize,
      },
      sorters: {
        mode: "off", // Disable server-side sorting
        initial: initialState.sorters,
      },
      filters: {
        mode: "off", // Disable server-side filtering
        initial: initialState.filters,
      },
    });

  // Create state for the columns to show
  const allColumns: (keyof ISpoolCollapsed & string)[] = [
    "id",
    "filament_name",
    "material",
    "used_weight",
    "remaining_weight",
    "used_length",
    "remaining_length",
    "location",
    "lot_nr",
    "first_used",
    "last_used",
    "registered",
    "comment",
  ];
  const defaultColumns = allColumns.filter(
    (column_id) => ["registered", "used_length", "remaining_length", "lot_nr"].indexOf(column_id) === -1
  );
  const [showColumns, setShowColumns] = React.useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Type the sorters and filters
  const typedSorters = typeSorters<ISpoolCollapsed>(sorters);
  const typedFilters = typeFilters<ISpoolCollapsed>(filters);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState("spoolList", tableState);

  // Collapse the dataSource to a mutable list and add a filament_name field
  const dataSource: ISpoolCollapsed[] = React.useMemo(
    () =>
      (tableProps.dataSource ?? []).map((element) => {
        let filament_name: string;
        if (element.filament.vendor && "name" in element.filament.vendor) {
          filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
        } else {
          filament_name = element.filament.name ?? element.filament.id.toString();
        }
        return {
          ...element,
          filament_name,
          material: element.filament.material,
        };
      }),
    [tableProps.dataSource]
  );

  // Filter and sort the dataSource
  const filteredDataSource = React.useMemo(() => {
    const filtered = dataSource.filter(genericFilterer(typedFilters));
    filtered.sort(genericSorter(typedSorters));
    return filtered;
  }, [dataSource, typedFilters, typedSorters]);

  // Function for opening an ant design modal that asks for confirmation for archiving a spool
  const archiveSpool = async (spool: ISpoolCollapsed, archive: boolean) => {
    await setSpoolArchived(spool, archive);
    invalidate({
      resource: "spool",
      id: spool.id,
      invalidates: ["list", "detail"],
    });
  };

  const archiveSpoolPopup = async (spool: ISpoolCollapsed) => {
    // If the spool has no remaining weight, archive it immediately since it's likely not a mistake
    if (spool.remaining_weight && spool.remaining_weight == 0) {
      await archiveSpool(spool, true);
    } else {
      confirm({
        title: t("spool.titles.archive"),
        content: t("spool.messages.archive"),
        okText: t("buttons.archive"),
        okType: "primary",
        cancelText: t("buttons.cancel"),
        onOk() {
          return archiveSpool(spool, true);
        },
      });
    }
  };

  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          <SelectAndPrint />
          <Button
            type="primary"
            icon={<InboxOutlined />}
            onClick={() => {
              setShowArchived(!showArchived);
            }}
          >
            {showArchived ? t("buttons.hideArchived") : t("buttons.showArchived")}
          </Button>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={() => {
              setFilters([], "replace");
              setSorters([{ field: "id", order: "asc" }]);
              setCurrent(1);
            }}
          >
            {t("buttons.clearFilters")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumns.map((column) => ({
                key: column,
                label: t(`spool.fields.${column}`),
              })),
              selectedKeys: showColumns,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
              onSelect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
            }}
          >
            <Button type="primary" icon={<EditOutlined />}>
              {t("buttons.hideColumns")}
            </Button>
          </Dropdown>
          {defaultButtons}
        </>
      )}
    >
      <Table
        {...tableProps}
        dataSource={filteredDataSource}
        pagination={{
          showSizeChanger: true,
          current: current,
          pageSize: pageSize,
          onChange: (page, pageSize) => {
            setCurrent(page);
            setPageSize(pageSize);
          },
        }}
        rowKey="id"
        // Make archived rows greyed out
        onRow={(record) => {
          if (record.archived) {
            return {
              style: {
                fontStyle: "italic",
                color: "#999",
              },
            };
          } else {
            return {};
          }
        }}
      >
        {SortedColumn({
          id: "id",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {SpoolIconColumn({
          id: "filament_name",
          i18ncat: "spool",
          color: (record: ISpoolCollapsed) => record.filament.color_hex,
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "material",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "used_weight",
          i18ncat: "spool",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "remaining_weight",
          i18ncat: "spool",
          unit: "g",
          decimals: 1,
          defaultText: t("unknown"),
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "used_length",
          i18ncat: "spool",
          unit: "mm",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "remaining_length",
          i18ncat: "spool",
          unit: "mm",
          decimals: 1,
          defaultText: t("unknown"),
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "location",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "lot_nr",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "first_used",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "last_used",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "registered",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {RichColumn({
          id: "comment",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        <Table.Column
          title={t("table.actions")}
          render={(_, record: ISpoolCollapsed) => (
            <Space>
              <EditButton hideText title={t("buttons.edit")} size="small" recordItemId={record.id} />
              <ShowButton hideText title={t("buttons.show")} size="small" recordItemId={record.id} />
              <CloneButton hideText title={t("buttons.clone")} size="small" recordItemId={record.id} />
              {record.archived ? (
                <Button
                  icon={<ToTopOutlined />}
                  title={t("buttons.unArchive")}
                  size="small"
                  onClick={() => archiveSpool(record, false)}
                />
              ) : (
                <Button
                  icon={<InboxOutlined />}
                  title={t("buttons.archive")}
                  size="small"
                  onClick={() => archiveSpoolPopup(record)}
                />
              )}
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

export default SpoolList;
