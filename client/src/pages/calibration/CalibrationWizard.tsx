/**
 * CalibrationWizard — guided multi-step calibration modal.
 *
 * Layout: clickable vertical step sidebar on the left, focused content panel on the right.
 * Form: "Test Setup" (inputs) + "Your Result" (outputs+selected_values merged — saves to both).
 * Supports resume, skip, back, and pause (session stays in_progress).
 */

import {
  BookOutlined,
  CheckOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useCreate, useTranslate, useUpdate } from "@refinedev/core";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import { useForm } from "antd/es/form/Form";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CalibrationStepType, ICalibrationSession, ICalibrationStepResult } from "./model";
import { STEP_CONFIGS, StepField } from "./stepConfig";
import { WIZARD_COPY, WIZARD_STEP_ORDER } from "./wizardCopy";

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldItem({ field, namePrefix }: { field: StepField; namePrefix: string }) {
  const control =
    field.type === "select" ? (
      <Select options={field.options} style={{ width: "100%" }} />
    ) : (
      <InputNumber
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        precision={field.precision ?? 0}
        addonAfter={field.unit}
        style={{ width: "100%" }}
      />
    );
  return (
    <Form.Item name={[namePrefix, field.key]} label={field.label}>
      {control}
    </Form.Item>
  );
}

function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        display: "block",
        marginBottom: 12,
        color: color,
        opacity: color ? 1 : 0.45,
      }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Step content
// ---------------------------------------------------------------------------

