import { DateField, TextField } from "@refinedev/antd";
import { UseQueryResult } from "@tanstack/react-query";
import { Button, Checkbox, Col, Dropdown, Input, Row, Space, Spin } from "antd";
import { ColumnFilterItem, ColumnType } from "antd/es/table/interface";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { AlignType } from "rc-table/lib/interface";
import { Key, useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { getFiltersForField, typeFilters } from "../utils/filtering";
import { enrichText } from "../utils/parsing";
import { Field, FieldType } from "../utils/queryFields";
import { TableState } from "../utils/saveload";
import { getSortOrderForField, typeSorters } from "../utils/sorting";
import { NumberFieldUnit, NumberFieldUnitRange } from "./numberField";
import SpoolIcon from "./spoolIcon";

dayjs.extend(utc);

const FILTER_DROPDOWN_LIST_HEIGHT = 220;
const FILTER_DROPDOWN_ROW_HEIGHT = 28;
const FILTER_DROPDOWN_OVERSCAN = 6;

const FilterDropdownLoading = () => {
  return (
    <Row justify="center">
      <Col>
        Loading...
        <Spin style={{ margin: 10 }} />
      </Col>
    </Row>
  );
};

function filterSearchTerm(item: ColumnFilterItem): string {
  const extraSearchTerm = (item as ColumnFilterItem & { sortId?: string }).sortId;
  // Query-backed filters can attach a richer search key than the visible label alone.
  if (extraSearchTerm) {
    return extraSearchTerm.toLowerCase();
  }
  if (typeof item.text === "string") {
    return item.text.toLowerCase();
  }
  if (item.value !== undefined && item.value !== null) {
    return String(item.value).toLowerCase();
  }
  return "";
}

function valueKey(value: Key): string {
  return String(value);
}

function normalizeSearchableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }
  return String(value);
}

function getRecordValue(record: unknown, dataIndex: string | string[]): unknown {
  // Table columns use both AntD array paths and dotted field ids from saved table state.
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce<unknown>((current, part) => {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      return (current as Record<string, unknown>)[part];
    }, record);
  }

  if (record !== null && record !== undefined && typeof record === "object") {
    const recordObject = record as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(recordObject, dataIndex)) {
      return recordObject[dataIndex];
    }
  }

  return dataIndex.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, record);
}

