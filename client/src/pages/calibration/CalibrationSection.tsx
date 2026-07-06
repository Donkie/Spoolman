import {
  BookOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExperimentOutlined,
  OrderedListOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useCreate, useDelete, useList, useTranslate } from "@refinedev/core";
import { Button, Card, Col, Collapse, Dropdown, Row, Space, Tag, Tooltip, Typography, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CalibrationStatus, ICalibrationSession, ICalibrationStepResult } from "./model";
import { CalibrationWizard } from "./CalibrationWizard";
import { SessionFormModal } from "./SessionFormModal";
import { StepResultDrawer } from "./StepResultDrawer";
import { STEP_CONFIGS } from "./stepConfig";
import { WIZARD_COPY } from "./wizardCopy";

dayjs.extend(utc);

const { Text, Title } = Typography;

const STATUS_COLORS: Record<CalibrationStatus, string> = {
  planned: "blue",
  in_progress: "orange",
  complete: "green",
  archived: "default",
};

const STEP_LABELS: Record<string, string> = {
  temperature: "Temperature",
  volumetric_speed: "Volumetric Speed",
  pressure_advance: "Pressure Advance",
  flow_rate: "Flow Rate",
  retraction: "Retraction",
  tolerance: "Tolerance",
  cornering: "Cornering",
  input_shaping: "Input Shaping",
  vfa: "VFA",
};

// ---- Inline confirm-delete button ----------------------------------------

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  size?: "small" | "middle" | "large";
}

function ConfirmDeleteButton({ onConfirm, size = "small" }: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onConfirm();
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Tooltip title={confirming ? "Click again to confirm" : "Delete"}>
      <Button
        size={size}
        danger
        type={confirming ? "primary" : "default"}
        icon={<DeleteOutlined />}
        onClick={handleClick}
        style={{ transition: "all 0.2s", minWidth: confirming ? 80 : undefined }}
      >
        {confirming ? "Sure?" : undefined}
      </Button>
    </Tooltip>
  );
}

// ---- Recommended settings summary ----------------------------------------

