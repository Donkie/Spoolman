import { Edit, useForm } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { CloseCircleOutlined, QuestionCircleOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tooltip,
  message,
  Typography,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { useVendorLogoManifest } from "../../components/otherModels";
import VendorLogo from "../../components/vendorLogo";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { getAPIURL } from "../../utils/url";
import { suggestVendorLogoOptions, suggestVendorLogoPaths } from "../../utils/vendorLogo";
import { IVendor, IVendorParsedExtras } from "./model";

/*
The API returns the extra fields as JSON values, but we need to parse them into their real types
in order for Ant design's form to work properly. ParsedExtras does this for us.
We also need to stringify them again before sending them back to the API, which is done by overriding
the form's onFinish method. Form.Item's normalize should do this, but it doesn't seem to work.
*/

export const VendorEdit = () => {
  const { Text } = Typography;
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);
  const [isSyncingLogoPack, setIsSyncingLogoPack] = useState(false);
  const [isConvertingPrintLogo, setIsConvertingPrintLogo] = useState(false);
  const [isUploadingWebLogo, setIsUploadingWebLogo] = useState(false);
  const [isUploadingPrintLogo, setIsUploadingPrintLogo] = useState(false);
  const suppressLiveWarningUntilRef = useRef(0);
  const webLogoUploadInputRef = useRef<HTMLInputElement>(null);
  const printLogoUploadInputRef = useRef<HTMLInputElement>(null);
  const extraFields = useGetFields(EntityType.vendor);
  const logoManifest = useVendorLogoManifest();

  const { formProps, saveButtonProps } = useForm<IVendor, HttpError, IVendor, IVendor>({
    liveMode: "manual",
    redirect: false,
    onLiveEvent() {
      if (Date.now() < suppressLiveWarningUntilRef.current) {
        return;
      }
      // Warn the user if the vendor has been updated since the form was opened
      messageApi.warning(t("vendor.form.vendor_updated"));
      setHasChanged(true);
    },
  });

  // Parse the extra fields from string values into real types
  if (formProps.initialValues) {
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  // Override the form's onFinish method to stringify the extra fields
  const originalOnFinish = formProps.onFinish;
  formProps.onFinish = (allValues: IVendorParsedExtras) => {
    if (allValues !== undefined && allValues !== null) {
      // A successful save can emit our own live update event; ignore that brief echo.
      suppressLiveWarningUntilRef.current = Date.now() + 2000;
      const cleanedValues: IVendorParsedExtras = {
        ...allValues,
        extra: { ...(allValues.extra ?? {}) },
      };
      for (const key of ["logo_url", "print_logo_url"]) {
        const rawValue = cleanedValues.extra?.[key];
        if (typeof rawValue !== "string") {
          delete cleanedValues.extra?.[key];
          continue;
        }
        const trimmedValue = rawValue.trim();
        if (trimmedValue === "") {
          // Keep blank logo fields truly unset so preview/fallback logic can continue
          // using auto-matched local files instead of an empty explicit override.
          delete cleanedValues.extra?.[key];
          continue;
        }
        cleanedValues.extra![key] = trimmedValue;
      }
      // Lot of stupidity here to make types work
      const stringifiedAllValues = StringifiedExtras<IVendorParsedExtras>(cleanedValues);
      originalOnFinish?.({
        extra: {},
        ...stringifiedAllValues,
      });
    }
  };

  const watchedName = Form.useWatch(["name"], formProps.form);
  const watchedExtra = Form.useWatch(["extra"], formProps.form) as { [key: string]: unknown } | undefined;
  const logoUrlValue = typeof watchedExtra?.logo_url === "string" ? watchedExtra.logo_url.trim() : "";
  const printLogoUrlValue = typeof watchedExtra?.print_logo_url === "string" ? watchedExtra.print_logo_url.trim() : "";
  const hasCustomWebLogo = logoUrlValue !== "";
  const hasCustomPrintLogo = printLogoUrlValue !== "";
  // Build a synthetic vendor record from unsaved form state so the shared preview component works before save.
  const logoPreviewVendor: IVendor = {
    id: 0,
    registered: "",
    name: watchedName ?? "",
    extra: {
      logo_url: typeof watchedExtra?.logo_url === "string" ? watchedExtra.logo_url : "",
      print_logo_url: typeof watchedExtra?.print_logo_url === "string" ? watchedExtra.print_logo_url : "",
    },
  };
  const webLogoOptions = (logoManifest.data?.web_files ?? []).map((value) => ({ value }));
  const printLogoOptions = (logoManifest.data?.print_files ?? []).map((value) => ({ value }));
  const logoUrlLabel = (
    <>
      {t("vendor.fields.logo_url")}{" "}
      <Tooltip title={t("vendor.fields_help.logo_url")}>
        <QuestionCircleOutlined />
      </Tooltip>
    </>
  );
  const printLogoUrlLabel = (
    <>
      {t("vendor.fields.print_logo_url")}{" "}
      <Tooltip title={t("vendor.fields_help.print_logo_url")}>
        <QuestionCircleOutlined />
      </Tooltip>
    </>
  );
  const logoSuggestionsLabel = (
    <>
      {t("vendor.fields.logo_suggestions")}{" "}
      <Tooltip title={t("vendor.fields_help.logo_suggestions")}>
        <QuestionCircleOutlined />
      </Tooltip>
    </>
  );
  const printLogoSuggestionsLabel = (
    <>
      {t("vendor.fields.print_logo_suggestions")}{" "}
      <Tooltip title={t("vendor.fields_help.print_logo_suggestions")}>
        <QuestionCircleOutlined />
      </Tooltip>
    </>
  );
  const webSuggestions =
    watchedName && logoManifest.data ? suggestVendorLogoOptions(watchedName, logoManifest.data, "web") : [];
  const printSuggestions =
    watchedName && logoManifest.data ? suggestVendorLogoOptions(watchedName, logoManifest.data, "print") : [];
  const autoSuggestedPaths = useMemo(() => {
    if (!watchedName || !logoManifest.data) {
      return { webPath: undefined, printPath: undefined };
    }
    // Suggestions are hints for preview and quick-pick only; they should not silently
    // become saved vendor config until the user chooses a path.
    return suggestVendorLogoPaths(watchedName, logoManifest.data);
  }, [watchedName, logoManifest.data]);
  const hasAutoWebLogo = !hasCustomWebLogo && !!autoSuggestedPaths.webPath;
  const hasAutoPrintLogo = !hasCustomPrintLogo && !!autoSuggestedPaths.printPath;
  const hasLoadedLogoManifest = !!logoManifest.data;
  const currentPrintLogoExistsInManifest =
    printLogoUrlValue !== "" &&
    hasLoadedLogoManifest &&
    (logoManifest.data?.print_files ?? []).includes(printLogoUrlValue);
  const hasReplaceableMissingPrintLogo =
    printLogoUrlValue.startsWith("/vendor-logos/") && hasLoadedLogoManifest && !currentPrintLogoExistsInManifest;
  const canConvertPrintLogo = logoUrlValue !== "" && (printLogoUrlValue === "" || hasReplaceableMissingPrintLogo);
  const noneOptionValue = "__none__";
  const clearLogoField = (field: "logo_url" | "print_logo_url") => {
    formProps.form?.setFieldValue(["extra", field], "");
  };

  // Conversion only materializes a runtime print logo when the user already picked a web logo and no print override.
  const convertWebLogoToPrint = async () => {
    if (!canConvertPrintLogo) {
      if (printLogoUrlValue) {
        messageApi.warning(t("vendor.form.logo_convert_requires_empty_print_logo"));
        return;
      }
      messageApi.warning(t("vendor.form.logo_convert_requires_web_logo"));
      return;
    }

    setIsConvertingPrintLogo(true);
    try {
      const response = await fetch(getAPIURL() + "/vendor/logo-pack/convert-web-to-print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          logo_url: logoUrlValue,
          vendor_name: watchedName ?? null,
        }),
      });
      const body = (await response.json()) as {
        print_logo_url?: string;
        message?: string;
      };

      if (!response.ok || !body.print_logo_url) {
        throw new Error(body.message ?? t("vendor.form.logo_convert_error"));
      }

      formProps.form?.setFieldValue(["extra", "print_logo_url"], body.print_logo_url);
      await logoManifest.refetch();
      messageApi.success(body.message ?? t("vendor.form.logo_convert_success"));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("vendor.form.logo_convert_error"));
    } finally {
      setIsConvertingPrintLogo(false);
    }
  };
  const convertLogoHelpText = printLogoUrlValue
    ? hasReplaceableMissingPrintLogo
      ? t("vendor.buttons.convert_logo_to_print_help")
      : t("vendor.buttons.convert_logo_to_print_help_locked")
    : t("vendor.buttons.convert_logo_to_print_help");

  const syncLogoPackAndApplyThisManufacturer = async () => {
    const vendorName = watchedName?.trim() ?? "";
    if (vendorName === "") {
      messageApi.warning(t("vendor.form.logo_sync_requires_name"));
      return;
    }

    setIsSyncingLogoPack(true);
    try {
      // This runs the same global pack refresh as settings, then only fills blank logo fields on this unsaved form.
      const response = await fetch(getAPIURL() + "/vendor/logo-pack/sync-from-github", {
        method: "POST",
      });
      const body = (await response.json()) as {
        updated?: boolean;
        web_logo_count?: number;
        print_logo_count?: number;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? t("settings.general.logo_sync.github_load_error"));
      }

      const refreshedManifest = (await logoManifest.refetch()).data ?? logoManifest.data;
      if (!refreshedManifest) {
        throw new Error(t("settings.general.logo_sync.github_load_error"));
      }

      const suggested = suggestVendorLogoPaths(vendorName, refreshedManifest);
      const currentWebValue = String(formProps.form?.getFieldValue(["extra", "logo_url"]) ?? "").trim();
      const currentPrintValue = String(formProps.form?.getFieldValue(["extra", "print_logo_url"]) ?? "").trim();

      let appliedCount = 0;
      // This mirrors the bulk sync contract: only fill missing logo fields, never overwrite explicit form values.
      if (currentWebValue === "" && suggested.webPath) {
        formProps.form?.setFieldValue(["extra", "logo_url"], suggested.webPath);
        appliedCount += 1;
      }
      if (currentPrintValue === "" && suggested.printPath) {
        formProps.form?.setFieldValue(["extra", "print_logo_url"], suggested.printPath);
        appliedCount += 1;
      }

      if (appliedCount > 0) {
        messageApi.success(t("vendor.form.logo_sync_applied_pending_save", { count: appliedCount }));
      } else if (!suggested.webPath && !suggested.printPath) {
        messageApi.warning(t("vendor.form.logo_sync_no_match"));
      } else {
        messageApi.info(t("vendor.form.logo_sync_skipped_existing"));
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("settings.general.logo_sync.github_load_error"));
    } finally {
      setIsSyncingLogoPack(false);
    }
  };

  const uploadLogoFile = async (target: "web" | "print", file: File) => {
    if (target === "web") {
      setIsUploadingWebLogo(true);
    } else {
      setIsUploadingPrintLogo(true);
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target", target);

      const response = await fetch(getAPIURL() + "/vendor/logo-pack/upload-file", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        logo_url?: string;
        message?: string;
      };

      if (!response.ok || !body.logo_url) {
        throw new Error(body.message ?? t("vendor.form.logo_upload_error"));
      }

      const targetField = target === "web" ? "logo_url" : "print_logo_url";
      formProps.form?.setFieldValue(["extra", targetField], body.logo_url);
      await logoManifest.refetch();
      messageApi.success(
        body.message ??
          t("vendor.form.logo_upload_success", {
            field: target === "web" ? t("vendor.fields.logo_url") : t("vendor.fields.print_logo_url"),
          }),
      );
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("vendor.form.logo_upload_error"));
    } finally {
      if (target === "web") {
        setIsUploadingWebLogo(false);
      } else {
        setIsUploadingPrintLogo(false);
      }
    }
  };

  const registeredDisplay = formProps.initialValues?.registered
    ? dayjs(formProps.initialValues.registered).format("YYYY-MM-DD HH:mm:ss")
    : "-";

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {contextHolder}
      <Form {...formProps} layout="vertical">
        <Row gutter={16} align="top">
          <Col xs={24} lg={15}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>{`${t("vendor.fields.id")}: ${formProps.initialValues?.id ?? "-"}`}</Text>
              <Text type="secondary" style={{ marginLeft: 16 }}>
                {`${t("vendor.fields.registered")} ${registeredDisplay}`}
              </Text>
            </div>
            <Form.Item
              label={t("vendor.fields.name")}
              name={["name"]}
              rules={[
                {
                  required: true,
                },
              ]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item
              label={t("vendor.fields.empty_spool_weight")}
              help={t("vendor.fields_help.empty_spool_weight")}
              name={["empty_spool_weight"]}
              rules={[
                {
                  required: false,
                  type: "number",
                  min: 0,
                },
              ]}
            >
              <InputNumber addonAfter="g" precision={1} />
            </Form.Item>
            <Form.Item
              label={t("vendor.fields.external_id")}
              name={["external_id"]}
              rules={[
                {
                  required: false,
                },
              ]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item
              label={t("vendor.fields.comment")}
              name={["comment"]}
              rules={[
                {
                  required: false,
                },
              ]}
            >
              <TextArea maxLength={1024} />
            </Form.Item>
            <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
            {extraFields.data?.map((field, index) => (
              <ExtraFieldFormItem key={index} field={field} />
            ))}
          </Col>
          <Col xs={24} lg={9}>
            <Form.Item label={logoUrlLabel}>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item
                  name={["extra", "logo_url"]}
                  noStyle
                  rules={[
                    {
                      required: false,
                      type: "string",
                    },
                  ]}
                >
                  <AutoComplete
                    style={{ width: "100%" }}
                    options={webLogoOptions}
                    placeholder="/vendor-logos/web/vendor.png"
                  />
                </Form.Item>
                <Tooltip title={t("vendor.buttons.clear_logo_url")}>
                  <Button htmlType="button" icon={<CloseCircleOutlined />} onClick={() => clearLogoField("logo_url")} />
                </Tooltip>
              </Space.Compact>
            </Form.Item>
            <Form.Item style={{ marginTop: -8, marginBottom: 12 }}>
              <input
                ref={webLogoUploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadLogoFile("web", file);
                  }
                  event.target.value = "";
                }}
              />
              <Button
                htmlType="button"
                icon={<UploadOutlined />}
                loading={isUploadingWebLogo}
                onClick={() => webLogoUploadInputRef.current?.click()}
              >
                {t("vendor.buttons.upload_web_logo")}
              </Button>
            </Form.Item>
            <Form.Item label={logoSuggestionsLabel} style={{ marginTop: -8 }}>
              <Select
                value={undefined}
                placeholder={t("vendor.fields.logo_suggestions_placeholder")}
                onChange={(value) => {
                  formProps.form?.setFieldValue(["extra", "logo_url"], value === noneOptionValue ? "" : value);
                }}
                options={[
                  { label: t("vendor.fields.logo_suggestions_none"), value: noneOptionValue },
                  ...webSuggestions.map((value) => ({ label: value, value })),
                ]}
              />
            </Form.Item>
            <Form.Item
              label={
                <>
                  {t("vendor.fields.logo_preview")}
                  {hasAutoWebLogo && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t("vendor.form.logo_preview_auto_notice")}
                    </Text>
                  )}
                  {!hasCustomWebLogo && !hasAutoWebLogo && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t("vendor.form.logo_preview_default_notice")}
                    </Text>
                  )}
                </>
              }
            >
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #d9d9d9",
                }}
              >
                <VendorLogo
                  vendor={logoPreviewVendor}
                  showFallbackText
                  imgStyle={{
                    display: "block",
                    width: "100%",
                    maxHeight: "56px",
                    objectFit: "contain",
                    objectPosition: "left center",
                  }}
                  fallbackStyle={{
                    width: "100%",
                    fontWeight: 700,
                    fontSize: "20px",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#111",
                  }}
                />
              </div>
            </Form.Item>
            <Form.Item label={printLogoUrlLabel}>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item
                  name={["extra", "print_logo_url"]}
                  noStyle
                  rules={[
                    {
                      required: false,
                      type: "string",
                    },
                  ]}
                >
                  <AutoComplete
                    style={{ width: "100%" }}
                    options={printLogoOptions}
                    placeholder="/vendor-logos/print/vendor.png"
                  />
                </Form.Item>
                <Tooltip title={t("vendor.buttons.clear_logo_url")}>
                  <Button
                    htmlType="button"
                    icon={<CloseCircleOutlined />}
                    onClick={() => clearLogoField("print_logo_url")}
                  />
                </Tooltip>
              </Space.Compact>
            </Form.Item>
            <Form.Item style={{ marginTop: -8, marginBottom: 12 }}>
              <input
                ref={printLogoUploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadLogoFile("print", file);
                  }
                  event.target.value = "";
                }}
              />
              <Button
                htmlType="button"
                icon={<UploadOutlined />}
                loading={isUploadingPrintLogo}
                onClick={() => printLogoUploadInputRef.current?.click()}
              >
                {t("vendor.buttons.upload_print_logo")}
              </Button>
            </Form.Item>
            <Form.Item label={printLogoSuggestionsLabel} style={{ marginTop: -8 }}>
              <Select
                value={undefined}
                placeholder={t("vendor.fields.logo_suggestions_placeholder")}
                onChange={(value) => {
                  formProps.form?.setFieldValue(["extra", "print_logo_url"], value === noneOptionValue ? "" : value);
                }}
                options={[
                  { label: t("vendor.fields.logo_suggestions_none"), value: noneOptionValue },
                  ...printSuggestions.map((value) => ({ label: value, value })),
                ]}
              />
            </Form.Item>
            <Form.Item
              label={
                <>
                  {t("vendor.fields.print_logo_preview")}
                  {hasAutoPrintLogo && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t("vendor.form.logo_preview_auto_notice")}
                    </Text>
                  )}
                  {!hasCustomPrintLogo && !hasAutoPrintLogo && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t("vendor.form.logo_preview_default_notice")}
                    </Text>
                  )}
                </>
              }
            >
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #d9d9d9",
                }}
              >
                <VendorLogo
                  vendor={logoPreviewVendor}
                  usePrintLogo
                  showFallbackText
                  imgStyle={{
                    display: "block",
                    width: "100%",
                    maxHeight: "56px",
                    objectFit: "contain",
                    objectPosition: "left center",
                  }}
                  fallbackStyle={{
                    width: "100%",
                    fontWeight: 700,
                    fontSize: "20px",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#111",
                  }}
                />
              </div>
            </Form.Item>
            <Form.Item style={{ marginBottom: 8 }}>
              <Tooltip title={convertLogoHelpText}>
                <Button
                  onClick={() => void convertWebLogoToPrint()}
                  loading={isConvertingPrintLogo}
                  disabled={!canConvertPrintLogo}
                  type={canConvertPrintLogo ? "primary" : "default"}
                >
                  {t("vendor.buttons.convert_logo_to_print")}
                </Button>
              </Tooltip>
            </Form.Item>
            <Form.Item>
              <Tooltip title={t("vendor.buttons.sync_this_vendor_from_github_help")}>
                <Button onClick={() => void syncLogoPackAndApplyThisManufacturer()} loading={isSyncingLogoPack}>
                  {t("vendor.buttons.sync_this_vendor_from_github")}
                </Button>
              </Tooltip>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      {hasChanged && <Alert description={t("vendor.form.vendor_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default VendorEdit;