function FilterDropdownContent(props: {
  items: ColumnFilterItem[];
  selectedKeys: Key[];
  setSelectedKeys: (keys: Key[]) => void;
  confirm: () => void;
  clearFilters?: () => void;
  allowMultipleFilters: boolean;
  t: (key: string) => string;
}) {
  // Keep multi-select filter dropdowns responsive even when the backend returns large option sets.
  const { items, selectedKeys, setSelectedKeys, confirm, clearFilters, allowMultipleFilters, t } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const indexedItems = useMemo(() => items.map((item) => ({ item, searchTerm: filterSearchTerm(item) })), [items]);

  const filteredItems = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    if (search.length === 0) {
      return items;
    }
    return indexedItems.filter(({ searchTerm }) => searchTerm.includes(search)).map(({ item }) => item);
  }, [indexedItems, items, searchQuery]);

  const filteredValues = useMemo(
    () =>
      filteredItems
        .map((item) => item.value)
        .filter((value): value is Key => value !== undefined && value !== null && typeof value !== "boolean"),
    [filteredItems],
  );

  const selectedKeySet = useMemo(() => new Set(selectedKeys.map(valueKey)), [selectedKeys]);
  const filteredValueKeySet = useMemo(() => new Set(filteredValues.map(valueKey)), [filteredValues]);
  const dropdownWidth = useMemo(() => {
    const minWidth = 240;
    const maxWidth = minWidth * 2;
    // Keep a stable width while typing/filtering by sizing from the full list.
    const longestTextLength = indexedItems.reduce((maxLength, indexedItem) => {
      return Math.max(maxLength, indexedItem.searchTerm.length);
    }, 0);
    const estimatedWidth = 90 + Math.min(longestTextLength, 48) * 8;
    const buttonLabelWidth = Math.max(
      (t("buttons.selectAll").length + t("buttons.selectNone").length + 8) * 7,
      minWidth,
    );
    return Math.min(Math.max(minWidth, estimatedWidth, buttonLabelWidth), maxWidth);
  }, [indexedItems, t]);

  // Virtualize the checkbox list so searching/selecting stays snappy for long filter lists.
  const visibleCount = Math.max(1, Math.ceil(FILTER_DROPDOWN_LIST_HEIGHT / FILTER_DROPDOWN_ROW_HEIGHT));
  const startIndex = Math.max(0, Math.floor(scrollTop / FILTER_DROPDOWN_ROW_HEIGHT) - FILTER_DROPDOWN_OVERSCAN);
  const endIndex = Math.min(filteredItems.length, startIndex + visibleCount + FILTER_DROPDOWN_OVERSCAN * 2);
  const visibleItems = filteredItems.slice(startIndex, endIndex);

  const selectAllFiltered = useCallback(() => {
    if (filteredValues.length === 0) {
      return;
    }
    if (!allowMultipleFilters) {
      setSelectedKeys([filteredValues[0]]);
      return;
    }

    const existing = new Map(selectedKeys.map((value) => [valueKey(value), value]));
    filteredValues.forEach((value) => existing.set(valueKey(value), value));
    setSelectedKeys(Array.from(existing.values()));
  }, [filteredValues, selectedKeys, allowMultipleFilters]);

  const selectNoneFiltered = useCallback(() => {
    if (!allowMultipleFilters) {
      const firstNonFiltered = selectedKeys.find((value) => !filteredValueKeySet.has(valueKey(value)));
      setSelectedKeys(firstNonFiltered ? [firstNonFiltered] : []);
      return;
    }
    setSelectedKeys(selectedKeys.filter((value) => !filteredValueKeySet.has(valueKey(value))));
  }, [filteredValueKeySet, selectedKeys, allowMultipleFilters]);

  return (
    <div style={{ padding: 8, width: dropdownWidth }}>
      <Input
        allowClear
        size="small"
        value={searchQuery}
        placeholder={t("buttons.filter")}
        style={{ width: "100%" }}
        onChange={(event) => {
          setSearchQuery(event.target.value);
          setScrollTop(0);
        }}
      />
      <div
        style={{
          marginTop: 8,
          marginBottom: 8,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <Button size="small" block onClick={selectAllFiltered}>
          {t("buttons.selectAll")}
        </Button>
        <Button size="small" block onClick={selectNoneFiltered}>
          {t("buttons.selectNone")}
        </Button>
      </div>
      <div
        style={{ maxHeight: FILTER_DROPDOWN_LIST_HEIGHT, overflowY: "auto", paddingRight: 4 }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          style={{
            height: filteredItems.length * FILTER_DROPDOWN_ROW_HEIGHT,
            position: "relative",
          }}
        >
          {visibleItems.map((item, offset) => {
            const index = startIndex + offset;
            const optionValue = item.value;
            if (optionValue === undefined || optionValue === null || typeof optionValue === "boolean") {
              return null;
            }
            const checked = selectedKeySet.has(valueKey(optionValue));
            return (
              <div
                key={`${valueKey(optionValue)}-${index}`}
                style={{
                  position: "absolute",
                  top: index * FILTER_DROPDOWN_ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: FILTER_DROPDOWN_ROW_HEIGHT,
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 0",
                }}
              >
                <Checkbox
                  checked={checked}
                  onChange={(event) => {
                    const isChecked = event.target.checked;
                    if (!allowMultipleFilters) {
                      setSelectedKeys(isChecked ? [optionValue] : []);
                      return;
                    }

                    if (isChecked) {
                      setSelectedKeys([...selectedKeys, optionValue]);
                    } else {
                      setSelectedKeys(selectedKeys.filter((value) => valueKey(value) !== valueKey(optionValue)));
                    }
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "inline-block",
                      maxWidth: dropdownWidth - 56,
                      verticalAlign: "bottom",
                    }}
                  >
                    {item.text}
                  </span>
                </Checkbox>
              </div>
            );
          })}
        </div>
      </div>
      <Space style={{ marginTop: 8 }}>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            confirm();
          }}
        >
          {t("buttons.filter")}
        </Button>
        <Button
          size="small"
          onClick={() => {
            setSelectedKeys([]);
            clearFilters?.();
            confirm();
          }}
        >
          {t("buttons.clear")}
        </Button>
      </Space>
    </div>
  );
}

