import React from "react";
import { IResourceComponentsProps, useInvalidate, useNavigation, useTranslate } from "@refinedev/core";
import { useTable, List } from "@refinedev/antd";
import { Table, Button, Dropdown, Modal } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ISpool } from "./model";
import { TableState, useInitialTableState, useSavedState, useStoreInitialState } from "../../utils/saveload";
import {
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  InboxOutlined,
  PlusSquareOutlined,
  ToTopOutlined,
} from "@ant-design/icons";
import {
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
  Action,
  ActionsColumn,
} from "../../components/column";
import { setSpoolArchived } from "./functions";
import SelectAndPrint from "../../components/selectAndPrintDialog";
import {
  useSpoolmanFilamentFilter,
  useSpoolmanLocations,
  useSpoolmanLotNumbers,
  useSpoolmanMaterials,
} from "../../components/otherModels";
import { useLiveify } from "../../components/liveify";
import { removeUndefined } from "../../utils/filtering";

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
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent } =
    useTable<ISpoolCollapsed>({
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
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: data.data.map(collapseSpool),
          };
        },
      },
    });

  // Create state for the columns to show
  const [showColumns, setShowColumns] = React.useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list
  const queryDataSource: ISpoolCollapsed[] = React.useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource]
  );
  const dataSource = useLiveify("spool", queryDataSource, collapseSpool);

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

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const actions = (record: ISpoolCollapsed) => {
    const actions: Action[] = [
      { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("spool", record.id) },
      { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("spool", record.id) },
      { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("spool", record.id) },
    ];
    if (record.archived) {
      actions.push({
        name: t("buttons.unArchive"),
        icon: <ToTopOutlined />,
        onClick: () => archiveSpool(record, false),
      });
    } else {
      actions.push({ name: t("buttons.archive"), icon: <InboxOutlined />, onClick: () => archiveSpoolPopup(record) });
    }
    return actions;
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
        sticky
        tableLayout="auto"
        scroll={{ x: "max-content" }}
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
        columns={removeUndefined([
          SortedColumn({
            id: "id",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
            width: 70,
          }),
          SpoolIconColumn({
            id: "combined_name",
            i18nkey: "spool.fields.filament_name",
            color: (record: ISpoolCollapsed) => record.filament.color_hex,
            actions,
            dataSource,
            tableState,
            dataId: "filament.id",
            filterValueQuery: useSpoolmanFilamentFilter(),
          }),
          FilteredQueryColumn({
            id: "filament.material",
            i18nkey: "spool.fields.material",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanMaterials(),
            width: 120,
          }),
          NumberColumn({
            id: "used_weight",
            i18ncat: "spool",
            unit: "g",
            decimals: 1,
            actions,
            dataSource,
            tableState,
            width: 110,
          }),
          NumberColumn({
            id: "remaining_weight",
            i18ncat: "spool",
            unit: "g",
            decimals: 1,
            defaultText: t("unknown"),
            actions,
            dataSource,
            tableState,
            width: 110,
          }),
          NumberColumn({
            id: "used_length",
            i18ncat: "spool",
            unit: "mm",
            decimals: 1,
            actions,
            dataSource,
            tableState,
            width: 120,
          }),
          NumberColumn({
            id: "remaining_length",
            i18ncat: "spool",
            unit: "mm",
            decimals: 1,
            defaultText: t("unknown"),
            actions,
            dataSource,
            tableState,
            width: 120,
          }),
          FilteredQueryColumn({
            id: "location",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanLocations(),
            width: 120,
          }),
          FilteredQueryColumn({
            id: "lot_nr",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanLotNumbers(),
            width: 120,
          }),
          DateColumn({
            id: "first_used",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
          }),
          DateColumn({
            id: "last_used",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
          }),
          DateColumn({
            id: "registered",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
          }),
          RichColumn({
            id: "comment",
            i18ncat: "spool",
            actions,
            dataSource,
            tableState,
            width: 150,
          }),
          ActionsColumn(actions),
        ])}
      />
    </List>
  );
};

export default SpoolList;
