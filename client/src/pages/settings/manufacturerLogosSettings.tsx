import { QuestionCircleOutlined } from "@ant-design/icons";
import { useInvalidate, useTranslate, useUpdate } from "@refinedev/core";
import {
  Button,
  Checkbox,
  Divider,
  Flex,
  Grid,
  Modal,
  Pagination,
  Select,
  Space,
  Tag,
  Table,
  Tooltip,
  Typography,
  message,
  theme,
} from "antd";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVendorLogoManifest } from "../../components/otherModels";
import { getBasePath } from "../../utils/url";
import { getAPIURL } from "../../utils/url";
import { parseExtraString, suggestVendorLogoPaths } from "../../utils/vendorLogo";
import { IVendor } from "../vendors/model";

const { Text, Paragraph, Link } = Typography;
const { useBreakpoint } = Grid;

const ROWS_PER_PAGE_OPTIONS = ["auto", 10, 20, 50, 100] as const;
type RowsPerPageOption = (typeof ROWS_PER_PAGE_OPTIONS)[number];
type VendorSelection = number[];

interface LogoPackSyncResponse {
  updated: boolean;
  source_url: string;
  web_logo_count: number;
  print_logo_count: number;
}

interface LogoPackImportResponse {
  message: string;
  web_logo_count: number;
  print_logo_count: number;
  generated_print_logo_count: number;
}

interface LogoSyncProposal {
  vendor: IVendor;
  webPath?: string;
  printPath?: string;
}

const ActionHeader = ({ title, tooltip }: { title: string; tooltip: string }) => (
  <Space size={6}>
    <Text strong>{title}</Text>
    <Tooltip title={tooltip}>
      <QuestionCircleOutlined />
    </Tooltip>
  </Space>
);