function SearchFilterDropdownContent(props: {
  selectedKeys: Key[];
  setSelectedKeys: (keys: Key[]) => void;
  confirm: () => void;
  clearFilters?: () => void;
  t: (key: string) => string;
  placeholder: string;
}) {
  // Fall back to raw text entry when the table cannot precompute a finite option list.
  const { selectedKeys, setSelectedKeys, confirm, clearFilters, t, placeholder } = props;
  const currentValue = selectedKeys.length > 0 ? String(selectedKeys[0]) : "";

  return (
    <div style={{ padding: 8, width: 240 }}>
      <Input
        allowClear
        size="small"
        value={currentValue}
        placeholder={placeholder}
        onChange={(event) => {
          const value = event.target.value;
          setSelectedKeys(value ? [value] : []);
        }}
        onPressEnter={() => confirm()}
      />
      <Space style={{ marginTop: 8 }}>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            confirm();
          }}
        >
          {t("buttons.filter")}
        </Button>
        <Button
          size="small"
          onClick={() => {
            setSelectedKeys([]);
            clearFilters?.();
            confirm();
          }}
        >
          {t("buttons.clear")}
        </Button>
      </Space>
    </div>
  );
}

interface Entity {
  id: number;
}

export interface Action {
  name: string;
  icon: React.ReactNode;
  link?: string;
  onClick?: () => void;
}

interface BaseColumnProps<Obj extends Entity> {
  id: string | string[];
  dataId?: keyof Obj & string;
  i18ncat?: string;
  i18nkey?: string;
  title?: string;
  align?: AlignType;
  sorter?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValueFormatter?: (rawValue: unknown, record: Obj) => string;
  t: (key: string) => string;
  navigate: (link: string) => void;
  dataSource: Obj[];
  tableState: TableState;
  width?: number;
  actions?: (record: Obj) => Action[];
  transform?: (value: unknown) => unknown;
  render?: (rawValue: string | undefined, record: Obj) => React.ReactNode;
  ellipsis?: boolean;
}

interface FilteredColumnProps {
  filters?: ColumnFilterItem[];
  filteredValue?: string[];
  allowMultipleFilters?: boolean;
  onFilterDropdownOpen?: () => void;
  loadingFilters?: boolean;
}

interface CustomColumnProps<Obj> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (value: any, record: Obj, index: number) => React.ReactNode;
  onCell?: (
    data: Obj,
    index?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => React.HTMLAttributes<any> | React.TdHTMLAttributes<any>;
}

