import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, Radio } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IFilament } from "../filaments/model";
import { ISpool } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";

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

  const selected_filament = Form.useWatch('filament_id', form);
  const weight_to_use = Form.useWatch('weight_to_use', form);
  const used_weight = Form.useWatch('used_weight', form);
  const remaining_weight = Form.useWatch('remaining_weight', form);
  const measured_weight = Form.useWatch('measured_weight', form);

  const handle_weight = () => {
	  if (selected_filament)
	  {
		  let filament_weight = filamentOptions.find(obj => {return obj.value === selected_filament}).weight;
		  let spool_weight = filamentOptions.find(obj => {return obj.value === selected_filament}).spool_weight || 0;
		  if (weight_to_use == 1)
		  {
              form.setFieldsValue(
			  {
				  remaining_weight: filament_weight - (used_weight || 0),
				  measured_weight: filament_weight - (used_weight || 0) + spool_weight
			  });
			  return [true, false, false];
		  }
		  else if (weight_to_use == 2)
		  {
			  form.setFieldsValue(
			  {
				  used_weight: filament_weight - (remaining_weight || 0),
				  measured_weight: (remaining_weight || 0) + spool_weight
			  });
			  return [false, true, false];
		  }
		  else if (weight_to_use == 3)
		  {
			  form.setFieldsValue(
			  {
				  used_weight: filament_weight - ((measured_weight || 0) - spool_weight),
				  remaining_weight: (measured_weight || 0) - spool_weight
			  });
			  return [false, false, true];
		  }
//		  if (weight_to_use == 0)
//		  {
//			  if (used_weight > 0)
//			  {
//				  weight_to_use = 1;
//				  form.setFieldsValue(
//				  {
//					  remaining_weight: filament_weight-used_weight
//				  });
//				  return [true, false];
//			  }
//			  else if (remaining_weight > 0)
//			  {
//				  form.setFieldsValue(
//				  {
//					  used_weight: filament_weight-remaining_weight
//				  });
//				  weight_to_use = 2;
//				  return [false, true];
//			  }
//			  else
//			  {
//				  weight_to_use = 0;
//				  return [true, true];
//			  }
//		  }
//		  else if (weight_to_use == 1)
//		  {
//			  if (used_weight > 0)
//			  {
//				  form.setFieldsValue(
//				  {
//					  remaining_weight: filament_weight-used_weight
//				  });
//				  return [true, false];
//			  }
//			  else
//			  {
//				  weight_to_use = 0;
//				  return [true, true];
//			  }
//		  }
//		  else if (weight_to_use == 2)
//		  {
//			  if (used_weight > 0)
//			  {
//				  form.setFieldsValue(
//				  {
//					  used_weight: filament_weight-remaining_weight
//				  });
//				  return [false, true];
//			  }
//			  else
//			  {
//				  weight_to_use = 0;
//				  return [true, true];
//			  }
//		  }

	  }
	  return [false, false, false];
  }

  const has_spool_weight = () => {
    if (selected_filament)
    {
      return filamentOptions.find(obj => {return obj.value === selected_filament}).spool_weight
    }
    return false;
  }

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
          label={t("spool.fields.weight_to_use")}
          help={t("spool.fields_help.weight_to_use")}
          name={["weight_to_use"]}
          initialValue={1}
        >
          <Radio.Group>
          <Radio.Button value={1}>{t("spool.fields.used_weight")}</Radio.Button>
          <Radio.Button value={2}>{t("spool.fields.remaining_weight")}</Radio.Button>
          <Radio.Button value={3} disabled={!has_spool_weight()}>{t("spool.fields.measured_weight")}</Radio.Button>
            </Radio.Group>
        </Form.Item>
        <Form.Item
          label={t("spool.fields.used_weight")}
          help={t("spool.fields_help.used_weight")}
          name={["used_weight"]}
          rules={[
            {
              required: handle_weight()[0],
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={1} formatter={numberFormatter} parser={numberParser} disabled={!handle_weight()[0]} />
        </Form.Item>
		<Form.Item
          label={t("spool.fields.remaining_weight")}
          help={t("spool.fields_help.remaining_weight")}
          name={["remaining_weight"]}
          rules={[
            {
              required: handle_weight()[1],
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={1} formatter={numberFormatter} parser={numberParser} disabled={!handle_weight()[1]} />
        </Form.Item>
		<Form.Item
          label={t("spool.fields.measured_weight")}
          help={t("spool.fields_help.measured_weight")}
          name={["measured_weight"]}
          rules={[
            {
              required: handle_weight()[2],
            },
          ]}
        >
          <InputNumber min={0} addonAfter="g" precision={1} formatter={numberFormatter} parser={numberParser} disabled={!handle_weight()[2]} />
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
