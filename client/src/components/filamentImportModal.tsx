import { useTranslate } from "@refinedev/core";
import { Form, Modal, Select, Tag } from "antd";
import React from "react";
import { Trans } from "react-i18next";
import { formatFilamentLabel } from "../pages/spools/functions";
import { searchMatches } from "../utils/filtering";
import { ExternalFilament, useGetExternalDBFilaments } from "../utils/queryExternalDB";

export function FilamentImportModal(props: {
  isOpen: boolean;
  onImport: (filament: ExternalFilament) => void;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const t = useTranslate();

  const externalFilaments = useGetExternalDBFilaments();
  const filamentOptions =
    externalFilaments.data?.map((item) => {
      const textLabel = formatFilamentLabel(
        item.name,
        item.diameter,
        item.manufacturer,
        item.material,
        item.weight,
        item.spool_type
      );
      const sourceTag =
        item.source === "tigertag" ? (
          <Tag color="orange">{t("external.source_tigertag")}</Tag>
        ) : (
          <Tag color="blue">{t("external.source_spoolmandb")}</Tag>
        );
      return {
        label: (
          <span>
            {sourceTag} {textLabel}
          </span>
        ),
        searchText: textLabel,
        value: item.id,
        item: item,
      };
    }) ?? [];
  filamentOptions.sort((a, b) => a.searchText.localeCompare(b.searchText, undefined, { sensitivity: "base" }));

  return (
    <Modal
      title={t("filament.form.import_external")}
      open={props.isOpen}
      onOk={() => form.submit()}
      onCancel={() => props.onClose()}
    >
      <Form
        layout="vertical"
        form={form}
        onFinish={(values) => {
          const filament = filamentOptions.find((item) => item.value === values.filament)?.item;
          if (!filament) {
            throw new Error("Filament not found");
          }
          props.onImport(filament);
          props.onClose();
          form.resetFields();
        }}
      >
        <p>
          <Trans
            i18nKey={"filament.form.import_external_description"}
            components={{
              br: <br />,
            }}
          />
        </p>
        <Form.Item name="filament" rules={[{ required: true }]}>
          <Select
            options={filamentOptions}
            showSearch
            filterOption={(input, option) =>
              typeof option?.searchText === "string" && searchMatches(input, option.searchText)
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
