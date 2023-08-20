import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IFilament } from "../filaments/model";
import { ISpool } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { useSavedState } from "../../utils/saveload";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const SpoolCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const { form, formProps, saveButtonProps, formLoading } = useForm<ISpool>();

  if (props.mode === "clone" && formProps.initialValues) {
    // Clear out the values that we don't want to clone
    formProps.initialValues.first_used = null;
    formProps.initialValues.last_used = null;
    formProps.initialValues.used_weight = 0;

    // Fix the filament_id
    formProps.initialValues.filament_id = formProps.initialValues.filament.id;
  }

  const { queryResult } = useSelect<IFilament>({
    resource: "filament",
  });

  const filamentOptions = queryResult.data?.data.map((item) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = "";
    if (item.material) {
      material = ` - ${item.material}`;
    }
    const label = `${vendorPrefix}${name}${material}`;

    return {
      label: label,
      value: item.id,
	    weight: item.weight,
	    spool_weight: item.spool_weight
    };
  });
  filamentOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const [used_weight, set_used_weight] = useSavedState("create-used_weight", 0);

  const selected_filament_id = Form.useWatch('filament_id', form);
  const selected_filament = filamentOptions?.find(obj => {return obj.value === selected_filament_id});

  return (
    <Create
      title={props.mode === "create" ? t("spool.titles.create") : t("spool.titles.clone")}
      saveButtonProps={saveButtonProps}
      isLoading={formLoading}
    >
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("spool.fields.first_used")}
          name={["first_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.last_used")}
          name={["last_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.filament")}
          name={["filament_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            options={filamentOptions}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          hidden={true}
          name={["used_weight"]}
          initialValue={0}
        >
          <InputNumber
            value={used_weight}
          />
        </Form.Item>

        <Form.Item
          label={t("spool.fields.used_weight")}
          help={t("spool.fields_help.used_weight")}
          // name={["used_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            value={used_weight}
            onChange={(value) => {
              set_used_weight(value ?? 0);
              form.setFieldsValue(
              {
                used_weight: value ?? 0
              });
            }}
          />
        </Form.Item>
		<Form.Item
          label={t("spool.fields.remaining_weight")}
          help={t("spool.fields_help.remaining_weight")}
          // name={["remaining_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={!(selected_filament?.weight || 0)}
            value={(selected_filament?.weight || 0) ? (selected_filament?.weight || 0) - used_weight : 0}
            onChange={(value) => {
              set_used_weight((selected_filament?.weight || 0) - (value ?? 0));
              form.setFieldsValue(
                {
                  used_weight: (selected_filament?.weight || 0) - (value ?? 0)
                });
            }}
          />
        </Form.Item>
		<Form.Item
          label={t("spool.fields.measured_weight")}
          help={t("spool.fields_help.measured_weight")}
          // name={["measured_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={!((selected_filament?.weight || 0) && (selected_filament?.spool_weight || 0))}
            value={((selected_filament?.weight || 0) && (selected_filament?.spool_weight || 0)) ? (selected_filament?.weight || 0) - used_weight + (selected_filament?.spool_weight || 0) : 0}
            onChange={(value) => {
              set_used_weight((selected_filament?.weight || 0) - ((value ?? 0) - (selected_filament?.spool_weight || 0)));
              form.setFieldsValue(
                {
                  used_weight: (selected_filament?.weight || 0) - ((value ?? 0) - (selected_filament?.spool_weight || 0))
                });
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.location")}
          help={t("spool.fields_help.location")}
          name={["location"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.lot_nr")}
          help={t("spool.fields_help.lot_nr")}
          name={["lot_nr"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
      </Form>
    </Create>
  );
};

export default SpoolCreate;
