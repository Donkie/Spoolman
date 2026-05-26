import { useTranslate } from "@refinedev/core";
import { Button, Checkbox, Form, InputNumber, Select, TimePicker, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import { useGetSettings, useSetSetting } from "../../utils/querySettings";

const DEFAULT_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
  "image/heic",
  "image/heif",
];

type PhotoSettingsForm = {
  photo_max_files_per_field: number;
  photo_max_upload_size_mb: number;
  photo_allowed_content_types: string[];
  photo_orphan_cleanup_enabled: boolean;
  photo_orphan_cleanup_time: Dayjs;
  photo_orphan_cleanup_ttl_hours: number;
};

export function PhotoSettings() {
  const settings = useGetSettings();
  const setPhotoMaxFiles = useSetSetting("photo_max_files_per_field");
  const setPhotoMaxUploadSize = useSetSetting("photo_max_upload_size_mb");
  const setPhotoAllowedContentTypes = useSetSetting("photo_allowed_content_types");
  const setPhotoCleanupEnabled = useSetSetting("photo_orphan_cleanup_enabled");
  const setPhotoCleanupTime = useSetSetting("photo_orphan_cleanup_time");
  const setPhotoCleanupTtl = useSetSetting("photo_orphan_cleanup_ttl_hours");
  const [form] = Form.useForm<PhotoSettingsForm>();
  const [messageApi, contextHolder] = message.useMessage();
  const t = useTranslate();

  useEffect(() => {
    if (settings.data) {
      form.setFieldsValue({
        photo_max_files_per_field: JSON.parse(settings.data.photo_max_files_per_field.value),
        photo_max_upload_size_mb: JSON.parse(settings.data.photo_max_upload_size_mb.value),
        photo_allowed_content_types: JSON.parse(settings.data.photo_allowed_content_types.value),
        photo_orphan_cleanup_enabled: JSON.parse(settings.data.photo_orphan_cleanup_enabled.value),
        photo_orphan_cleanup_time: dayjs(`1970-01-01T${JSON.parse(settings.data.photo_orphan_cleanup_time.value)}:00`),
        photo_orphan_cleanup_ttl_hours: JSON.parse(settings.data.photo_orphan_cleanup_ttl_hours.value),
      });
    }
  }, [settings.data, form]);

  useEffect(() => {
    if (
      setPhotoMaxFiles.isSuccess ||
      setPhotoMaxUploadSize.isSuccess ||
      setPhotoAllowedContentTypes.isSuccess ||
      setPhotoCleanupEnabled.isSuccess ||
      setPhotoCleanupTime.isSuccess ||
      setPhotoCleanupTtl.isSuccess
    ) {
      messageApi.success(t("notifications.saveSuccessful"));
    }
  }, [
    setPhotoMaxFiles.isSuccess,
    setPhotoMaxUploadSize.isSuccess,
    setPhotoAllowedContentTypes.isSuccess,
    setPhotoCleanupEnabled.isSuccess,
    setPhotoCleanupTime.isSuccess,
    setPhotoCleanupTtl.isSuccess,
    messageApi,
    t,
  ]);

  const onFinish = (values: PhotoSettingsForm) => {
    const cleanupTime = values.photo_orphan_cleanup_time.format("HH:mm");

    if (settings.data?.photo_max_files_per_field.value !== JSON.stringify(values.photo_max_files_per_field)) {
      setPhotoMaxFiles.mutate(values.photo_max_files_per_field);
    }
    if (settings.data?.photo_max_upload_size_mb.value !== JSON.stringify(values.photo_max_upload_size_mb)) {
      setPhotoMaxUploadSize.mutate(values.photo_max_upload_size_mb);
    }
    if (settings.data?.photo_allowed_content_types.value !== JSON.stringify(values.photo_allowed_content_types)) {
      setPhotoAllowedContentTypes.mutate(values.photo_allowed_content_types);
    }
    if (settings.data?.photo_orphan_cleanup_enabled.value !== JSON.stringify(values.photo_orphan_cleanup_enabled)) {
      setPhotoCleanupEnabled.mutate(values.photo_orphan_cleanup_enabled);
    }
    if (settings.data?.photo_orphan_cleanup_time.value !== JSON.stringify(cleanupTime)) {
      setPhotoCleanupTime.mutate(cleanupTime);
    }
    if (settings.data?.photo_orphan_cleanup_ttl_hours.value !== JSON.stringify(values.photo_orphan_cleanup_ttl_hours)) {
      setPhotoCleanupTtl.mutate(values.photo_orphan_cleanup_ttl_hours);
    }
  };

  const isSaving =
    settings.isFetching ||
    setPhotoMaxFiles.isPending ||
    setPhotoMaxUploadSize.isPending ||
    setPhotoAllowedContentTypes.isPending ||
    setPhotoCleanupEnabled.isPending ||
    setPhotoCleanupTime.isPending ||
    setPhotoCleanupTtl.isPending;

  return (
    <>
      <Form
        form={form}
        labelCol={{ span: 9 }}
        wrapperCol={{ span: 15 }}
        initialValues={{
          photo_allowed_content_types: DEFAULT_PHOTO_CONTENT_TYPES,
          photo_orphan_cleanup_enabled: true,
          photo_orphan_cleanup_time: dayjs("1970-01-01T03:30:00"),
          photo_orphan_cleanup_ttl_hours: 24,
        }}
        onFinish={onFinish}
        style={{
          maxWidth: "780px",
          margin: "0 auto",
        }}
      >
        <Form.Item
          label={t("settings.photo.photo_max_files_per_field.label")}
          tooltip={t("settings.photo.photo_max_files_per_field.tooltip")}
          name="photo_max_files_per_field"
          rules={[{ required: true, type: "number", min: 1, max: 50 }]}
        >
          <InputNumber min={1} max={50} precision={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          label={t("settings.photo.photo_max_upload_size_mb.label")}
          tooltip={t("settings.photo.photo_max_upload_size_mb.tooltip")}
          name="photo_max_upload_size_mb"
          rules={[{ required: true, type: "number", min: 1, max: 200 }]}
        >
          <InputNumber min={1} max={200} precision={0} addonAfter="MB" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          label={t("settings.photo.photo_allowed_content_types.label")}
          tooltip={t("settings.photo.photo_allowed_content_types.tooltip")}
          name="photo_allowed_content_types"
          rules={[{ required: true, type: "array", min: 1 }]}
        >
          <Select
            mode="tags"
            options={DEFAULT_PHOTO_CONTENT_TYPES.map((value) => ({ value, label: value }))}
            tokenSeparators={[",", " "]}
          />
        </Form.Item>

        <Form.Item
          label={t("settings.photo.photo_orphan_cleanup_enabled.label")}
          tooltip={t("settings.photo.photo_orphan_cleanup_enabled.tooltip")}
          name="photo_orphan_cleanup_enabled"
          valuePropName="checked"
        >
          <Checkbox />
        </Form.Item>

        <Form.Item
          label={t("settings.photo.photo_orphan_cleanup_time.label")}
          tooltip={t("settings.photo.photo_orphan_cleanup_time.tooltip")}
          name="photo_orphan_cleanup_time"
          rules={[{ required: true }]}
        >
          <TimePicker format="HH:mm" minuteStep={5} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          label={t("settings.photo.photo_orphan_cleanup_ttl_hours.label")}
          tooltip={t("settings.photo.photo_orphan_cleanup_ttl_hours.tooltip")}
          name="photo_orphan_cleanup_ttl_hours"
          rules={[{ required: true, type: "number", min: 1, max: 8760 }]}
        >
          <InputNumber min={1} max={8760} precision={0} addonAfter={t("settings.photo.hours")} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item wrapperCol={{ offset: 9, span: 15 }}>
          <Button type="primary" htmlType="submit" loading={isSaving}>
            {t("buttons.save")}
          </Button>
        </Form.Item>
      </Form>
      {contextHolder}
    </>
  );
}