function Column<Obj extends Entity>(
  props: BaseColumnProps<Obj> & FilteredColumnProps & CustomColumnProps<Obj>,
): ColumnType<Obj> | undefined {
  const t = props.t;
  const navigate = props.navigate;

  // Hide if not in showColumns
  const id = Array.isArray(props.id) ? props.id.join(".") : props.id;
  if (props.tableState.showColumns && !props.tableState.showColumns.includes(id)) {
    return undefined;
  }

  const columnProps: ColumnType<Obj> = {
    dataIndex: props.id,
    align: props.align,
    title: props.title ?? t(props.i18nkey ?? `${props.i18ncat}.fields.${props.id}`),
    filterMultiple: props.allowMultipleFilters ?? true,
    width: props.width ?? undefined,
    onCell: props.onCell ?? undefined,
    ellipsis: props.ellipsis ?? false,
  };

  // Sorting
  if (props.sorter) {
    columnProps.sorter = true;
    columnProps.sortOrder = getSortOrderForField(
      typeSorters<Obj>(props.tableState.sorters),
      props.dataId ?? (props.id as keyof Obj),
    );
  }

  // Filter
  if (props.filters && props.filteredValue) {
    columnProps.filters = props.filters;
    columnProps.filteredValue = props.filteredValue;
    columnProps.filterDropdown = ({ selectedKeys, setSelectedKeys, confirm, clearFilters }) => {
      if (props.loadingFilters) {
        return <FilterDropdownLoading />;
      }
      return (
        <FilterDropdownContent
          items={props.filters ?? []}
          selectedKeys={selectedKeys}
          setSelectedKeys={setSelectedKeys}
          confirm={confirm}
          clearFilters={clearFilters}
          allowMultipleFilters={props.allowMultipleFilters ?? true}
          t={t}
        />
      );
    };
    columnProps.filterDropdownProps = {
      onOpenChange: (open) => {
        if (open && props.onFilterDropdownOpen) {
          props.onFilterDropdownOpen();
        }
      },
    };
    if (props.dataId) {
      columnProps.key = props.dataId;
    }
  } else if (props.searchable) {
    const filterField =
      props.dataId ?? (Array.isArray(props.id) || typeof props.id !== "string" ? undefined : props.id);
    if (filterField) {
      const typedFilters = typeFilters<Obj>(props.tableState.filters);
      const filteredValue = getFiltersForField(typedFilters, filterField);
      const searchableValues = new Map<string, string>();
      const searchValueDataIndex = props.dataId ?? props.id;

      // Searchable dropdown values are built from the loaded rows so the filter stays
      // instant and works even when the backend only supports normal field filters.
      props.dataSource.forEach((record) => {
        const rawValue = getRecordValue(record, searchValueDataIndex);
        const displayValue = props.searchValueFormatter
          ? props.searchValueFormatter(rawValue, record)
          : normalizeSearchableValue(rawValue);
        const normalizedDisplayValue = displayValue ?? "";
        const filterValue = normalizedDisplayValue === "" ? "<empty>" : normalizedDisplayValue;
        if (!searchableValues.has(filterValue)) {
          searchableValues.set(filterValue, normalizedDisplayValue);
        }
      });

      const searchableFilters: ColumnFilterItem[] = Array.from(searchableValues.entries())
        .map(([value, label]) => ({ value, text: label }))
        .sort((left, right) =>
          filterSearchTerm(left).localeCompare(filterSearchTerm(right), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );

      columnProps.filteredValue = filteredValue;

      if (searchableFilters.length > 0) {
        columnProps.filters = searchableFilters;
        columnProps.filterMultiple = true;
        columnProps.filterDropdown = ({ selectedKeys, setSelectedKeys, confirm, clearFilters }) => (
          <FilterDropdownContent
            items={searchableFilters}
            selectedKeys={selectedKeys}
            setSelectedKeys={setSelectedKeys}
            confirm={confirm}
            clearFilters={clearFilters}
            allowMultipleFilters={true}
            t={t}
          />
        );
      } else {
        columnProps.filterMultiple = false;
        columnProps.filterDropdown = ({ selectedKeys, setSelectedKeys, confirm, clearFilters }) => (
          <SearchFilterDropdownContent
            selectedKeys={selectedKeys}
            setSelectedKeys={setSelectedKeys}
            confirm={confirm}
            clearFilters={clearFilters}
            t={t}
            placeholder={props.searchPlaceholder ?? t("buttons.filter")}
          />
        );
      }

      if (props.dataId) {
        columnProps.key = props.dataId;
      }
    }
  }

  // Render
  const render =
    props.render ??
    ((rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return <>{value}</>;
    });
  columnProps.render = (value, record, index) => {
    if (!props.actions) {
      return render(value, record, index);
    }

    const actions = props.actions(record);

    return (
      <Dropdown
        menu={{
          items: actions.map((action) => ({
            key: action.name,
            label: action.name,
            icon: action.icon,
          })),
          onClick: (item) => {
            const action = actions.find((action) => action.name === item.key);
            if (action) {
              if (action.link) {
                navigate(action.link);
              } else if (action.onClick) {
                action.onClick();
              }
            }
          },
        }}
        trigger={["click"]}
      >
        <div>{render(value, record, index)}</div>
      </Dropdown>
    );
  };

  return columnProps;
}

export function SortedColumn<Obj extends Entity>(props: BaseColumnProps<Obj>) {
  return Column({
    ...props,
    sorter: true,
    searchable: props.searchable ?? true,
  });
}

export function RichColumn<Obj extends Entity>(
  props: Omit<BaseColumnProps<Obj>, "transform"> & { transform?: (value: unknown) => string },
) {
  return Column({
    ...props,
    searchable: props.searchable ?? true,
    render: (rawValue: string | undefined) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return enrichText(value);
    },
  });
}

