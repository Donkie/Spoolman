import { RightOutlined } from "@ant-design/icons";
import { useTable } from "@refinedev/antd";
import { Button, Checkbox, Col, message, Row, Space, Table } from "antd";
import { t } from "i18next";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "../../components/column";
import { useSpoolmanFilamentNames, useSpoolmanMaterials, useSpoolmanVendors } from "../../components/otherModels";
import { removeUndefined } from "../../utils/filtering";
import { TableState } from "../../utils/saveload";
import { IFilament } from "../filaments/model";

interface Props {
  description?: string;
  onContinue: (selectedFilaments: IFilament[]) => void;
}

interface IFilamentCollapsed extends IFilament {
  "vendor.name": string | null;
}

function collapseFilament(element: IFilament): IFilamentCollapsed {
  return { ...element, "vendor.name": element.vendor?.name ?? null };
}

const FilamentSelectModal = ({ description, onContinue }: Props) => {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();

  const { tableProps, sorters, filters, currentPage, pageSize } = useTable<IFilamentCollapsed>({
    resource: "filament",
    syncWithLocation: false,
    pagination: {
      mode: "off",
      currentPage: 1,
      pageSize: 10,
    },
    sorters: {
      mode: "server",
    },
    filters: {
      mode: "server",
    },
    queryOptions: {
      select(data) {
        return {
          total: data.total,
          data: data.data.map(collapseFilament),
        };
      },
    },
  });

  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
  };

  const dataSource: IFilamentCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );

  const selectUnselectFiltered = (select: boolean) => {
    setSelectedItems((prevSelected) => {
      const filtered = dataSource.map((filament) => filament.id).filter((id) => !prevSelected.includes(id));
      return select ? [...prevSelected, ...filtered] : filtered;
    });
  };

  const handleSelectItem = (item: number) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(item) ? prevSelected.filter((selected) => selected !== item) : [...prevSelected, item],
    );
  };

  const isAllFilteredSelected = dataSource.every((filament) => selectedItems.includes(filament.id));
  const isSomeButNotAllFilteredSelected =
    dataSource.some((filament) => selectedItems.includes(filament.id)) && !isAllFilteredSelected;

  const commonProps = {
    t,
    navigate,
    actions: () => [],
    dataSource,
    tableState,
    sorter: true,
  };

  return (
    <>
      {contextHolder}
      <Space direction="vertical" style={{ width: "100%" }}>
        {description && <div>{description}</div>}
        <Table
          {...tableProps}
          rowKey="id"
          tableLayout="auto"
          dataSource={dataSource}
          pagination={false}
          scroll={{ y: 200 }}
          columns={removeUndefined([
            {
              width: 50,
              render: (_, item: IFilament) => (
                <Checkbox checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} />
              ),
            },
            SortedColumn({
              ...commonProps,
              id: "id",
              i18ncat: "filament",
              width: 80,
            }),
            FilteredQueryColumn({
              ...commonProps,
              id: "vendor.name",
              i18nkey: "filament.fields.vendor_name",
              filterValueQuery: useSpoolmanVendors(),
              width: 130,
            }),
            SpoolIconColumn({
              ...commonProps,
              id: "name",
              i18ncat: "filament",
              color: (record: IFilamentCollapsed) =>
                record.multi_color_hexes
                  ? { colors: record.multi_color_hexes.split(","), vertical: record.multi_color_direction === "longitudinal" }
                  : record.color_hex,
              filterValueQuery: useSpoolmanFilamentNames(),
            }),
            FilteredQueryColumn({
              ...commonProps,
              id: "material",
              i18ncat: "filament",
              filterValueQuery: useSpoolmanMaterials(),
              width: 120,
            }),
          ])}
        />
        <Row gutter={[10, 10]}>
          <Col span={12}>
            <Checkbox
              checked={isAllFilteredSelected}
              indeterminate={isSomeButNotAllFilteredSelected}
              onChange={(e) => {
                selectUnselectFiltered(e.target.checked);
              }}
            >
              {t("printing.filamentSelect.selectAll")}
            </Checkbox>
          </Col>
          <Col span={12}>
            <div style={{ float: "right" }}>
              {t("printing.filamentSelect.selectedTotal", {
                count: selectedItems.length,
              })}
            </div>
          </Col>
          <Col span={24}>
            <Button
              type="primary"
              icon={<RightOutlined />}
              iconPosition="end"
              onClick={() => {
                if (selectedItems.length === 0) {
                  messageApi.open({
                    type: "error",
                    content: t("printing.filamentSelect.noFilamentsSelected"),
                  });
                  return;
                }
                onContinue(dataSource.filter((filament) => selectedItems.includes(filament.id)));
              }}
            >
              {t("buttons.continue")}
            </Button>
          </Col>
        </Row>
      </Space>
    </>
  );
};

export default FilamentSelectModal;