function StepContent({ stepType, onSkipStep }: { stepType: CalibrationStepType; onSkipStep?: () => void }) {
  const config = STEP_CONFIGS[stepType];
  const copy = WIZARD_COPY[stepType];
  const { token } = theme.useToken();
  const form = Form.useFormInstance();

  // Flow rate: interactive guided calculator state (only used for flow_rate step)
  type FlowCalcMethod = "yolo" | "legacy";
  type FlowCalcPhase = "idle" | "pass1" | "pass2";
  const [flowCalcMethod, setFlowCalcMethod] = useState<FlowCalcMethod>("yolo");
  const [flowCalcPhase, setFlowCalcPhase] = useState<FlowCalcPhase>("idle");
  // YOLO method: flowRatioNew = flowRatioOld + modifier  (OrcaSlicer ≥ 2.3.0)
  const [yoloFlowRatioOld, setYoloFlowRatioOld] = useState<number | null>(1.0);
  const [yoloModifier, setYoloModifier] = useState<number | null>(null);
  // Legacy method per pass: result = flowRatio * (100 + modifier) / 100
  const [pass1FlowRatio, setPass1FlowRatio] = useState<number | null>(1.0);
  const [pass1Modifier, setPass1Modifier] = useState<number | null>(null);
  const [pass2FlowRatio, setPass2FlowRatio] = useState<number | null>(null);
  const [pass2Modifier, setPass2Modifier] = useState<number | null>(null);

  // VFA: artifact speeds table (only used for vfa step)
  const [artifactSpeeds, setArtifactSpeeds] = useState<number[]>([]);
  const [newArtifactSpeed, setNewArtifactSpeed] = useState<number | null>(null);

  // PA: method selector (only used for pressure_advance step)
  const [paMethod, setPaMethod] = useState<"tower" | "pattern">("tower");

  // Reset all calculator state to idle
  const resetFlowCalcState = () => {
    setFlowCalcPhase("idle");
    setYoloFlowRatioOld(1.0);
    setYoloModifier(null);
    setPass1FlowRatio(1.0);
    setPass1Modifier(null);
    setPass2FlowRatio(null);
    setPass2Modifier(null);
  };

  // Reset everything (including method) when navigating to a different step
  useEffect(() => {
    setFlowCalcMethod("yolo");
    resetFlowCalcState();
    setArtifactSpeeds([]);
    setNewArtifactSpeed(null);
    setPaMethod("tower");
  }, [stepType]);

  const handleFlowMethodChange = (val: string | number) => {
    setFlowCalcMethod(val as FlowCalcMethod);
    resetFlowCalcState();
  };

  // Computed results
  const yoloResult =
    yoloFlowRatioOld !== null && yoloModifier !== null && !isNaN(yoloFlowRatioOld) && !isNaN(yoloModifier)
      ? parseFloat((yoloFlowRatioOld + yoloModifier).toFixed(5))
      : null;
  const pass1Result =
    pass1FlowRatio !== null && pass1Modifier !== null && !isNaN(pass1FlowRatio) && !isNaN(pass1Modifier)
      ? parseFloat(((pass1FlowRatio * (100 + pass1Modifier)) / 100).toFixed(5))
      : null;
  const pass2Result =
    pass2FlowRatio !== null && pass2Modifier !== null && !isNaN(pass2FlowRatio) && !isNaN(pass2Modifier)
      ? parseFloat(((pass2FlowRatio * (100 + pass2Modifier)) / 100).toFixed(5))
      : null;

  const applyFlowCalc = () => {
    const finalRatio = flowCalcMethod === "yolo" ? yoloResult : (pass2Result ?? pass1Result);
    if (finalRatio !== null) {
      const current = form.getFieldValue("result") ?? {};
      form.setFieldValue("result", { ...current, flow_ratio: finalRatio });
    }
    resetFlowCalcState();
  };

  const handlePaMethodChange = (val: string | number) => {
    setPaMethod(val as "tower" | "pattern");
    form.setFieldValue("result", {});
  };

  // Auto-compute outputs from inputs whenever inputs change
  const inputValues = Form.useWatch("inputs", form) as Record<string, number | null> | undefined;
  useEffect(() => {
    if (!config.autoCompute || !inputValues) return;
    if (stepType === "pressure_advance" && paMethod === "pattern") return;
    const computed = config.autoCompute(inputValues);
    if (Object.keys(computed).length > 0) {
      const current: Record<string, unknown> = form.getFieldValue("result") ?? {};
      form.setFieldValue("result", { ...current, ...computed });
    }
  }, [inputValues, paMethod]);

  // VFA: auto-compute min/max avoidance speed from artifact speeds list
  useEffect(() => {
    if (stepType !== "vfa") return;
    const current: Record<string, unknown> = form.getFieldValue("result") ?? {};
    if (artifactSpeeds.length === 0) {
      form.setFieldValue("result", { ...current, min_avoidance_speed: null, max_avoidance_speed: null });
    } else {
      const min = Math.min(...artifactSpeeds);
      const max = Math.max(...artifactSpeeds);
      form.setFieldValue("result", { ...current, min_avoidance_speed: min, max_avoidance_speed: max });
    }
  }, [artifactSpeeds]);

  const addArtifactSpeed = () => {
    if (newArtifactSpeed === null || isNaN(newArtifactSpeed)) return;
    setArtifactSpeeds((prev) => [...prev, newArtifactSpeed].sort((a, b) => a - b));
    setNewArtifactSpeed(null);
  };

  const removeArtifactSpeed = (idx: number) => {
    setArtifactSpeeds((prev) => prev.filter((_, i) => i !== idx));
  };

  // Show first sentence inline; full description via tooltip
  const dotIdx = copy.description.indexOf(". ");
  const shortDesc = dotIdx > 0 ? copy.description.slice(0, dotIdx + 1) : copy.description;
  const hasMore = copy.description.length > shortDesc.length;

  return (
    <>
      {/* Step header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Title level={4} style={{ margin: 0 }}>
            {copy.title}
          </Title>
          {hasMore && (
            <Tooltip title={copy.description} overlayStyle={{ maxWidth: 440 }}>
              <InfoCircleOutlined style={{ color: token.colorTextTertiary, fontSize: 15, cursor: "help" }} />
            </Tooltip>
          )}
          <Tooltip title="Open OrcaSlicer wiki for this step">
            <a
              href={copy.wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: token.colorTextTertiary,
                textDecoration: "none",
                padding: "2px 6px",
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorBorderSecondary}`,
                lineHeight: 1.5,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = token.colorPrimary;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = token.colorPrimary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = token.colorTextTertiary;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = token.colorBorderSecondary;
              }}
            >
              <BookOutlined style={{ fontSize: 12 }} />
              Wiki
            </a>
          </Tooltip>
        </div>
        <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {shortDesc}
        </Text>
      </div>

      {/* Flow Rate: interactive guided pass result calculator — shown above inputs */}
      {stepType === "flow_rate" && (
        <div
          style={{
            marginBottom: 20,
            borderRadius: token.borderRadiusLG,
            border: `1px solid ${flowCalcPhase === "idle" ? token.colorBorderSecondary : token.colorPrimaryBorder}`,
            overflow: "hidden",
            transition: "border-color 0.25s",
          }}
        >
          {/* Header bar with phase progress */}
          <div
            style={{
              padding: "8px 16px",
              background: flowCalcPhase === "idle" ? token.colorFillAlter : token.colorPrimaryBg,
              borderBottom: `1px solid ${flowCalcPhase === "idle" ? token.colorBorderSecondary : token.colorPrimaryBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "background 0.25s, border-color 0.25s",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: flowCalcPhase !== "idle" ? token.colorPrimary : undefined,
                opacity: flowCalcPhase === "idle" ? 0.45 : 1,
                transition: "color 0.2s",
              }}
            >
              Pass Result Calculator
            </Text>
            {/* Progress indicator — visible during active phases only */}
            {flowCalcPhase !== "idle" &&
              (flowCalcMethod === "yolo" ? (
                /* YOLO: single-pass badge */
                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                  YOLO
                </Tag>
              ) : (
                /* Legacy: two-node pass progress */
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Pass 1 node */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: flowCalcPhase === "pass1" ? token.colorPrimary : token.colorSuccessBg,
                        border: flowCalcPhase !== "pass1" ? `1px solid ${token.colorSuccessBorder}` : "none",
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      {flowCalcPhase === "pass1" ? (
                        <span style={{ color: token.colorWhite }}>1</span>
                      ) : (
                        <CheckOutlined style={{ color: token.colorSuccess, fontSize: 9 }} />
                      )}
                    </div>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: flowCalcPhase === "pass1" ? 500 : 400,
                        color: flowCalcPhase === "pass1" ? token.colorPrimaryText : token.colorTextSecondary,
                      }}
                    >
                      Pass 1
                    </Text>
                    {flowCalcPhase === "pass2" && pass1Result !== null && (
                      <Tag style={{ margin: 0, fontSize: 11, lineHeight: "18px" }}>{pass1Result}</Tag>
                    )}
                  </div>
                  {/* Connector line */}
                  <div style={{ width: 20, height: 1, background: token.colorBorderSecondary, flexShrink: 0 }} />
                  {/* Pass 2 node */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: flowCalcPhase === "pass2" ? token.colorPrimary : token.colorFillSecondary,
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ color: flowCalcPhase === "pass2" ? token.colorWhite : token.colorTextTertiary }}>
                        2
                      </span>
                    </div>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: flowCalcPhase === "pass2" ? 500 : 400,
                        color: flowCalcPhase === "pass2" ? token.colorPrimaryText : token.colorTextTertiary,
                      }}
                    >
                      Pass 2
                    </Text>
                  </div>
                </div>
              ))}
          </div>

          {/* Calculator body */}
          <div style={{ padding: "14px 16px" }}>
            {/* Idle phase */}
            {flowCalcPhase === "idle" && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Segmented
                    options={[
                      { label: "YOLO (Recommended)", value: "yolo" },
                      { label: "Legacy (2-Pass)", value: "legacy" },
                    ]}
                    value={flowCalcMethod}
                    onChange={handleFlowMethodChange}
                    size="small"
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55, flex: 1 }}>
                    {flowCalcMethod === "yolo"
                      ? "Single-pass calibration using the Archimedean Chords pattern (OrcaSlicer ≥ 2.3.0). Enter your current flow ratio and the correction value observed on the print."
                      : "Two-pass calibration. Step through your first and second pass results to calculate your final flow ratio."}
                  </Text>
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    onClick={() => setFlowCalcPhase("pass1")}
                    style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    Start →
                  </Button>
                </div>
              </div>
            )}

            {/* Pass 1 phase — YOLO (single-pass, additive) */}
            {flowCalcPhase === "pass1" && flowCalcMethod === "yolo" && (
              <div>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}>
                  Print the Archimedean Chords test model. Enter your current flow ratio and the correction value shown
                  on the print. The new flow ratio is calculated automatically.
                </Text>
                <Row gutter={[10, 0]} align="bottom">
                  <Col span={8}>
                    <Form.Item label="Current Flow Ratio" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={yoloFlowRatioOld}
                        onChange={(v) => setYoloFlowRatioOld(v)}
                        min={0.1}
                        max={2}
                        step={0.001}
                        precision={5}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Modifier" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={yoloModifier}
                        onChange={(v) => setYoloModifier(v)}
                        min={-1}
                        max={1}
                        step={0.001}
                        precision={5}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label={
                        <span style={{ color: yoloResult !== null ? token.colorPrimary : undefined, fontWeight: 500 }}>
                          New Flow Ratio
                        </span>
                      }
                      style={{ marginBottom: 8 }}
                    >
                      <InputNumber value={yoloResult ?? undefined} disabled precision={5} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => {
                      setFlowCalcPhase("idle");
                      setYoloFlowRatioOld(1.0);
                      setYoloModifier(null);
                    }}
                    style={{ color: token.colorTextTertiary }}
                  >
                    Cancel
                  </Button>
                  <Button size="small" type="primary" disabled={yoloResult === null} onClick={applyFlowCalc}>
                    Apply to Form ✓
                  </Button>
                </div>
              </div>
            )}

            {/* Pass 1 phase — Legacy (two-pass, percentage modifier) */}
            {flowCalcPhase === "pass1" && flowCalcMethod === "legacy" && (
              <div>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}>
                  Print your first pass test model. Enter your starting flow ratio and the correction percentage
                  observed on the print.
                </Text>
                <Row gutter={[10, 0]} align="bottom">
                  <Col span={8}>
                    <Form.Item label="Flow Ratio" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={pass1FlowRatio}
                        onChange={(v) => setPass1FlowRatio(v)}
                        min={0.1}
                        max={2}
                        step={0.00001}
                        precision={5}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Modifier" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={pass1Modifier}
                        onChange={(v) => setPass1Modifier(v)}
                        min={-50}
                        max={50}
                        step={0.1}
                        precision={1}
                        addonAfter="%"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label={
                        <span style={{ color: pass1Result !== null ? token.colorPrimary : undefined, fontWeight: 500 }}>
                          Result
                        </span>
                      }
                      style={{ marginBottom: 8 }}
                    >
                      <InputNumber value={pass1Result ?? undefined} disabled precision={5} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => {
                      setFlowCalcPhase("idle");
                      setPass1FlowRatio(1.0);
                      setPass1Modifier(null);
                    }}
                    style={{ color: token.colorTextTertiary }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={pass1Result === null}
                    onClick={() => {
                      setPass2FlowRatio(pass1Result);
                      setFlowCalcPhase("pass2");
                    }}
                  >
                    Next: Pass 2 →
                  </Button>
                </div>
              </div>
            )}

            {/* Pass 2 phase */}
            {flowCalcPhase === "pass2" && (
              <div>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}>
                  Set your slicer flow ratio to the Pass 1 result, reprint the test model, then enter the new correction
                  percentage.
                </Text>
                <Row gutter={[10, 0]} align="bottom">
                  <Col span={8}>
                    <Form.Item label="Flow Ratio" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={pass2FlowRatio}
                        onChange={(v) => setPass2FlowRatio(v)}
                        min={0.1}
                        max={2}
                        step={0.00001}
                        precision={5}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Modifier" style={{ marginBottom: 8 }}>
                      <InputNumber
                        value={pass2Modifier}
                        onChange={(v) => setPass2Modifier(v)}
                        min={-50}
                        max={50}
                        step={0.1}
                        precision={1}
                        addonAfter="%"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label={
                        <span style={{ color: pass2Result !== null ? token.colorPrimary : undefined, fontWeight: 500 }}>
                          Result
                        </span>
                      }
                      style={{ marginBottom: 8 }}
                    >
                      <InputNumber value={pass2Result ?? undefined} disabled precision={5} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setFlowCalcPhase("pass1");
                      setPass2Modifier(null);
                    }}
                  >
                    ← Back
                  </Button>
                  <Button size="small" type="primary" disabled={pass2Result === null} onClick={applyFlowCalc}>
                    Apply to Form ✓
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Shaping: built-in IS advisory */}
      {stepType === "input_shaping" && (
        <Alert
          type="info"
          showIcon
          icon={<ThunderboltOutlined />}
          style={{ marginBottom: 20 }}
          message={<strong>Got a modern printer? You might not need this.</strong>}
          description={
            <div>
              <span style={{ fontSize: 13, lineHeight: 1.55 }}>
                Most modern CoreXY printers running Klipper with an accelerometer (ADXL345) or any Bambu Lab printer
                already handle input shaping automatically — and way more accurately than a manual test tower ever
                could. If this applies to you, skip this step and save yourself the hassle.
              </span>
              {onSkipStep && (
                <div style={{ marginTop: 10 }}>
                  <Button size="small" onClick={onSkipStep}>
                    My printer handles this — skip it →
                  </Button>
                </div>
              )}
            </div>
          }
        />
      )}

      {/* Pressure Advance: method selector */}
      {stepType === "pressure_advance" && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Test Method</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <Segmented
              options={[
                { label: "Tower (Recommended)", value: "tower" },
                { label: "Pattern / Line", value: "pattern" },
              ]}
              value={paMethod}
              onChange={handlePaMethodChange}
              size="small"
              style={{ flexShrink: 0 }}
            />
            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {paMethod === "tower"
                ? "Print the PA tower test. Enter your extruder type, the PA step value (A), and the measured height (B) at the best-looking layer. PA is auto-calculated as A × B."
                : "Print the PA pattern or line test. Identify the optimal line and enter its PA value directly below."}
            </Text>
          </div>
        </div>
      )}

      {/* Test Setup */}
      {config.inputFields.length > 0 && !(stepType === "pressure_advance" && paMethod === "pattern") && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Test Setup</SectionLabel>
          <Row gutter={[16, 0]}>
            {config.inputFields.map((f) => (
              <Col key={f.key} span={f.colSpan ?? (f.type === "select" ? 24 : 12)}>
                <FieldItem field={f} namePrefix="inputs" />
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* VFA: Artifact speeds table */}
      {stepType === "vfa" && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Artifact Speeds</SectionLabel>
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.5, display: "block", marginBottom: 12 }}>
            Print the VFA test tower and mark each speed where you observe VFA artifacts. Min and Max Avoidance Speed
            are auto-computed from this list.
          </Text>
          {artifactSpeeds.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {artifactSpeeds.map((speed, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 10px",
                    marginBottom: 4,
                    background: token.colorFillAlter,
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <Text>{speed} mm/s</Text>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeArtifactSpeed(idx)}
                  />
                </div>
              ))}
            </div>
          )}
          <Row gutter={[8, 0]} align="middle">
            <Col flex="auto">
              <InputNumber
                value={newArtifactSpeed}
                onChange={(v) => setNewArtifactSpeed(v)}
                min={0}
                precision={0}
                addonAfter="mm/s"
                placeholder="Speed"
                style={{ width: "100%" }}
                onPressEnter={addArtifactSpeed}
              />
            </Col>
            <Col flex="none">
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={addArtifactSpeed}
                disabled={newArtifactSpeed === null}
              >
                Add Speed
              </Button>
            </Col>
          </Row>
        </div>
      )}

      {/* Your Result — saves to both outputs and selected_values */}
      <div
        style={{
          background: token.colorPrimaryBg,
          border: `1px solid ${token.colorPrimaryBorder}`,
          borderRadius: token.borderRadiusLG,
          padding: "16px 16px 4px",
          marginBottom: 20,
        }}
      >
        <SectionLabel color={token.colorPrimary}>
          Your Result
          {((config.autoCompute && !(stepType === "pressure_advance" && paMethod === "pattern")) ||
            stepType === "vfa") && (
            <span
              style={{
                fontWeight: 400,
                fontStyle: "italic",
                letterSpacing: 0,
                textTransform: "none",
                marginLeft: 6,
                opacity: 0.75,
              }}
            >
              · auto-computed
            </span>
          )}
        </SectionLabel>
        <Row gutter={[16, 0]}>
          {config.outputFields.map((f) => (
            <Col key={f.key} span={f.colSpan ?? (config.outputFields.length > 1 && f.type !== "select" ? 12 : 24)}>
              <FieldItem field={f} namePrefix="result" />
            </Col>
          ))}
        </Row>
      </div>

      {/* Confidence + Notes */}
      <Row gutter={[16, 0]}>
        <Col span={8}>
          <Form.Item name="confidence" label="Confidence">
            <Select
              options={[
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
              allowClear
              placeholder="Optional"
            />
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} maxLength={1024} placeholder="Optional notes…" />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  session: ICalibrationSession;
  onClose: () => void;
  onComplete: () => void;
}

export const CalibrationWizard = ({ open, session, onClose, onComplete }: Props) => {
  const t = useTranslate();
  const [form] = useForm();
  const { token } = theme.useToken();

  const { mutate: createStep, mutation: createMutation } = useCreate<ICalibrationStepResult>();
  const { mutate: updateSession, mutation: updateMutation } = useUpdate<ICalibrationSession>();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const [currentIdx, setCurrentIdx] = useState(0);
  const currentIdxRef = useRef(0);
  const setStep = (idx: number) => {
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
  };

  const doneTypes = useRef(new Set(session.steps.map((s) => s.step_type as CalibrationStepType)));
  const savedValues = useRef<Partial<Record<CalibrationStepType, Record<string, unknown>>>>({});

  // ---- Init / reset on open ---------------------------------------------

  useEffect(() => {
    if (!open) return;

    doneTypes.current = new Set(session.steps.map((s) => s.step_type as CalibrationStepType));
    savedValues.current = {};
    for (const step of session.steps) {
      savedValues.current[step.step_type as CalibrationStepType] = {
        inputs: step.inputs ?? {},
        result: step.selected_values ?? step.outputs ?? {},
        notes: step.notes,
        confidence: step.confidence,
      };
    }

    const firstPending = WIZARD_STEP_ORDER.findIndex((st) => !doneTypes.current.has(st));
    const startIdx = firstPending >= 0 ? firstPending : 0;

    form.resetFields();
    const startType = WIZARD_STEP_ORDER[startIdx];
    if (savedValues.current[startType]) {
      form.setFieldsValue(savedValues.current[startType]);
    }
    setStep(startIdx);
  }, [open]);

  // ---- Navigation -------------------------------------------------------

  const navigateTo = (newIdx: number) => {
    const stepType = WIZARD_STEP_ORDER[currentIdxRef.current];
    savedValues.current[stepType] = form.getFieldsValue(true);
    form.resetFields();
    const nextType = WIZARD_STEP_ORDER[newIdx];
    if (savedValues.current[nextType]) {
      form.setFieldsValue(savedValues.current[nextType]);
    }
    setStep(newIdx);
  };

  const currentStepType = WIZARD_STEP_ORDER[currentIdx];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === WIZARD_STEP_ORDER.length - 1;
  const isCurrentDone = doneTypes.current.has(currentStepType);

  // ---- Save + complete --------------------------------------------------

  const saveCurrentStep = (onDone: () => void) => {
    const values = form.getFieldsValue(true);
    const result = values.result ?? null;
    createStep(
      {
        resource: `calibration/session/${session.id}/step`,
        values: {
          step_type: currentStepType,
          inputs: values.inputs ?? null,
          outputs: result,
          selected_values: result,
          notes: values.notes ?? null,
          confidence: values.confidence ?? null,
        },
        successNotification: false,
      },
      {
        onSuccess: () => {
          doneTypes.current.add(currentStepType);
          onDone();
        },
      },
    );
  };

  const markComplete = () => {
    updateSession(
      { resource: "calibration/session", id: session.id, values: { status: "complete" }, successNotification: false },
      { onSuccess: onComplete },
    );
  };

  // ---- Button handlers --------------------------------------------------

  const handleSkip = () => {
    if (isLast) {
      Modal.confirm({
        title: t("calibration.wizard.skip_finish_confirm"),
        okText: t("calibration.wizard.buttons.finish"),
        cancelText: t("calibration.wizard.buttons.cancel"),
        onOk: markComplete,
      });
    } else {
      navigateTo(currentIdx + 1);
    }
  };

  const handleSaveAndContinue = () => {
    if (isLast) {
      saveCurrentStep(markComplete);
    } else {
      saveCurrentStep(() => navigateTo(currentIdx + 1));
    }
  };

  const handleSaveAsSkipped = () => {
    // Sentinel convention: outputs: { _skipped: true } marks a step the user deliberately skipped
    // (e.g. Input Shaping on a printer with built-in IS). CalibrationSection reads this to show
    // a "Skipped" tag instead of "Done" / "Incomplete".
    createStep(
      {
        resource: `calibration/session/${session.id}/step`,
        values: {
          step_type: currentStepType,
          inputs: null,
          outputs: { _skipped: true },
          selected_values: null,
          notes: null,
          confidence: null,
        },
        successNotification: false,
      },
      {
        onSuccess: () => {
          doneTypes.current.add(currentStepType);
          if (isLast) markComplete();
          else navigateTo(currentIdx + 1);
        },
      },
    );
  };

  // ---- Render -----------------------------------------------------------

  return (
    <Modal
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingRight: 36,
          }}
        >
          <span>{t("calibration.wizard.title")}</span>
          <Space size={8}>
            {isCurrentDone && (
              <Tag color="blue" style={{ margin: 0 }}>
                Revisiting
              </Tag>
            )}
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
              {currentIdx + 1} / {WIZARD_STEP_ORDER.length}
            </Text>
          </Space>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={880}
      centered
      styles={{
        content: { display: "flex", flexDirection: "column", maxHeight: "90vh" },
        body: { padding: 0, flex: 1, minHeight: 0, overflow: "hidden" },
      }}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button
            type="text"
            icon={<PauseCircleOutlined />}
            onClick={onClose}
            style={{ color: token.colorTextSecondary }}
          >
            {t("calibration.wizard.buttons.cancel")}
          </Button>
          <Space>
            <Button disabled={isFirst || isLoading} onClick={() => navigateTo(currentIdx - 1)}>
              {t("calibration.wizard.buttons.back")}
            </Button>
            <Button disabled={isLoading} onClick={handleSkip}>
              {isLast ? t("calibration.wizard.buttons.skip_finish") : t("calibration.wizard.buttons.skip")}
            </Button>
            <Button type="primary" loading={isLoading} onClick={handleSaveAndContinue}>
              {isLast ? t("calibration.wizard.buttons.save_finish") : t("calibration.wizard.buttons.save_continue")}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: "flex", flex: 1, minHeight: 440, overflow: "hidden" }}>
        {/* Sidebar — custom fixed-height nav to prevent reflow on wrap */}
        <div
          style={{
            width: 190,
            flexShrink: 0,
            padding: "12px 8px",
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgLayout,
            overflowY: "auto",
          }}
        >
          {WIZARD_STEP_ORDER.map((stepType, idx) => {
            const isCurrent = idx === currentIdx;
            const isDone = doneTypes.current.has(stepType);
            return (
              <div
                key={stepType}
                onClick={() => navigateTo(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 36,
                  padding: "0 8px",
                  borderRadius: token.borderRadius,
                  cursor: "pointer",
                  userSelect: "none",
                  background: isCurrent ? token.colorPrimaryBg : "transparent",
                  transition: "background 0.15s",
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = token.colorFillAlter;
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {/* Step indicator circle */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                    background: isCurrent
                      ? token.colorPrimary
                      : isDone
                        ? token.colorSuccessBg
                        : token.colorFillSecondary,
                    color: isCurrent ? token.colorWhite : isDone ? token.colorSuccess : token.colorTextTertiary,
                    border: isDone && !isCurrent ? `1px solid ${token.colorSuccessBorder}` : "none",
                  }}
                >
                  {isDone && !isCurrent ? <CheckOutlined style={{ fontSize: 10 }} /> : idx + 1}
                </div>
                {/* Step title — nowrap + ellipsis prevents reflow */}
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isCurrent ? token.colorPrimaryText : isDone ? token.colorTextSecondary : token.colorText,
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {WIZARD_COPY[stepType].title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content panel */}
        <div
          style={{
            flex: 1,
            padding: "24px 28px 16px",
            overflowY: "auto",
          }}
        >
          <Form form={form} layout="vertical">
            <StepContent stepType={currentStepType} onSkipStep={handleSaveAsSkipped} />
          </Form>
        </div>
      </div>
    </Modal>
  );
};

export default CalibrationWizard;
