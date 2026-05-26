import {
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Modal, Space, Tooltip, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { EntityType } from "../utils/queryFields";
import { useGetSettings } from "../utils/querySettings";
import { PhotoFile, photoContentUrl, useDeletePhoto, usePhotos, useUploadPhoto } from "../utils/queryPhotos";

const DEFAULT_CLIENT_PHOTO_SIZE_MB = 50;
const DEFAULT_FIELD_IMAGES = 5;

type StoredPhotoItem = { kind: "stored"; photo: PhotoFile };
type UrlPhotoItem = { kind: "url"; url: string };
type PhotoViewItem = StoredPhotoItem | UrlPhotoItem;

function tr(t: TFunction, key: string, defaultValue: string): string {
  return t(key, { defaultValue });
}

function validateClientPhoto(file: File, t: TFunction, maxSizeMb: number, allowedTypes: string[]): string | null {
  const fileType = file.type.toLowerCase();
  if (!fileType.startsWith("image/")) {
    return tr(t, "photo_fields.validation.only_photo", "Only photo files can be uploaded.");
  }
  if (allowedTypes.length > 0 && !allowedTypes.includes(fileType)) {
    return tr(t, "photo_fields.validation.unsupported_type", "This photo type is not allowed.");
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return tr(t, "photo_fields.validation.max_size", "Photo is larger than the configured limit.");
  }
  return null;
}

function closeAntDropdowns() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
}

function photoUrl(value: PhotoViewItem): string {
  return value.kind === "stored" ? photoContentUrl(value.photo) : value.url;
}

function imageTitle(value: PhotoViewItem): string {
  return value.kind === "stored" ? value.photo.filename : value.url;
}

function imageKey(value: PhotoViewItem): string {
  return value.kind === "stored"
    ? `stored-${value.photo.id}-${value.photo.sha256}-${value.photo.size_bytes}`
    : `url-${value.url}`;
}

function toStoredItems(photos: PhotoFile[]): PhotoViewItem[] {
  return photos.map((photo) => ({ kind: "stored", photo }));
}

