import { useCreate, useTranslate, useUpdate } from "@refinedev/core";
import { Form, Input, InputNumber, Modal, Select } from "antd";
import { useForm } from "antd/es/form/Form";
import { useEffect } from "react";
import { CalibrationStatus, ICalibrationSession } from "./model";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  filamentId?: number;
  initialValues?: Partial<ICalibrationSession>;
  onSuccess: () => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { label: string; value: CalibrationStatus }[] = [
  { label: "Planned", value: "planned" },
  { label: "In Progress", value: "in_progress" },
  { label: "Complete", value: "complete" },
  { label: "Archived", value: "archived" },
];

export const SessionFormModal = ({ open, mode, filamentId, initialValues, onSuccess, onClose }: Props) => {
  const t = useTranslate();
  const [form] = useForm();

  const { mutate: createSession, mutation: createMutation } = useCreate<ICalibrationSession>();
  const { mutate: updateSession, mutation: updateMutation } = useUpdate<ICalibrationSession>();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({
          status: initialValues.status ?? "planned",
          printer_name: initialValues.printer_name,
          nozzle_diameter: initialValues.nozzle_diameter,
          notes: initialValues.notes,
        });
      }
    }
  }, [open, initialValues, form]);

  const onFinish = (values: Record<string, unknown>) => {
    if (mode === "create") {
      createSession(
        {
          resource: "calibration/session",
          values: { ...values, filament_id: filamentId },
          successNotification: false,
        },
        {
          onSuccess: () => {
            onSuccess();
            onClose();
          },
        },
      );
    } else if (initialValues?.id !== undefined) {
      updateSession(
        {
          resource: "calibration/session",
          id: initialValues.id,
          values,
          successNotification: false,
        },
        {
          onSuccess: () => {
            onSuccess();
            onClose();
          },
        },
      );
    }
  };

  return (
    <Modal
      title={mode === "create" ? t("calibration.session_form.create_title") : t("calibration.session_form.edit_title")}
      open={open}
      onCancel={onClose}
      onOk={form.submit}
      okText={t("calibration.buttons.save")}
      confirmLoading={isLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: "planned" }}>
        <Form.Item name="status" label={t("calibration.fields.status")}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="printer_name" label={t("calibration.fields.printer_name")}>
          <Input maxLength={256} placeholder="e.g. Bambu X1C, Ender 3" />
        </Form.Item>
        <Form.Item name="nozzle_diameter" label={t("calibration.fields.nozzle_diameter")}>
          <InputNumber min={0.1} max={2.0} step={0.1} precision={2} addonAfter="mm" style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="notes" label={t("calibration.fields.notes")}>
          <Input.TextArea rows={3} maxLength={1024} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SessionFormModal;