interface FilteredQueryColumnProps<Obj extends Entity> extends BaseColumnProps<Obj> {
  filterValueQuery: UseQueryResult<string[] | ColumnFilterItem[], unknown>;
  allowMultipleFilters?: boolean;
  includeEmptyFilter?: boolean;
  emptyFilterLabel?: string;
}

export function FilteredQueryColumn<Obj extends Entity>(props: FilteredQueryColumnProps<Obj>) {
  const query = props.filterValueQuery;

  let filters: ColumnFilterItem[] = [];
  if (query.data) {
    filters = query.data.map((item) => {
      if (typeof item === "string") {
        return {
          text: item,
          value: '"' + item + '"',
        };
      }
      return item;
    });
  }
  if (props.includeEmptyFilter !== false) {
    filters.push({
      text: props.emptyFilterLabel ?? "<empty>",
      value: "<empty>",
    });
  }

  const typedFilters = typeFilters<Obj>(props.tableState.filters);
  const filteredValue = getFiltersForField(typedFilters, props.dataId ?? (props.id as keyof Obj));

  const onFilterDropdownOpen = () => {
    // Defer distinct-value fetches until the user opens the dropdown to avoid eager list-page traffic.
    if (query.data === undefined && !query.isFetching) {
      query.refetch();
    }
  };

  return Column({
    ...props,
    filters,
    filteredValue,
    onFilterDropdownOpen,
    loadingFilters: query.isLoading && query.data === undefined,
  });
}

interface NumberColumnProps<Obj extends Entity> extends BaseColumnProps<Obj> {
  unit: string;
  maxDecimals?: number;
  minDecimals?: number;
  defaultText?: string;
}

export function NumberColumn<Obj extends Entity>(props: NumberColumnProps<Obj>) {
  return Column({
    ...props,
    align: "right",
    searchable: props.searchable ?? true,
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      if (value === null || value === undefined) {
        return <TextField value={props.defaultText ?? ""} />;
      }
      return (
        <NumberFieldUnit
          value={value}
          unit={props.unit}
          options={{
            maximumFractionDigits: props.maxDecimals ?? 0,
            minimumFractionDigits: props.minDecimals ?? props.maxDecimals ?? 0,
          }}
        />
      );
    },
  });
}

export function DateColumn<Obj extends Entity>(props: BaseColumnProps<Obj>) {
  return Column({
    ...props,
    searchable: props.searchable ?? true,
    searchValueFormatter: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      if (!value) {
        return "";
      }
      return dayjs
        .utc(value as string)
        .local()
        .format("YYYY-MM-DD HH:mm");
    },
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return (
        <DateField
          hidden={!value}
          value={dayjs.utc(value).local()}
          title={dayjs.utc(value).local().format()}
          format="YYYY-MM-DD HH:mm"
        />
      );
    },
  });
}

export function ActionsColumn<Obj extends Entity>(
  title: string,
  actionsFn: (record: Obj) => Action[],
): ColumnType<Obj> | undefined {
  return {
    title,
    responsive: ["lg"],
    render: (_, record) => {
      const buttons = actionsFn(record).map((action) => {
        if (action.link) {
          return (
            <Link key={action.name} to={action.link}>
              <Button icon={action.icon} title={action.name} size="small" />
            </Link>
          );
        } else if (action.onClick) {
          return (
            <Button
              key={action.name}
              icon={action.icon}
              title={action.name}
              size="small"
              onClick={() => action.onClick!()}
            />
          );
        }
      });

      return <Space>{buttons}</Space>;
    },
  };
}

interface SpoolIconColumnProps<Obj extends Entity> extends FilteredQueryColumnProps<Obj> {
  color: (record: Obj) => string | { colors: string[]; vertical: boolean } | undefined;
}