function RecommendedSummary({ sessions }: { sessions: ICalibrationSession[] }) {
  const t = useTranslate();
  const { token } = theme.useToken();

  // Collect the latest step per type that has selected_values, iterating oldest-first
  const latestByType: Record<string, ICalibrationStepResult> = {};
  for (const session of [...sessions].reverse()) {
    for (const step of session.steps) {
      if (step.selected_values && Object.keys(step.selected_values).length > 0) {
        latestByType[step.step_type] = step;
      }
    }
  }

  const entries = Object.entries(latestByType);
  if (entries.length === 0) return null;

  // Resolve a value to a human-readable string — uses select option labels where applicable
  const resolveValue = (stepType: string, key: string, value: unknown): string => {
    const config = STEP_CONFIGS[stepType as keyof typeof STEP_CONFIGS];
    if (!config) return String(value);
    const field = [...config.inputFields, ...config.outputFields].find((f) => f.key === key);
    if (!field) return String(value);
    if (field.type === "select" && field.options) {
      const opt = field.options.find((o) => o.value === value);
      if (opt) return opt.label;
    }
    const unit = field.unit ? ` ${field.unit}` : "";
    return `${value}${unit}`;
  };

  return (
    <Card
      size="small"
      style={{ background: token.colorSuccessBg, borderColor: token.colorSuccessBorder }}
      title={
        <Text strong style={{ color: token.colorSuccess, fontSize: 12 }}>
          {t("calibration.recommended_title")}
        </Text>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {entries.map(([stepType, step]) => {
          const config = STEP_CONFIGS[stepType as keyof typeof STEP_CONFIGS];
          if (!config) return null;

          const vals = config.recommendedKeys
            .filter((k) => step.selected_values?.[k] !== undefined && step.selected_values?.[k] !== null)
            .map((k) => ({
              key: k,
              label: config.outputFields.find((f) => f.key === k)?.label ?? k,
              value: resolveValue(stepType, k, step.selected_values![k]),
            }));
          if (vals.length === 0) return null;

          // Step-specific tile content
          let content: ReactNode;
          if (stepType === "input_shaping") {
            const typeX = vals.find((v) => v.key === "shaper_type_x")?.value;
            const freqX = vals.find((v) => v.key === "frequency_x")?.value;
            const typeY = vals.find((v) => v.key === "shaper_type_y")?.value;
            const freqY = vals.find((v) => v.key === "frequency_y")?.value;
            content = (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(typeX || freqX) && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: 600, opacity: 0.5, flexShrink: 0 }}>X</Text>
                    <Text strong style={{ fontSize: 13 }}>
                      {[typeX, freqX ? `@ ${freqX}` : null].filter(Boolean).join(" ")}
                    </Text>
                  </div>
                )}
                {(typeY || freqY) && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: 600, opacity: 0.5, flexShrink: 0 }}>Y</Text>
                    <Text strong style={{ fontSize: 13 }}>
                      {[typeY, freqY ? `@ ${freqY}` : null].filter(Boolean).join(" ")}
                    </Text>
                  </div>
                )}
              </div>
            );
          } else if (stepType === "vfa" && vals.length === 2) {
            const min = vals.find((v) => v.key === "min_avoidance_speed")?.value;
            const max = vals.find((v) => v.key === "max_avoidance_speed")?.value;
            const minNum = min?.replace(/\s+mm\/s$/, "");
            content = (
              <Text strong style={{ fontSize: 16 }}>
                {minNum} – {max}
              </Text>
            );
          } else if (vals.length === 1) {
            content = (
              <Text strong style={{ fontSize: 16 }}>
                {vals[0].value}
              </Text>
            );
          } else {
            content = (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {vals.map((v) => (
                  <div
                    key={v.key}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}
                  >
                    <Text style={{ fontSize: 10, opacity: 0.55, flexShrink: 0 }}>{v.label}</Text>
                    <Text strong style={{ fontSize: 13 }}>
                      {v.value}
                    </Text>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div
              key={stepType}
              style={{
                flex: "1 1 140px",
                maxWidth: 240,
                padding: "10px 14px",
                background: token.colorBgContainer,
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorSuccessBorder}`,
                borderLeft: `3px solid ${token.colorSuccess}`,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 6,
                  opacity: 0.5,
                }}
              >
                {STEP_LABELS[stepType] ?? stepType}
              </Text>
              {content}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Step list inside a session ------------------------------------------

interface StepListProps {
  session: ICalibrationSession;
  onEditStep: (step: ICalibrationStepResult) => void;
  onDeleteStep: (step: ICalibrationStepResult) => void;
}

function StepList({ session, onEditStep, onDeleteStep }: StepListProps) {
  const t = useTranslate();
  const { token } = theme.useToken();
  if (session.steps.length === 0) {
    return <Text type="secondary">{t("calibration.fields.no_steps")}</Text>;
  }
  return (
    <Space direction="vertical" style={{ width: "100%" }} size={4}>
      {session.steps.map((step) => {
        // _skipped sentinel: set by handleSaveAsSkipped in CalibrationWizard when a user
        // deliberately skips a step (e.g. Input Shaping on a printer with built-in IS).
        const isSkipped = step.outputs?._skipped === true;
        const hasRecommended = !isSkipped && step.selected_values && Object.keys(step.selected_values).length > 0;
        const isIncomplete = !isSkipped && !hasRecommended;
        return (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Tag style={{ margin: 0 }}>{STEP_LABELS[step.step_type] ?? step.step_type}</Tag>
              {WIZARD_COPY[step.step_type as keyof typeof WIZARD_COPY]?.wikiUrl && (
                <Tooltip title="OrcaSlicer wiki">
                  <a
                    href={WIZARD_COPY[step.step_type as keyof typeof WIZARD_COPY].wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "inherit", opacity: 0.45, lineHeight: 1 }}
                  >
                    <BookOutlined style={{ fontSize: 11 }} />
                  </a>
                </Tooltip>
              )}
              {isSkipped && <Tag style={{ fontSize: 11, margin: 0 }}>Skipped</Tag>}
              {hasRecommended && (
                <Tag color="success" style={{ fontSize: 11, margin: 0 }}>
                  ✓ Done
                </Tag>
              )}
              {isIncomplete && (
                <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ fontSize: 11, margin: 0 }}>
                  Incomplete
                </Tag>
              )}
              {step.confidence && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {step.confidence} confidence
                </Text>
              )}
            </span>
            <Space size={4}>
              <Tooltip title={t("calibration.buttons.edit_step")}>
                <Button size="small" icon={<EditOutlined />} onClick={() => onEditStep(step)} />
              </Tooltip>
              <ConfirmDeleteButton onConfirm={() => onDeleteStep(step)} />
            </Space>
          </div>
        );
      })}
    </Space>
  );
}

// ---- Main section --------------------------------------------------------

interface Props {
  filamentId: number | undefined;
}

export const CalibrationSection = ({ filamentId }: Props) => {
  const t = useTranslate();

  const { result, query } = useList<ICalibrationSession>({
    resource: "calibration/session",
    meta: { queryParams: { filament_id: filamentId } },
    queryOptions: { enabled: !!filamentId },
    pagination: { mode: "off" },
  });
  const sessions = result?.data ?? [];
  const isLoading = query.isLoading;
  const refetch = query.refetch;

  const { mutate: deleteItem } = useDelete();
  const { mutate: createSession } = useCreate<ICalibrationSession>();

  const inProgressSessions = sessions.filter((s) => s.status === "in_progress");
  const [wizardSession, setWizardSession] = useState<ICalibrationSession | null>(null);

  const handleStartWizard = () => {
    createSession(
      {
        resource: "calibration/session",
        values: { filament_id: filamentId, status: "in_progress" },
        successNotification: false,
      },
      {
        onSuccess: (result) => {
          refetch();
          setWizardSession(result.data);
        },
      },
    );
  };

  const [sessionModal, setSessionModal] = useState<{
    open: boolean;
    initialValues?: Partial<ICalibrationSession>;
  }>({ open: false });

  const [stepDrawer, setStepDrawer] = useState<{
    open: boolean;
    sessionId: number;
    step?: ICalibrationStepResult;
  } | null>(null);

  const openEditSession = (session: ICalibrationSession) => setSessionModal({ open: true, initialValues: session });

  const openAddStep = (session: ICalibrationSession) => setStepDrawer({ open: true, sessionId: session.id });

  const openEditStep = (session: ICalibrationSession, step: ICalibrationStepResult) =>
    setStepDrawer({ open: true, sessionId: session.id, step });

  const handleDeleteSession = (session: ICalibrationSession) => {
    deleteItem(
      { resource: "calibration/session", id: session.id, successNotification: false },
      { onSuccess: () => refetch() },
    );
  };

  const handleDeleteStep = (step: ICalibrationStepResult) => {
    deleteItem(
      { resource: "calibration/step", id: step.id, successNotification: false },
      { onSuccess: () => refetch() },
    );
  };

  const collapseItems = sessions.map((session) => ({
    key: String(session.id),
    label: (
      <span>
        <Tag color={STATUS_COLORS[session.status]}>{t(`calibration.status.${session.status}`)}</Tag>
        {dayjs.utc(session.registered).local().format("YYYY-MM-DD HH:mm")}
        {session.printer_name && <Text type="secondary"> &mdash; {session.printer_name}</Text>}
        {session.nozzle_diameter && <Text type="secondary"> &mdash; {session.nozzle_diameter}mm</Text>}
      </span>
    ),
    extra: (
      <Space size={4} onClick={(e) => e.stopPropagation()}>
        <Button size="small" icon={<PlusOutlined />} onClick={() => openAddStep(session)}>
          {t("calibration.buttons.add_step")}
        </Button>
        <Tooltip title={t("calibration.buttons.edit_session")}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditSession(session)} />
        </Tooltip>
        <ConfirmDeleteButton onConfirm={() => handleDeleteSession(session)} />
      </Space>
    ),
    children: (
      <StepList session={session} onEditStep={(step) => openEditStep(session, step)} onDeleteStep={handleDeleteStep} />
    ),
  }));

  return (
    <>
      <Card
        size="small"
        style={{ marginTop: 24 }}
        title={
          <span>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            {t("calibration.title")}
          </span>
        }
        extra={
          <Space size={4}>
            {inProgressSessions.length === 0 ? (
              <Button
                size="small"
                type="primary"
                icon={<OrderedListOutlined />}
                onClick={handleStartWizard}
                disabled={!filamentId || isLoading}
              >
                {t("calibration.wizard.start")}
              </Button>
            ) : inProgressSessions.length === 1 ? (
              <Button
                size="small"
                icon={<OrderedListOutlined />}
                onClick={() => setWizardSession(inProgressSessions[0])}
                disabled={!filamentId || isLoading}
              >
                {t("calibration.wizard.resume")}
              </Button>
            ) : (
              <Dropdown
                menu={{
                  items: inProgressSessions.map((s) => ({
                    key: String(s.id),
                    label: `${dayjs.utc(s.registered).local().format("MM-DD HH:mm")}${s.printer_name ? ` — ${s.printer_name}` : ""}`,
                    onClick: () => setWizardSession(s),
                  })),
                }}
                disabled={!filamentId || isLoading}
              >
                <Button size="small" icon={<OrderedListOutlined />}>
                  {t("calibration.wizard.resume")} ({inProgressSessions.length}) <DownOutlined />
                </Button>
              </Dropdown>
            )}
          </Space>
        }
      >
        {isLoading && <Text type="secondary">{t("loading")}</Text>}

        {!isLoading && sessions.length === 0 && <Text type="secondary">{t("calibration.no_data")}</Text>}

        {!isLoading &&
          sessions.length > 0 &&
          (() => {
            const hasRecommendedData = sessions.some((s) =>
              s.steps.some((step) => step.selected_values && Object.keys(step.selected_values).length > 0),
            );
            return (
              <Row gutter={[20, 16]}>
                {hasRecommendedData && (
                  <Col xs={24} md={12}>
                    <RecommendedSummary sessions={sessions} />
                  </Col>
                )}
                <Col xs={24} md={hasRecommendedData ? 12 : 24}>
                  <Title level={5} style={{ marginTop: 0 }}>
                    {t("calibration.fields.history")}
                  </Title>
                  <Collapse size="small" items={collapseItems} />
                </Col>
              </Row>
            );
          })()}
      </Card>

      <SessionFormModal
        open={sessionModal.open}
        mode="edit"
        filamentId={filamentId}
        initialValues={sessionModal.initialValues}
        onSuccess={() => refetch()}
        onClose={() => setSessionModal((s) => ({ ...s, open: false }))}
      />

      {stepDrawer && (
        <StepResultDrawer
          open={stepDrawer.open}
          sessionId={stepDrawer.sessionId}
          step={stepDrawer.step}
          onSuccess={() => refetch()}
          onClose={() => setStepDrawer(null)}
        />
      )}

      {wizardSession && (
        <CalibrationWizard
          open={!!wizardSession}
          session={wizardSession}
          onClose={() => {
            setWizardSession(null);
            refetch();
          }}
          onComplete={() => {
            setWizardSession(null);
            refetch();
          }}
        />
      )}
    </>
  );
};

export default CalibrationSection;
