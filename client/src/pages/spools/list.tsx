import React from "react";
import { IResourceComponentsProps, LiveEvent, useInvalidate, useTranslate } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton, CloneButton } from "@refinedev/antd";
import { Table, Space, Button, Dropdown, Modal } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ISpool } from "./model";
import { TableState, useInitialTableState, useSavedState, useStoreInitialState } from "../../utils/saveload";
import { EditOutlined, FilterOutlined, InboxOutlined, ToTopOutlined } from "@ant-design/icons";
import {
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import { setSpoolArchived } from "./functions";
import SelectAndPrint from "../../components/selectAndPrintDialog";
import {
  useSpoolmanFilamentFilter,
  useSpoolmanLocations,
  useSpoolmanLotNumbers,
  useSpoolmanMaterials,
} from "../../components/otherModels";
import liveProvider from "../../components/liveProvider";

dayjs.extend(utc);

const { confirm } = Modal;

interface ISpoolCollapsed extends ISpool {
  combined_name: string; // Eg. "Prusa - PLA Red"
  "filament.id": number;
  "filament.material"?: string;
}

function collapseSpool(element: ISpool): ISpoolCollapsed {
  let filament_name: string;
  if (element.filament.vendor && "name" in element.filament.vendor) {
    filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
  } else {
    filament_name = element.filament.name ?? element.filament.id.toString();
  }
  return {
    ...element,
    combined_name: filament_name,
    "filament.id": element.filament.id,
    "filament.material": element.filament.material,
  };
}

function translateColumnI18nKey(columnName: string): string {
  columnName = columnName.replace(".", "_");
  if (columnName === "combined_name") columnName = "filament_name";
  else if (columnName === "filament_material") columnName = "material";
  return `spool.fields.${columnName}`;
}

const namespace = "spoolList-v2";

const liveProviderInstance = liveProvider(import.meta.env.VITE_APIURL);

/**
 * Hook that subscribes to live updates for the spools in the dataSource
 * @param dataSource Original dataSource
 * @returns dataSource that is updated with live data
 */
function useLiveify(dataSource: ISpoolCollapsed[]) {
  // TODO: The hooks in this function is quite janky, and should be refactored to be more efficient
  // New state that holds the dataSource with updated values from the live provider
  const [updatedDataSource, setUpdatedDataSource] = React.useState<ISpoolCollapsed[]>(dataSource);

  // If the original dataSource changes, update the updatedDataSource
  React.useEffect(() => {
    setUpdatedDataSource(dataSource);
  }, [dataSource]);

  // Create a constant reference to itemIds. This is to prevent the useEffect below from triggering extra times.
  const itemIds = dataSource.map((item) => item.id);
  const [prevItemIds, setPrevItemIds] = React.useState<number[]>(itemIds);
  if (JSON.stringify(itemIds) !== JSON.stringify(prevItemIds)) {
    setPrevItemIds(itemIds);
  }

  // Subscribe to changes for all items in the dataSource
  React.useEffect(() => {
    const subscription = liveProviderInstance?.subscribe({
      channel: "spool-list",
      params: {
        resource: "spool",
        ids: prevItemIds,
        subscriptionType: "useList",
      },
      types: ["update"],
      callback: (event: LiveEvent) => {
        const data = event.payload.data as ISpool;
        setUpdatedDataSource((prev) =>
          prev.map((item) => {
            return item.id === data.id ? collapseSpool(data) : item;
          })
        );
      },
    });

    // Unsubscribe when the component unmounts
    return () => {
      if (subscription) {
        liveProviderInstance?.unsubscribe(subscription);
      }
    };
  }, [prevItemIds]);

  return updatedDataSource;
}

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // State for the switch to show archived spools
  const [showArchived, setShowArchived] = useSavedState("spoolList-showArchived", false);

  // Fetch data from the API
  // To provide the live updates, we use a custom solution (useLiveify) instead of the built-in refine "liveMode" feature.
  // This is because the built-in feature does not call the liveProvider subscriber with a list of IDs, but instead
  // calls it with a list of filters, sorters, etc. This means the server-side has to support this, which is quite hard.
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent } = useTable<ISpool>({
    meta: {
      queryParams: {
        ["allow_archived"]: showArchived,
      },
    },
    syncWithLocation: false,
    pagination: {
      mode: "server",
      current: initialState.pagination.current,
      pageSize: initialState.pagination.pageSize,
    },
    sorters: {
      mode: "server",
      initial: initialState.sorters,
    },
    filters: {
      mode: "server",
      initial: initialState.filters,
    },
    liveMode: "manual",
    onLiveEvent(event) {
      if (event.type === "created" || event.type === "deleted") {
        // updated is handled by the liveify
        invalidate({
          resource: "spool",
          invalidates: ["list"],
        });
      }
    },
  });

  // Create state for the columns to show
  const allColumns: (keyof ISpoolCollapsed & string)[] = [
    "id",
    "combined_name",
    "filament.material",
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

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list and add a filament_name field
  const dataSource: ISpoolCollapsed[] = useLiveify(
    React.useMemo(() => (tableProps.dataSource ?? []).map(collapseSpool), [tableProps.dataSource])
  );

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

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

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
              items: allColumns.map((column_id) => ({
                key: column_id,
                label: t(translateColumnI18nKey(column_id)),
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
        dataSource={dataSource}
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
          id: "combined_name",
          i18nkey: "spool.fields.filament_name",
          color: (record: ISpoolCollapsed) => record.filament.color_hex,
          dataSource,
          tableState,
          dataId: "filament.id",
          filterValueQuery: useSpoolmanFilamentFilter(),
        })}
        {FilteredQueryColumn({
          id: "filament.material",
          i18nkey: "spool.fields.material",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanMaterials(),
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
        {FilteredQueryColumn({
          id: "location",
          i18ncat: "spool",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanLocations(),
        })}
        {FilteredQueryColumn({
          id: "lot_nr",
          i18ncat: "spool",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanLotNumbers(),
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
