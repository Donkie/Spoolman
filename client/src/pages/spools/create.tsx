import React, { useEffect, useState } from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, Radio, Divider, Button } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IFilament } from "../filaments/model";
import { ISpool } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { useSpoolmanLocations } from "../../components/otherModels";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import '../../utils/overrides.css'

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const SpoolCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const { form, formProps, formLoading, onFinish, redirect } = useForm<ISpool>({
    redirect: false,
    warnWhenUnsavedChanges: false
  });

  if (props.mode === "clone" && formProps.initialValues) {
    // Clear out the values that we don't want to clone
    formProps.initialValues.first_used = null;
    formProps.initialValues.last_used = null;
    formProps.initialValues.used_weight = 0;

    // Fix the filament_id
    formProps.initialValues.filament_id = formProps.initialValues.filament.id;
  }

  const handleSubmit = async (redirectTo: "list" | "edit" | "create") => {
    let values = await form.validateFields();
    if (quantity > 1) {
      let submit = Array(quantity).fill(values);
      // queue multiple creates this way for now Refine doesn't seem to map Arrays to createMany or multiple creates like it says it does
      submit.forEach(async r => await onFinish(r));
    } else {
      await onFinish(values);
    }
    redirect(redirectTo, (values as ISpool).id);
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
      spool_weight: item.spool_weight,
    };
  });
  filamentOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const [weightToEnter, setWeightToEnter] = useState(1);
  const [usedWeight, setUsedWeight] = useState(0);

  const selectedFilamentID = Form.useWatch("filament_id", form);
  const selectedFilament = filamentOptions?.find((obj) => {
    return obj.value === selectedFilamentID;
  });
  const filamentWeight = selectedFilament?.weight || 0;
  const spoolWeight = selectedFilament?.spool_weight || 0;

  const filamentChange = (newID: number) => {
    const newSelectedFilament = filamentOptions?.find((obj) => {
      return obj.value === newID;
    });
    const newFilamentWeight = newSelectedFilament?.weight || 0;
    const newSpoolWeight = newSelectedFilament?.spool_weight || 0;

    if (weightToEnter >= 3) {
      if (!(newFilamentWeight && newSpoolWeight)) {
        setWeightToEnter(2);
      }
    }
    if (weightToEnter >= 2) {
      if (!newFilamentWeight) {
        setWeightToEnter(1);
      }
    }
  };

  const weightChange = (weight: number) => {
    setUsedWeight(weight);
    form.setFieldsValue({
      used_weight: weight,
    });
  };

  const locations = useSpoolmanLocations(true);
  const [newLocation, setNewLocation] = useState("");

  const allLocations = [...(locations.data || [])];
  if (newLocation.trim() && !allLocations.includes(newLocation)) {
    allLocations.push(newLocation.trim());
  }

  const [quantity, setQuantity] = useState(1);
  const incrementQty = () => {
    setQuantity(quantity + 1);
  }

  const decrementQty = () => {
    setQuantity(quantity - 1);
  }

  return (
    <Create
      title={props.mode === "create" ? t("spool.titles.create") : t("spool.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <div style={{ display: 'flex', backgroundColor: '#141414', border: '1px solid #424242', borderRadius: '6px' }}>
            <Button type="text" style={{ padding: 0, width: 32, height: 32 }} onClick={decrementQty}>
              <MinusOutlined />
            </Button>
            <InputNumber
              name="Quantity"
              min={1}
              id="qty-input"
              controls={false}
              value={quantity}
            >
            </InputNumber>
            <Button type="text" style={{ padding: 0, width: 32, height: 32 }} onClick={incrementQty}>
              <PlusOutlined />
            </Button>
          </div>
          <Button type="primary" onClick={() => handleSubmit("list")}>{t("buttons.save")}</Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>{t("buttons.saveAndAdd")}</Button>
        </>
      )
      }
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
            onChange={(value) => {
              filamentChange(value);
            }}
          />
        </Form.Item>

        <Form.Item hidden={true} name={["used_weight"]} initialValue={0}>
          <InputNumber value={usedWeight} />
        </Form.Item>

        <Form.Item label={t("spool.fields.weight_to_use")} help={t("spool.fields_help.weight_to_use")}>
          <Radio.Group
            onChange={(value) => {
              setWeightToEnter(value.target.value);
            }}
            defaultValue={1}
            value={weightToEnter}
          >
            <Radio.Button value={1}>{t("spool.fields.used_weight")}</Radio.Button>
            <Radio.Button value={2} disabled={!filamentWeight}>
              {t("spool.fields.remaining_weight")}
            </Radio.Button>
            <Radio.Button value={3} disabled={!(filamentWeight && spoolWeight)}>
              {t("spool.fields.measured_weight")}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t("spool.fields.used_weight")} help={t("spool.fields_help.used_weight")} initialValue={0}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 1}
            value={usedWeight}
            onChange={(value) => {
              weightChange(value ?? 0);
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.remaining_weight")}
          help={t("spool.fields_help.remaining_weight")}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 2}
            value={filamentWeight ? filamentWeight - usedWeight : 0}
            onChange={(value) => {
              weightChange(filamentWeight - (value ?? 0));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.measured_weight")}
          help={t("spool.fields_help.measured_weight")}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 3}
            value={filamentWeight && spoolWeight ? filamentWeight - usedWeight + spoolWeight : 0}
            onChange={(value) => {
              weightChange(filamentWeight - ((value ?? 0) - spoolWeight));
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
          <Select
            dropdownRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Input
                  placeholder={t("spool.form.new_location_prompt")}
                  value={newLocation}
                  onChange={(event) => setNewLocation(event.target.value)}
                />
              </>
            )}
            loading={locations.isLoading}
            options={allLocations.map((item) => ({ label: item, value: item }))}
          />
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
    </Create >
  );
};

export default SpoolCreate;