function normalizePhotoUrls(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === "string") {
    try {
      return normalizePhotoUrls(JSON.parse(value));
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function urlsToItems(urls: unknown): PhotoViewItem[] {
  return normalizePhotoUrls(urls).map((url) => ({ kind: "url", url }));
}

function PhotoPreviewModal(props: {
  items: PhotoViewItem[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const { items, index, open, onClose, onIndexChange } = props;
  const item = items[index];
  const canGoLeft = index > 0;
  const canGoRight = index < items.length - 1;
  const [titleWidth, setTitleWidth] = useState<number | undefined>();

  useEffect(() => {
    setTitleWidth(undefined);
  }, [item ? imageKey(item) : undefined]);

  useEffect(() => {
    if (!open) {
      return;
    }
    document.body.classList.add("spoolman-photo-preview-open");
    return () => document.body.classList.remove("spoolman-photo-preview-open");
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canGoLeft) {
        onIndexChange(index - 1);
      }
      if (event.key === "ArrowRight" && canGoRight) {
        onIndexChange(index + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoLeft, canGoRight, index, onIndexChange, open]);

  const titleText = item ? imageTitle(item) : undefined;
  const titleNode = titleText ? (
    <Tooltip title={titleText}>
      <div
        style={{
          maxWidth: titleWidth ? Math.min(titleWidth, window.innerWidth * 0.92) : "min(92vw, 720px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {titleText}
      </div>
    </Tooltip>
  ) : undefined;

  return (
    <Modal
      open={open}
      footer={null}
      onCancel={onClose}
      width="fit-content"
      title={titleNode}
      centered
      styles={{ body: { padding: 0 } }}
      afterOpenChange={(visible) => {
        if (visible) {
          closeAntDropdowns();
        }
      }}
      modalRender={(modal) => (
        <div
          onPointerDownCapture={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {modal}
        </div>
      )}
    >
      {item && (
        <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
          <img
            src={photoUrl(item)}
            alt={imageTitle(item)}
            onLoad={(event) => setTitleWidth(event.currentTarget.getBoundingClientRect().width)}
            style={{
              display: "block",
              maxWidth: "92vw",
              maxHeight: "78vh",
              width: "auto",
              height: "auto",
              borderRadius: 12,
              objectFit: "contain",
            }}
          />
          {canGoLeft && (
            <Button
              shape="circle"
              icon={<LeftOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange(index - 1);
              }}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(255,255,255,.55)",
                borderColor: "rgba(0,0,0,.12)",
              }}
            />
          )}
          {canGoRight && (
            <Button
              shape="circle"
              icon={<RightOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange(index + 1);
              }}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(255,255,255,.55)",
                borderColor: "rgba(0,0,0,.12)",
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function PhotoThumb(props: { item: PhotoViewItem; size?: number; onClick?: () => void; actions?: ReactNode }) {
  const { item, size = 92, onClick, actions } = props;
  return (
    <div style={{ width: size, position: "relative" }}>
      <button
        type="button"
        onClick={onClick}
        title={imageTitle(item)}
        style={{
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: size,
          height: size,
        }}
      >
        <img
          src={photoUrl(item)}
          alt={imageTitle(item)}
          loading="lazy"
          decoding="async"
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            borderRadius: 12,
            boxShadow: "0 1px 4px rgba(0,0,0,.18)",
          }}
        />
      </button>
      {actions && <div style={{ position: "absolute", right: 4, top: 4 }}>{actions}</div>}
    </div>
  );
}

function PhotoTileList(props: {
  items: PhotoViewItem[];
  size?: number;
  actions?: (item: PhotoViewItem) => React.ReactNode;
}) {
  const { items, size = 120, actions } = props;
  const { t } = useTranslation();
  const [previewIndex, setPreviewIndex] = useState<number | undefined>();
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr(t, "photo_fields.empty", "No photos")} />;
  }
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {items.map((item, index) => (
          <PhotoThumb
            key={imageKey(item)}
            item={item}
            size={size}
            onClick={() => {
              closeAntDropdowns();
              setPreviewIndex(index);
            }}
            actions={actions?.(item)}
          />
        ))}
      </div>
      <PhotoPreviewModal
        items={items}
        index={previewIndex ?? 0}
        open={previewIndex !== undefined}
        onClose={() => setPreviewIndex(undefined)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}

export function PhotoFieldEditor(props: {
  entityType: EntityType;
  entityId?: number;
  fieldKey: string;
  value?: number[];
  onChange?: (value: number[]) => void;
}) {
  const { entityType, entityId, fieldKey, value, onChange } = props;
  const { t } = useTranslation();
  const settings = useGetSettings();
  const maxFieldImages = Number(JSON.parse(settings.data?.photo_max_files_per_field.value ?? String(DEFAULT_FIELD_IMAGES)));
  const maxUploadSizeMb = Number(JSON.parse(settings.data?.photo_max_upload_size_mb.value ?? String(DEFAULT_CLIENT_PHOTO_SIZE_MB)));
  const allowedTypes = JSON.parse(settings.data?.photo_allowed_content_types.value ?? "[]") as string[];
  const photos = usePhotos(entityType, entityId, fieldKey);
  const upload = useUploadPhoto(entityType, entityId, fieldKey);
  const del = useDeletePhoto(entityType, entityId, fieldKey);
  const [messageApi, contextHolder] = message.useMessage();
  const [pendingItems, setPendingItems] = useState<PhotoFile[]>([]);
  const reservedCount = useRef(0);

  const serverItems = photos.data ?? [];
  const items = entityId === undefined || entityId === null ? pendingItems : serverItems;

  useEffect(() => {
    if (entityId === undefined || entityId === null) {
      return;
    }
    const nextIds = serverItems.map((photo) => photo.id);
    const currentIds = value ?? [];
    if (nextIds.length !== currentIds.length || nextIds.some((id, index) => id !== currentIds[index])) {
      onChange?.(nextIds);
    }
  }, [entityId, onChange, serverItems, value]);

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    accept: "image/*",
    beforeUpload: async (file) => {
      const validationError = validateClientPhoto(file, t, maxUploadSizeMb, allowedTypes);
      if (validationError) {
        messageApi.error(validationError);
        return Upload.LIST_IGNORE;
      }
      const currentCount = items.length + reservedCount.current;
      if (currentCount >= maxFieldImages) {
        messageApi.error(
          t("photo_fields.validation.max_count", {
            count: maxFieldImages,
            defaultValue: "No more than {{count}} photos can be attached to one photo field.",
          }),
        );
        return Upload.LIST_IGNORE;
      }
      reservedCount.current += 1;
      try {
        const uploaded = await upload.mutateAsync(file);
        if (entityId === undefined || entityId === null) {
          setPendingItems((current) => {
            const nextItems = [...current, uploaded].slice(0, maxFieldImages);
            onChange?.(nextItems.map((photo) => photo.id));
            return nextItems;
          });
        } else {
          const currentIds = value ?? items.map((photo) => photo.id);
          onChange?.(Array.from(new Set([...currentIds, uploaded.id])).slice(0, maxFieldImages));
        }
      } catch (error) {
        if (error instanceof Error) {
          messageApi.error(error.message);
        }
      } finally {
        reservedCount.current -= 1;
      }
      return Upload.LIST_IGNORE;
    },
  };

  return (
    <>
      {contextHolder}
      <Space direction="vertical" style={{ width: "100%" }}>
        <Upload.Dragger
          {...uploadProps}
          disabled={upload.isPending || items.length >= maxFieldImages}
          style={{ maxWidth: 520 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{tr(t, "photo_fields.upload_text", "Click or drag photos here")}</p>
          <p className="ant-upload-hint">
            {t("photo_fields.upload_hint", { count: maxFieldImages, size: maxUploadSizeMb })}
          </p>
        </Upload.Dragger>
        <PhotoTileList
          items={toStoredItems(items)}
          size={92}
          actions={(item) =>
            item.kind === "stored" ? (
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={del.isPending}
                aria-label={tr(t, "photo_fields.delete", "Delete photo")}
                onClick={(event) => {
                  event.stopPropagation();
                  del.mutate(item.photo.id, {
                    onSuccess() {
                      if (entityId === undefined || entityId === null) {
                        setPendingItems((current) => {
                          const nextItems = current.filter((photo) => photo.id !== item.photo.id);
                          onChange?.(nextItems.map((photo) => photo.id));
                          return nextItems;
                        });
                      } else {
                        const currentIds = value ?? items.map((photo) => photo.id);
                        onChange?.(currentIds.filter((id) => id !== item.photo.id));
                      }
                    },
                    onError(error) {
                      messageApi.error(error.message);
                    },
                  });
                }}
              />
            ) : undefined
          }
        />
      </Space>
    </>
  );
}

export function PhotoUrlFieldEditor(props: { value?: string[]; onChange?: (value: string[]) => void }) {
  const { value, onChange } = props;
  const { t } = useTranslation();
  const settings = useGetSettings();
  const maxFieldImages = Number(JSON.parse(settings.data?.photo_max_files_per_field.value ?? String(DEFAULT_FIELD_IMAGES)));
  const [messageApi, contextHolder] = message.useMessage();
  const [inputValue, setInputValue] = useState("");
  const urls = normalizePhotoUrls(value);

  const addUrl = () => {
    const url = inputValue.trim();
    if (!url) {
      return;
    }
    if (urls.length >= maxFieldImages) {
      messageApi.error(
        t("photo_fields.validation.max_url_count", {
          count: maxFieldImages,
          defaultValue: "No more than {{count}} photo links can be attached to one field.",
        }),
      );
      return;
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Unsupported URL scheme.");
      }
    } catch {
      messageApi.error(tr(t, "photo_fields.validation.absolute_url", "Enter an absolute http(s) photo URL."));
      return;
    }
    onChange?.([...urls, url]);
    setInputValue("");
  };

  return (
    <>
      {contextHolder}
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space.Compact style={{ maxWidth: 720, width: "100%" }}>
          <Input
            value={inputValue}
            placeholder="https://example.com/photo.jpg"
            onChange={(event) => setInputValue(event.target.value)}
            onPressEnter={addUrl}
          />
          <Button icon={<PlusOutlined />} onClick={addUrl} disabled={urls.length >= maxFieldImages}>
            {tr(t, "photo_fields.add", "Add")}
          </Button>
        </Space.Compact>
        <PhotoTileList
          items={urlsToItems(urls)}
          size={92}
          actions={(item) =>
            item.kind === "url" ? (
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={tr(t, "photo_fields.delete", "Delete photo")}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange?.(urls.filter((url) => url !== item.url));
                }}
              />
            ) : undefined
          }
        />
      </Space>
    </>
  );
}

export function PhotoFieldGrid(props: { entityType: EntityType; entityId?: number; fieldKey: string }) {
  const photos = usePhotos(props.entityType, props.entityId, props.fieldKey);
  const items = toStoredItems(photos.data ?? []);
  return <PhotoTileList items={items} size={120} />;
}

export function PhotoUrlFieldGrid(props: { urls?: string[] }) {
  return <PhotoTileList items={urlsToItems(props.urls)} size={120} />;
}

export function PhotoFieldStack(props: { entityType: EntityType; entityId?: number; fieldKey: string }) {
  const photos = usePhotos(props.entityType, props.entityId, props.fieldKey);
  return <ImageStack items={toStoredItems(photos.data ?? [])} />;
}

export function PhotoUrlFieldStack(props: { urls?: unknown }) {
  return <ImageStack items={urlsToItems(props.urls)} />;
}

function ImageStack(props: { items: PhotoViewItem[] }) {
  const { items } = props;
  const [previewIndex, setPreviewIndex] = useState<number | undefined>();
  const visible = useMemo(() => items.slice(0, 3), [items]);
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeAntDropdowns();
          setPreviewIndex(0);
        }}
        title={`${items.length} photo(s)`}
        style={{
          position: "relative",
          width: 62,
          height: 54,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        {visible.map((item, index) => (
          <img
            key={imageKey(item)}
            src={photoUrl(item)}
            alt={imageTitle(item)}
            loading="lazy"
            decoding="async"
            style={{
              position: "absolute",
              left: index * 8,
              top: index * 5,
              width: 46,
              height: 46,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,.24)",
            }}
          />
        ))}
        {items.length > 1 && (
          <span
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              fontSize: 11,
              lineHeight: "16px",
              minWidth: 18,
              borderRadius: 8,
              background: "rgba(0,0,0,.65)",
              color: "white",
            }}
          >
            +{items.length - 1}
          </span>
        )}
      </button>
      <PhotoPreviewModal
        items={items}
        index={previewIndex ?? 0}
        open={previewIndex !== undefined}
        onClose={() => setPreviewIndex(undefined)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}

export function PhotoFieldInlineButton(props: { entityType: EntityType; entityId?: number; fieldKey: string }) {
  const photos = usePhotos(props.entityType, props.entityId, props.fieldKey);
  const items = toStoredItems(photos.data ?? []);
  const [previewIndex, setPreviewIndex] = useState<number | undefined>();
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <Button
        icon={<EyeOutlined />}
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeAntDropdowns();
          setPreviewIndex(0);
        }}
      >
        {items.length}
      </Button>
      <PhotoPreviewModal
        items={items}
        index={previewIndex ?? 0}
        open={previewIndex !== undefined}
        onClose={() => setPreviewIndex(undefined)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}