export function SpoolIconColumn<Obj extends Entity>(props: SpoolIconColumnProps<Obj>) {
  const query = props.filterValueQuery;

  let filters: ColumnFilterItem[] = [];
  if (query.data) {
    filters = query.data.map((item) => {
      if (typeof item === "string") {
        return {
          text: item,
          value: '"' + item + '"',
        };
      }
      return item;
    });
  }
  filters.push({
    text: "<empty>",
    value: "",
  });

  const typedFilters = typeFilters<Obj>(props.tableState.filters);
  const filteredValue = getFiltersForField(typedFilters, props.dataId ?? (props.id as keyof Obj));

  const onFilterDropdownOpen = () => {
    query.refetch();
  };

  return Column({
    ...props,
    filters,
    filteredValue,
    onFilterDropdownOpen,
    loadingFilters: query.isLoading,
    onCell: () => {
      return {
        style: {
          paddingLeft: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
      };
    },
    render: (rawValue, record: Obj) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      const colorObj = props.color(record);
      return (
        <Row wrap={false} justify="space-around" align="middle">
          {colorObj && (
            <Col flex="none">
              <SpoolIcon color={colorObj} />
            </Col>
          )}
          <Col flex="auto">{value}</Col>
        </Row>
      );
    },
  });
}

export function NumberRangeColumn<Obj extends Entity>(props: NumberColumnProps<Obj>) {
  return Column({
    ...props,
    searchable: props.searchable ?? true,
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      if (value === null || value === undefined) {
        return <TextField value={props.defaultText ?? ""} />;
      }
      if (!Array.isArray(value) || value.length !== 2) {
        return <TextField value={props.defaultText ?? ""} />;
      }

      return (
        <NumberFieldUnitRange
          value={value}
          unit={props.unit}
          options={{
            maximumFractionDigits: props.maxDecimals ?? 0,
            minimumFractionDigits: props.minDecimals ?? props.maxDecimals ?? 0,
          }}
        />
      );
    },
  });
}

export function CustomFieldColumn<Obj extends Entity>(props: Omit<BaseColumnProps<Obj>, "id"> & { field: Field }) {
  const field = props.field;
  const commonProps = {
    ...props,
    id: ["extra", field.key],
    title: field.name,
    sorter: false,
    transform: (value: unknown) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      return JSON.parse(value as string);
    },
  };

  if (field.field_type === FieldType.integer) {
    return NumberColumn({
      ...commonProps,
      unit: field.unit ?? "",
      maxDecimals: 0,
    });
  } else if (field.field_type === FieldType.float) {
    return NumberColumn({
      ...commonProps,
      unit: field.unit ?? "",
      minDecimals: 0,
      maxDecimals: 3,
    });
  } else if (field.field_type === FieldType.integer_range) {
    return NumberRangeColumn({
      ...commonProps,
      unit: field.unit ?? "",
      maxDecimals: 0,
    });
  } else if (field.field_type === FieldType.float_range) {
    return NumberRangeColumn({
      ...commonProps,
      unit: field.unit ?? "",
      minDecimals: 0,
      maxDecimals: 3,
    });
  } else if (field.field_type === FieldType.text) {
    return RichColumn({
      ...commonProps,
    });
  } else if (field.field_type === FieldType.datetime) {
    return DateColumn({
      ...commonProps,
    });
  } else if (field.field_type === FieldType.boolean) {
    return Column({
      ...commonProps,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        let text;
        if (value === undefined || value === null) {
          text = "";
        } else if (value) {
          text = props.t("yes");
        } else {
          text = props.t("no");
        }
        return <TextField value={text} />;
      },
    });
  } else if (field.field_type === FieldType.choice && !field.multi_choice) {
    return Column({
      ...commonProps,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={value} />;
      },
    });
  } else if (field.field_type === FieldType.choice && field.multi_choice) {
    return Column({
      ...commonProps,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={(value as string[] | undefined)?.join(", ")} />;
      },
    });
  } else {
    return Column({
      ...commonProps,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={value} />;
      },
    });
  }
}
