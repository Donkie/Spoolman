import {
  DatabaseOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  HighlightOutlined,
  PlusOutlined,
  ShopOutlined,
  ShoppingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useList, useNavigation, useTranslate } from "@refinedev/core";
import { Button, Tabs, theme, Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { Trans } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { formatWeight } from "../../utils/parsing";
import { useCurrencyFormatter } from "../../utils/settings";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";
import "./home.css";

dayjs.extend(utc);
dayjs.extend(relativeTime);

const { useToken } = theme;

// Dark surface palette — works on top of the app's existing dark background
export const Home = () => {
  const { token } = useToken();
  const isDark = token.colorBgBase !== "#fff" && token.colorBgBase !== "#ffffff";

  const S = isDark
    ? { lowest: "#1a1a1a", low: "#1f1f1f", base: "#252525", high: "#2a2a2a", highest: "#313131" }
    : { lowest: "#f5f5f5", low: "#ffffff", base: "#fafafa", high: "#f0f0f0", highest: "#d9d9d9" };
  const t = useTranslate();
  const navigate = useNavigate();
  const { showUrl } = useNavigation();
  const currencyFormatter = useCurrencyFormatter();

  const spoolsAll = useList<ISpool>({
    resource: "spool",
    pagination: { mode: "off" },
    meta: { queryParams: { allow_archived: false } },
  });
  const filaments = useList<IFilament>({
    resource: "filament",
    pagination: { pageSize: 1 },
  });
  const vendors = useList<ISpool>({
    resource: "vendor",
    pagination: { pageSize: 1 },
  });

  const allSpools = spoolsAll.result?.data ?? [];
  const hasSpools = allSpools.length > 0;
  const isLoading = spoolsAll.query.isLoading;

  // --- Calculations ---
  const totalRemainingWeight = allSpools.reduce((sum, s) => sum + (s.remaining_weight ?? 0), 0);
  const totalValue = allSpools.reduce((sum, s) => sum + (s.price ?? 0), 0);

  const lowStockSpools = allSpools
    .filter((s) => {
      const total = s.initial_weight ?? s.filament.weight ?? 1000;
      const remaining = s.remaining_weight ?? total;
      return remaining / total < 0.15;
    })
    .sort((a, b) => {
      const pctA = (a.remaining_weight ?? 0) / (a.initial_weight ?? a.filament.weight ?? 1000);
      const pctB = (b.remaining_weight ?? 0) / (b.initial_weight ?? b.filament.weight ?? 1000);
      return pctA - pctB;
    });

  const recentSpools = [...allSpools]
    .filter((s) => s.last_used)
    .sort((a, b) => dayjs(b.last_used).valueOf() - dayjs(a.last_used).valueOf())
    .slice(0, 5);

  const materialMap: Record<string, { count: number; weight: number }> = {};
  allSpools.forEach((s) => {
    const mat = s.filament.material ?? "Unknown";
    if (!materialMap[mat]) materialMap[mat] = { count: 0, weight: 0 };
    materialMap[mat].count++;
    materialMap[mat].weight += s.remaining_weight ?? 0;
  });
  const materialBreakdown = Object.entries(materialMap).sort((a, b) => b[1].weight - a[1].weight);

  const locationMap: Record<string, number> = {};
  allSpools.forEach((s) => {
    const loc = s.location || t("locations.no_location");
    locationMap[loc] = (locationMap[loc] ?? 0) + 1;
  });
  const locationBreakdown = Object.entries(locationMap).sort((a, b) => b[1] - a[1]);

  const vendorCount: Record<string, number> = {};
  allSpools.forEach((s) => {
    const name = s.filament.vendor && "name" in s.filament.vendor ? s.filament.vendor.name : "?";
    vendorCount[name] = (vendorCount[name] ?? 0) + 1;
  });
  const vendorBreakdown = Object.entries(vendorCount).sort((a, b) => b[1] - a[1]);
  const topVendor = vendorBreakdown[0]?.[0] ?? "-";

  // --- Helpers ---
  function getColorHex(spool: ISpool): string {
    return "#" + (spool.filament.color_hex ?? "555555").replace("#", "");
  }

  function getSpoolName(spool: ISpool): string {
    if (spool.filament.vendor && "name" in spool.filament.vendor) {
      return `${spool.filament.vendor.name} - ${spool.filament.name}`;
    }
    return spool.filament.name ?? spool.filament.id.toString();
  }

  function getWeightPct(spool: ISpool): number {
    const total = spool.initial_weight ?? spool.filament.weight ?? 1000;
    const remaining = spool.remaining_weight ?? total;
    return Math.max(0, Math.min(100, (remaining / total) * 100));
  }

  const matColors: Record<string, string> = isDark
    ? {
        PLA: "#81ecff",
        "PLA+": "#00e3fd",
        PETG: "#6ded00",
        ABS: "#ff7350",
        "ABS+": "#ff9070",
        ASA: "#eb2f96",
        TPU: "#b388ff",
        "TPU 95A": "#b388ff",
        "PETG-CF": "#00bcd4",
        nGen: "#ff5252",
      }
    : {
        PLA: "#0891b2",
        "PLA+": "#0e7490",
        PETG: "#16a34a",
        ABS: "#ea580c",
        "ABS+": "#f97316",
        ASA: "#c026d3",
        TPU: "#7c3aed",
        "TPU 95A": "#7c3aed",
        "PETG-CF": "#0d9488",
        nGen: "#dc2626",
  };

  if (isLoading) {
    return <div className="dashboard" style={{ paddingTop: 64, textAlign: "center", opacity: 0.3 }}>Loading...</div>;
  }

  if (!hasSpools) {
    return (
      <div className="dashboard empty-hero">
        <div className="empty-hero-icon" style={{ background: token.colorPrimary }}>
          <DatabaseOutlined style={{ fontSize: 40, color: "#fff" }} />
        </div>
        <h2 className="empty-hero-title">{t("home.welcome")}</h2>
        <p className="empty-hero-desc">
          <Trans i18nKey="home.description" components={{ helpPageLink: <Link to="/help" /> }} />
        </p>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => navigate("/spool/create")}
          className="empty-hero-btn"
        >
          {t("spool.titles.create")}
        </Button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h2>{t("home.home")}</h2>
          <p className="dash-subtitle">{t("home.telemetry_subtitle") || "Real-time status of your filament inventory."}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Tooltip title={t("spool.titles.create")}>
            <Button type="primary" icon={<DatabaseOutlined />} onClick={() => navigate("/spool/create")} />
          </Tooltip>
          <Tooltip title={t("filament.titles.create")}>
            <Button type="primary" icon={<HighlightOutlined />} onClick={() => navigate("/filament/create")} />
          </Tooltip>
          <Tooltip title={t("vendor.titles.create")}>
            <Button type="primary" icon={<ShopOutlined />} onClick={() => navigate("/vendor/create")} />
          </Tooltip>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ background: S.low }}>
          <DatabaseOutlined className="kpi-bg-icon" />
          <div className="kpi-label">{t("spool.spool")}</div>
          <div className="kpi-value">{spoolsAll.result?.total ?? 0}</div>
          <div className="kpi-footer" style={{ color: isDark ? "#6ded00" : "#16a34a" }}>
            <span>+{allSpools.filter((s) => dayjs(s.registered).isAfter(dayjs().subtract(30, "day"))).length} THIS MONTH</span>
          </div>
        </div>

        <div className="kpi-card" style={{ background: S.low }}>
          <HighlightOutlined className="kpi-bg-icon" />
          <div className="kpi-label">{t("filament.filament")}</div>
          <div className="kpi-value">{filaments.result?.total ?? 0}</div>
          <div className="kpi-footer" style={{ color: isDark ? "#00e3fd" : "#0891b2" }}>
            <span>ALL SYNCED</span>
          </div>
        </div>

        <div className="kpi-card" style={{ background: S.low }}>
          <ShopOutlined className="kpi-bg-icon" />
          <div className="kpi-label">{t("vendor.vendor")}</div>
          <div className="kpi-value">{vendors.result?.total ?? 0}</div>
          <div className="kpi-footer" style={{ opacity: 0.4 }}>
            TOP: {topVendor.toUpperCase()}
          </div>
        </div>

        <div className="kpi-card" style={{ background: S.low }}>
          <ShoppingOutlined className="kpi-bg-icon" />
          <div className="kpi-label">{t("home.total_weight")}</div>
          <div className="kpi-value">
            {formatWeight(totalRemainingWeight, 1).split(" ")[0]}{" "}
            <span className="kpi-unit">{formatWeight(totalRemainingWeight, 1).split(" ")[1]}</span>
          </div>
          <div className="kpi-footer" style={{ color: lowStockSpools.length > 0 ? "#ff716c" : undefined, opacity: lowStockSpools.length > 0 ? 1 : 0.4 }}>
            {lowStockSpools.length > 0 ? (
              <><WarningOutlined /> {lowStockSpools.length} {t("home.low_stock").toUpperCase()}</>
            ) : (
              <span>{t("home.total_value")}: {currencyFormatter.format(totalValue)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="dashboard-main">
        {/* Left Column — Tabs */}
        <Tabs
          defaultActiveKey="lowstock"
          items={[
            {
              key: "lowstock",
              label: (
                <span>
                  <WarningOutlined style={{ color: "#ff716c" }} /> {t("home.low_stock")}
                </span>
              ),
              children: (
                <div className="dash-section" style={{ background: S.low }}>
                  {lowStockSpools.length === 0 ? (
                    <div className="dash-empty">{t("home.all_stocked")}</div>
                  ) : (
                    <div className="low-stock-list">
                      {lowStockSpools.map((spool) => {
                        const pct = getWeightPct(spool);
                        const remaining = spool.remaining_weight ?? 0;
                        const total = spool.initial_weight ?? spool.filament.weight ?? 1000;
                        const barColor = pct <= 5 ? "#ff716c" : "#d7383b";
                        const hex = getColorHex(spool);

                        return (
                          <div
                            key={spool.id}
                            className="low-stock-item"
                            style={{ background: S.lowest }}
                            onClick={() => navigate(showUrl("spool", spool.id))}
                          >
                            <div className="low-stock-left">
                              <div
                                className="low-stock-color-dot"
                                style={{ backgroundColor: hex, boxShadow: isDark ? `0 0 14px ${hex}50` : `0 1px 3px rgba(0,0,0,0.12)` }}
                              />
                              <div className="low-stock-info">
                                <h4>{getSpoolName(spool)}</h4>
                                <p>Material: {spool.filament.material ?? "?"}</p>
                              </div>
                            </div>
                            <div className="low-stock-right">
                              <div className="low-stock-weight" style={{ color: barColor }}>
                                {formatWeight(remaining, 0)} <span className="total">/ {formatWeight(total, 0)}</span>
                              </div>
                              <div className="low-stock-bar" style={{ background: S.highest }}>
                                <div
                                  className="low-stock-bar-fill"
                                  style={{
                                    width: `${Math.max(pct, 1)}%`,
                                    backgroundColor: barColor,
                                    boxShadow: isDark ? `0 0 8px ${barColor}80` : "none",
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "materials",
              label: (
                <span>
                  <ExperimentOutlined /> {t("home.by_material")}
                </span>
              ),
              children: (
                <div className="dash-section" style={{ background: S.low }}>
                  <div className="material-list">
                    {materialBreakdown.map(([material, data]) => {
                      const maxWeight = materialBreakdown[0]?.[1].weight || 1;
                      const pct = (data.weight / maxWeight) * 100;
                      const color = matColors[material] ?? "#81ecff";
                      return (
                        <div key={material}>
                          <div className="material-header">
                            <span className="material-name">{material}</span>
                            <span className="material-weight">{formatWeight(data.weight, 0)}</span>
                          </div>
                          <div className="material-bar" style={{ background: S.highest }}>
                            <div
                              className="material-bar-fill"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: color,
                                boxShadow: isDark ? `0 0 12px ${color}40` : "none",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            },
            {
              key: "vendors",
              label: (
                <span>
                  <ShopOutlined /> {t("home.by_vendor")}
                </span>
              ),
              children: (
                <div className="dash-section" style={{ background: S.low }}>
                  <div className="material-list">
                    {vendorBreakdown.map(([vendor, count], idx) => {
                      const maxCount = vendorBreakdown[0]?.[1] || 1;
                      const pct = (count / maxCount) * 100;
                      let barColor: string;
                      if (idx === 0) {
                        barColor = isDark ? "#81ecff" : "#0891b2";
                      } else if (idx < 3) {
                        barColor = isDark ? "#6ded00" : "#16a34a";
                      } else {
                        barColor = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)";
                      }
                      return (
                        <div key={vendor}>
                          <div className="material-header">
                            <span className="material-name">{vendor}</span>
                            <span className="material-weight">{count} {t("spool.spool")}</span>
                          </div>
                          <div className="material-bar" style={{ background: S.highest }}>
                            <div
                              className="material-bar-fill"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: barColor,
                                boxShadow: isDark ? `0 0 12px ${barColor}40` : "none",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            },
          ]}
        />

        {/* Right Column — Recently Used + Locations */}
        <div className="dash-right-col">
          <div className="dash-right-section" style={{ background: S.low }}>
            <div className="dash-section-header">
              <h3 className="dash-section-title">{t("home.recently_used")}</h3>
            </div>
            {recentSpools.length === 0 ? (
              <div className="dash-empty">{t("home.no_recent")}</div>
            ) : (
              <div className="timeline-list">
                {recentSpools.map((spool, idx) => {
                  const isFirst = idx === 0;
                  return (
                    <div
                      key={spool.id}
                      className="timeline-item"
                      onClick={() => navigate(showUrl("spool", spool.id))}
                    >
                      <div
                        className={"timeline-dot" + (isFirst ? " active" : "")}
                        style={{
                          backgroundColor: isFirst ? token.colorPrimary : isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
                          color: isFirst ? token.colorPrimary : undefined,
                        }}
                      />
                      <div>
                        <div className="timeline-time">{dayjs(spool.last_used).fromNow()}</div>
                        <div className="timeline-name">{getSpoolName(spool)}</div>
                        <div className="timeline-detail">
                          {spool.filament.material ?? ""} · {formatWeight(spool.remaining_weight ?? 0, 0)} · {spool.location || t("locations.no_location")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="dash-right-section" style={{ background: S.low }}>
            <div className="dash-section-header">
              <h3 className="dash-section-title">
                <EnvironmentOutlined />
                {t("home.by_location")}
              </h3>
            </div>
            <div className="location-list">
              {locationBreakdown.map(([location, count], idx) => {
                let badgeBg: string;
                let badgeColor: string;
                if (idx === 0) {
                  badgeBg = isDark ? "rgba(129, 236, 255, 0.1)" : "rgba(8, 145, 178, 0.1)";
                  badgeColor = isDark ? "#00e3fd" : "#0891b2";
                } else if (idx < 3) {
                  badgeBg = isDark ? "rgba(109, 237, 0, 0.08)" : "rgba(22, 163, 74, 0.1)";
                  badgeColor = isDark ? "#6ded00" : "#16a34a";
                } else {
                  badgeBg = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)";
                  badgeColor = isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.4)";
                }
                return (
                  <div
                    key={location}
                    className="location-item"
                    style={{ background: S.high }}
                    onClick={() => navigate("/locations")}
                  >
                    <span className="location-name">{location}</span>
                    <span className="location-badge" style={{ background: badgeBg, color: badgeColor }}>
                      {count} {t("spool.spool")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