// Keep the global logo-pack refresh, review, and per-vendor field updates in one place so the workflow stays explicit.
export function ManufacturerLogosSettings() {
  const t = useTranslate();
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [messageApi, contextHolder] = message.useMessage();
  const logoManifestQuery = useVendorLogoManifest();
  const invalidate = useInvalidate();
  const { mutateAsync: updateVendor } = useUpdate();

  const [isBuildingReview, setIsBuildingReview] = useState(false);
  const [isSyncApplying, setIsSyncApplying] = useState(false);
  const [isSyncingLogoPack, setIsSyncingLogoPack] = useState(false);
  const [isImportingLogoPack, setIsImportingLogoPack] = useState(false);
  const [hasPendingReviewNotice, setHasPendingReviewNotice] = useState(false);
  const [generatePrintLogos, setGeneratePrintLogos] = useState(false);
  const [logoSourceUrl, setLogoSourceUrl] = useState<string>("https://github.com/MarksMakerSpace/filament-profiles");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [proposals, setProposals] = useState<LogoSyncProposal[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<VendorSelection>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPageOption, setRowsPerPageOption] = useState<RowsPerPageOption>("auto");
  const [autoRowsPerPage, setAutoRowsPerPage] = useState(10);
  const [maxTableBodyHeight, setMaxTableBodyHeight] = useState(340);

  const reviewTopRef = useRef<HTMLDivElement | null>(null);
  const reviewFooterRef = useRef<HTMLDivElement | null>(null);
  const logoPackInputRef = useRef<HTMLInputElement | null>(null);

  const logoPreviewHeight = isMobile ? 28 : 40;
  const rowHeight = isMobile ? 56 : 64;
  const resolvedRowsPerPage = rowsPerPageOption === "auto" ? autoRowsPerPage : rowsPerPageOption;

  // Keep review paging derived from the current viewport fit so mobile and desktop share one table model.
  const pagedProposals = useMemo(() => {
    const safePageSize = Math.max(1, resolvedRowsPerPage);
    const totalPages = Math.max(1, Math.ceil(proposals.length / safePageSize));
    const normalizedPage = Math.min(currentPage, totalPages);
    const start = (normalizedPage - 1) * safePageSize;
    return {
      totalPages,
      normalizedPage,
      safePageSize,
      rows: proposals.slice(start, start + safePageSize),
    };
  }, [currentPage, proposals, resolvedRowsPerPage]);

  useEffect(() => {
    if (currentPage !== pagedProposals.normalizedPage) {
      setCurrentPage(pagedProposals.normalizedPage);
    }
  }, [currentPage, pagedProposals.normalizedPage]);

  const recalculateAutoPaging = () => {
    if (!reviewOpen) {
      return;
    }

    const viewportHeight = window.innerHeight;
    const modalVerticalPadding = isMobile ? 28 : 84;
    const modalMaxHeight = Math.max(360, viewportHeight - modalVerticalPadding);
    const topHeight = reviewTopRef.current?.offsetHeight ?? 120;
    const footerHeight = reviewFooterRef.current?.offsetHeight ?? 70;
    const tableChromeHeight = isMobile ? 154 : 138;
    const nextMaxBodyHeight = Math.max(140, modalMaxHeight - topHeight - footerHeight - tableChromeHeight);
    setMaxTableBodyHeight(nextMaxBodyHeight);

    if (rowsPerPageOption === "auto") {
      // "Auto" should fill the available modal body without forcing the review table into nested pagination.
      const rowsThatFit = Math.max(1, Math.floor(nextMaxBodyHeight / rowHeight));
      setAutoRowsPerPage((previous) => (previous === rowsThatFit ? previous : rowsThatFit));
    }
  };

  useEffect(() => {
    if (!reviewOpen) {
      return;
    }

    const deferredRecalculate = () => {
      window.requestAnimationFrame(() => recalculateAutoPaging());
    };

    deferredRecalculate();
    window.addEventListener("resize", deferredRecalculate);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(deferredRecalculate);
    if (resizeObserver) {
      if (reviewTopRef.current) {
        resizeObserver.observe(reviewTopRef.current);
      }
      if (reviewFooterRef.current) {
        resizeObserver.observe(reviewFooterRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", deferredRecalculate);
      resizeObserver?.disconnect();
    };
  }, [reviewOpen, rowsPerPageOption, proposals.length, isMobile]);

  const tableBodyHeight = useMemo(() => {
    const visibleRowCount = pagedProposals.rows.length;
    const contentHeight = Math.max(rowHeight, visibleRowCount * rowHeight);

    if (rowsPerPageOption === "auto") {
      const autoHasOverflow = proposals.length > pagedProposals.safePageSize;
      return autoHasOverflow ? maxTableBodyHeight : Math.min(maxTableBodyHeight, contentHeight);
    }

    return Math.min(maxTableBodyHeight, contentHeight);
  }, [
    maxTableBodyHeight,
    pagedProposals.rows.length,
    pagedProposals.safePageSize,
    proposals.length,
    rowHeight,
    rowsPerPageOption,
  ]);

  const toRuntimeLogoUrl = (path: string | undefined) => {
    if (!path) {
      return undefined;
    }
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
      return path;
    }
    if (path.startsWith("/")) {
      return `${getBasePath()}${path}`;
    }
    return `${getBasePath()}/${path}`;
  };

  const buildLogoSyncProposals = async (): Promise<LogoSyncProposal[]> => {
    const manifest = logoManifestQuery.data;
    if (!manifest) {
      throw new Error(t("settings.logo_manager.not_ready"));
    }

    const response = await fetch(getAPIURL() + "/vendor");
    if (!response.ok) {
      throw new Error(t("settings.logo_manager.sync_load_error"));
    }

    const vendors = (await response.json()) as IVendor[];
    return vendors
      .map((vendor) => {
        const existingLogo = parseExtraString(vendor.extra?.logo_url);
        const existingPrintLogo = parseExtraString(vendor.extra?.print_logo_url);
        if (existingLogo && existingPrintLogo) {
          return undefined;
        }

        // Suggestions only fill missing fields; explicit vendor logo assignments always win over manifest matches.
        const { webPath, printPath } = suggestVendorLogoPaths(vendor.name, manifest);
        const proposal: LogoSyncProposal = {
          vendor,
          webPath: existingLogo ? undefined : webPath,
          printPath: existingPrintLogo ? undefined : printPath,
        };

        if (!proposal.webPath && !proposal.printPath) {
          return undefined;
        }
        return proposal;
      })
      .filter((proposal): proposal is LogoSyncProposal => Boolean(proposal));
  };

  const openSyncReview = async () => {
    setIsBuildingReview(true);
    try {
      const nextProposals = await buildLogoSyncProposals();
      setProposals(nextProposals);
      setSelectedVendorIds([]);
      setCurrentPage(1);
      setRowsPerPageOption("auto");
      setReviewOpen(true);
      // Once the review modal is opened, the "new files ready" reminder has served its purpose.
      setHasPendingReviewNotice(false);

      if (nextProposals.length === 0) {
        messageApi.info("No manufacturer logo matches were found for blank logo URLs.");
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("settings.logo_manager.sync_load_error"));
    } finally {
      setIsBuildingReview(false);
    }
  };

  const applySyncForSelection = async (vendorIds: VendorSelection) => {
    if (vendorIds.length === 0) {
      return;
    }

    setIsSyncApplying(true);
    try {
      let updatedCount = 0;
      const proposalByVendorId = new Map<number, LogoSyncProposal>(
        proposals.map((proposal) => [proposal.vendor.id, proposal]),
      );

      for (const vendorId of vendorIds) {
        const proposal = proposalByVendorId.get(vendorId);
        if (!proposal) {
          continue;
        }

        const existingLogo = parseExtraString(proposal.vendor.extra?.logo_url);
        const existingPrintLogo = parseExtraString(proposal.vendor.extra?.print_logo_url);
        const mergedExtra = { ...(proposal.vendor.extra ?? {}) };

        // Mirror the bulk-sync contract: populate blank logo fields only, never overwrite saved vendor choices.
        if (!existingLogo && proposal.webPath) {
          mergedExtra.logo_url = JSON.stringify(proposal.webPath);
        }
        if (!existingPrintLogo && proposal.printPath) {
          mergedExtra.print_logo_url = JSON.stringify(proposal.printPath);
        }

        if (
          mergedExtra.logo_url === proposal.vendor.extra?.logo_url &&
          mergedExtra.print_logo_url === proposal.vendor.extra?.print_logo_url
        ) {
          continue;
        }

        await updateVendor({
          resource: "vendor",
          id: proposal.vendor.id,
          values: { ...proposal.vendor, extra: mergedExtra },
        });
        updatedCount += 1;
      }

      if (updatedCount > 0) {
        invalidate({ resource: "vendor", invalidates: ["list"] });
      }

      const appliedSet = new Set(vendorIds);
      const remaining = proposals.filter((proposal) => !appliedSet.has(proposal.vendor.id));
      setProposals(remaining);
      setSelectedVendorIds((existing) => existing.filter((id) => !appliedSet.has(id)));
      setCurrentPage(1);

      messageApi.success(`Logo sync complete. Updated ${updatedCount} manufacturers.`);
      if (remaining.length === 0) {
        setReviewOpen(false);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("settings.logo_manager.sync_load_error"));
    } finally {
      setIsSyncApplying(false);
    }
  };

  const selectAllMatches = () => {
    setSelectedVendorIds(proposals.map((proposal) => proposal.vendor.id));
  };

  const clearChecked = () => {
    setSelectedVendorIds([]);
  };

  const renderLogoCell = (path: string | undefined) => {
    if (!path) {
      return <Text type="secondary">No match</Text>;
    }

    const filename = path.split("/").pop() ?? path;
    const url = toRuntimeLogoUrl(path);
    if (!url) {
      return <Text type="secondary">No match</Text>;
    }

    return (
      <Tooltip
        title={
          <span>
            {filename}
            <br />
            {path}
          </span>
        }
      >
        <div
          style={{
            minHeight: logoPreviewHeight,
            display: "flex",
            alignItems: "center",
          }}
        >
          <img
            src={url}
            alt={filename}
            style={{
              maxHeight: logoPreviewHeight,
              maxWidth: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </Tooltip>
    );
  };

  const tableColumns = [
    {
      title: "Manufacturer",
      dataIndex: ["vendor", "name"],
      key: "manufacturer",
      width: isMobile ? 180 : 260,
      render: (_: unknown, proposal: LogoSyncProposal) => (
        <Text style={{ fontSize: isMobile ? token.fontSize : token.fontSizeLG }}>{proposal.vendor.name}</Text>
      ),
    },
    {
      title: "Web Logo File",
      dataIndex: "webPath",
      key: "webPath",
      width: isMobile ? 210 : 320,
      render: (_: unknown, proposal: LogoSyncProposal) => renderLogoCell(proposal.webPath),
    },
    {
      title: "Print Logo File",
      dataIndex: "printPath",
      key: "printPath",
      width: isMobile ? 210 : 320,
      render: (_: unknown, proposal: LogoSyncProposal) => renderLogoCell(proposal.printPath),
    },
  ];

  const reviewScrollVars: CSSProperties = {
    ["--logo-scroll-thumb" as string]: token.colorPrimary,
    ["--logo-scroll-track" as string]: token.colorBgContainerDisabled,
  };
  const sectionHeaderStyle = { fontSize: isMobile ? token.fontSizeLG : token.fontSizeHeading4 };

  const importLogoPackFromZip = async (file: File) => {
    setIsImportingLogoPack(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("generate_print_logos", String(generatePrintLogos));

      const response = await fetch(getAPIURL() + "/vendor/logo-pack/import-zip", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as LogoPackImportResponse & { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? t("settings.logo_manager.import_load_error"));
      }

      // Refresh the manifest before showing review notices so previews and suggestions point at the imported files.
      await logoManifestQuery.refetch();
      messageApi.success(
        t("settings.logo_manager.import_done", {
          web: body.web_logo_count,
          print: body.print_logo_count,
          generated: body.generated_print_logo_count,
        }),
      );
      setHasPendingReviewNotice(true);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("settings.logo_manager.import_load_error"));
    } finally {
      setIsImportingLogoPack(false);
      if (logoPackInputRef.current) {
        logoPackInputRef.current.value = "";
      }
    }
  };

  const syncLogoPackFromGithub = async () => {
    setIsSyncingLogoPack(true);
    try {
      // Refresh only the shared local logo pack here. Per-vendor field population remains a separate review/apply step.
      const response = await fetch(getAPIURL() + "/vendor/logo-pack/sync-from-github", {
        method: "POST",
      });
      const body = (await response.json()) as LogoPackSyncResponse & { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? t("settings.logo_manager.github_load_error"));
      }

      if (body.source_url) {
        setLogoSourceUrl(body.source_url);
      }

      await logoManifestQuery.refetch();
      if (body.updated) {
        setHasPendingReviewNotice(true);
      }
      messageApi.success(
        body.updated
          ? t("settings.logo_manager.github_done_updated", {
              web: body.web_logo_count,
              print: body.print_logo_count,
            })
          : t("settings.logo_manager.github_done_no_changes", {
              web: body.web_logo_count,
              print: body.print_logo_count,
            }),
      );
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("settings.logo_manager.github_load_error"));
    } finally {
      setIsSyncingLogoPack(false);
    }
  };

  return (
    <>
      <style>
        {`
          .logo-review-table .ant-table-body {
            overflow-y: scroll !important;
            scrollbar-gutter: stable both-edges;
            scrollbar-width: auto;
            scrollbar-color: var(--logo-scroll-thumb) var(--logo-scroll-track);
          }
          .logo-review-table .ant-table-body::-webkit-scrollbar {
            width: 14px;
            height: 14px;
          }
          .logo-review-table .ant-table-body::-webkit-scrollbar-thumb {
            background-color: var(--logo-scroll-thumb);
            border-radius: 12px;
            border: 2px solid var(--logo-scroll-track);
          }
          .logo-review-table .ant-table-body::-webkit-scrollbar-track {
            background-color: var(--logo-scroll-track);
            border-radius: 12px;
          }
        `}
      </style>
      <div
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
        }}
      >
        <Space direction="vertical" size={4} style={{ width: "100%", marginBottom: 16 }}>
          <Text strong style={{ fontSize: isMobile ? token.fontSizeXL : token.fontSizeHeading3 }}>
            Manufacturer Logo Management
          </Text>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Manage automatic synchronization of manufacturer logos for this Spoolman installation.{" "}
            <Link href={`${getBasePath()}/help`} style={{ fontSize: token.fontSizeSM }}>
              Help?
            </Link>
          </Paragraph>
        </Space>

        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Text strong style={sectionHeaderStyle}>
            Import Logo Files
          </Text>
          <ActionHeader title="Sync Logo Pack" tooltip={t("settings.logo_manager.github_tooltip")} />
          <Paragraph type="secondary" style={{ marginBottom: 0, paddingInlineStart: 16 }}>
            Downloads missing logo files from the{" "}
            <Tooltip title="Open the configured logo source repository on GitHub.">
              <Link href={logoSourceUrl} target="_blank" rel="noreferrer">
                logo source repository
              </Link>
            </Tooltip>{" "}
            into the local logo library. This action updates local logo files only; manufacturer records are not
            changed.
          </Paragraph>
          <Button type="primary" onClick={() => void syncLogoPackFromGithub()} loading={isSyncingLogoPack}>
            Sync Logo Pack from Repository
          </Button>

          <ActionHeader
            title={t("settings.logo_manager.import_title")}
            tooltip={t("settings.logo_manager.import_tooltip")}
          />
          <Paragraph type="secondary" style={{ marginBottom: 0, paddingInlineStart: 16 }}>
            Imports logo files from a local ZIP archive into the same local logo library. This action updates local logo
            files only; use <Text strong>Manufacturer Logo Assignment</Text> below to apply logo paths to manufacturer
            records.
          </Paragraph>
          <Checkbox checked={generatePrintLogos} onChange={(event) => setGeneratePrintLogos(event.target.checked)}>
            {t("settings.logo_manager.generate_print_toggle")}
          </Checkbox>
          <input
            ref={logoPackInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importLogoPackFromZip(file);
              }
            }}
          />
          <Button type="primary" onClick={() => logoPackInputRef.current?.click()} loading={isImportingLogoPack}>
            {t("settings.logo_manager.import_button")}
          </Button>

          <Divider style={{ margin: "8px 0" }} />

          <Space size={6}>
            <Text strong style={sectionHeaderStyle}>
              Manufacturer Logo Assignment
            </Text>
            <Tooltip title="Builds a review list of logo matches for manufacturers with blank logo URLs. No manufacturer record is updated until you choose Sync All or Sync Checked in the review dialog.">
              <QuestionCircleOutlined />
            </Tooltip>
          </Space>
          <Paragraph type="secondary" style={{ marginBottom: 0, paddingInlineStart: 16 }}>
            Builds review proposals for manufacturers with blank logo fields from currently available local logos.
            Matching ignores minor punctuation and case differences, existing logo URLs are never overwritten, and no
            changes are written until you choose a sync action in the review dialog.
          </Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 0, paddingInlineStart: 16 }}>
            Use this workflow to review and apply assignments across multiple manufacturers. For one-manufacturer
            updates, use that manufacturer&apos;s Edit page.
          </Paragraph>
          {hasPendingReviewNotice && (
            <Space size={8} style={{ paddingInlineStart: 16 }}>
              <Tag color="gold">{t("settings.logo_manager.review_pending_badge")}</Tag>
              <Text type="secondary">{t("settings.logo_manager.review_pending_text")}</Text>
            </Space>
          )}
          <Button type="primary" onClick={() => void openSyncReview()} loading={isBuildingReview}>
            Review and Sync Manufacturer Logos
          </Button>
        </Space>
      </div>

      <Modal
        title="Review Manufacturer Logo Matches"
        open={reviewOpen}
        onCancel={() => {
          if (isSyncApplying) {
            return;
          }
          setReviewOpen(false);
        }}
        footer={null}
        width={isMobile ? "96vw" : 1220}
        style={{ top: isMobile ? 8 : 24 }}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <div ref={reviewTopRef}>
            <Paragraph type="secondary" style={{ marginBottom: 10 }}>
              Proposed assignments: {proposals.length}. Selected: {selectedVendorIds.length}.
            </Paragraph>
            <Space wrap>
              <Tooltip title="Selects every proposed manufacturer across all pages.">
                <Button onClick={selectAllMatches} disabled={proposals.length === 0 || isSyncApplying}>
                  Select All Matches
                </Button>
              </Tooltip>
              <Button onClick={clearChecked} disabled={selectedVendorIds.length === 0 || isSyncApplying}>
                Clear Checked
              </Button>
            </Space>
          </div>

          <div style={reviewScrollVars}>
            <Table<LogoSyncProposal>
              className="logo-review-table"
              rowKey={(record) => record.vendor.id}
              size={isMobile ? "small" : "middle"}
              columns={tableColumns}
              dataSource={pagedProposals.rows}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: isMobile ? 760 : 980, y: tableBodyHeight }}
              rowSelection={{
                hideSelectAll: false,
                preserveSelectedRowKeys: true,
                columnTitle: (originalNode) => (
                  <Tooltip title="Selects or clears visible rows on this page only.">
                    <span>{originalNode}</span>
                  </Tooltip>
                ),
                selectedRowKeys: selectedVendorIds,
                onChange: (keys) => {
                  setSelectedVendorIds(keys as VendorSelection);
                },
              }}
            />
          </div>

          <div ref={reviewFooterRef}>
            <Flex
              gap={12}
              justify="space-between"
              align={isMobile ? "flex-start" : "center"}
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <Space wrap>
                <Button onClick={() => setReviewOpen(false)} disabled={isSyncApplying}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void applySyncForSelection(proposals.map((proposal) => proposal.vendor.id))}
                  loading={isSyncApplying}
                  disabled={proposals.length === 0}
                >
                  Sync All
                </Button>
                <Button
                  type="primary"
                  onClick={() => void applySyncForSelection(selectedVendorIds)}
                  loading={isSyncApplying}
                  disabled={selectedVendorIds.length === 0}
                >
                  Sync Checked ({selectedVendorIds.length})
                </Button>
              </Space>

              <Space wrap style={{ marginInlineStart: isMobile ? 0 : "auto" }}>
                <Select<RowsPerPageOption>
                  value={rowsPerPageOption}
                  onChange={(value) => {
                    setRowsPerPageOption(value);
                    setCurrentPage(1);
                  }}
                  dropdownMatchSelectWidth={false}
                  style={{ minWidth: rowsPerPageOption === "auto" ? 86 : 112 }}
                  options={ROWS_PER_PAGE_OPTIONS.map((option) => ({
                    value: option,
                    label: option === "auto" ? "Auto" : `${option} / page`,
                  }))}
                />
                <Pagination
                  size={isMobile ? "small" : "default"}
                  current={pagedProposals.normalizedPage}
                  pageSize={pagedProposals.safePageSize}
                  total={proposals.length}
                  onChange={(page) => setCurrentPage(page)}
                  showSizeChanger={false}
                />
              </Space>
            </Flex>
          </div>
        </Flex>
      </Modal>
      {contextHolder}
    </>
  );
}

export default ManufacturerLogosSettings;
