import { BookOutlined, CheckOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useCreate, useTranslate, useUpdate } from "@refinedev/core";
import {
  Alert,
  Button,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
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
import { type ReactNode, useEffect, useState } from "react";
import { CalibrationStepType, ICalibrationStepResult } from "./model";
import { STEP_CONFIGS, StepField } from "./stepConfig";
import { WIZARD_COPY } from "./wizardCopy";

const { Text } = Typography;

const STEP_TYPE_OPTIONS: { value: CalibrationStepType; label: string }[] = [
  { value: "temperature", label: "Temperature" },
  { value: "volumetric_speed", label: "Volumetric Speed" },
  { value: "pressure_advance", label: "Pressure Advance" },
  { value: "flow_rate", label: "Flow Rate" },
  { value: "retraction", label: "Retraction" },
  { value: "tolerance", label: "Tolerance" },
  { value: "cornering", label: "Cornering" },
  { value: "input_shaping", label: "Input Shaping" },
  { value: "vfa", label: "VFA" },
];

const CONFIDENCE_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// ---------------------------------------------------------------------------
// Shared sub-components (mirrors CalibrationWizard)
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
// Drawer
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  sessionId: number;
  step?: ICalibrationStepResult;
  onSuccess: () => void;
  onClose: () => void;
}

export const StepResultDrawer = ({ open, sessionId, step, onSuccess, onClose }: Props) => {
  const t = useTranslate();
  const [form] = useForm();
  const { token } = theme.useToken();
  const isEditing = step !== undefined;

  const { mutate: createStep, mutation: createMutation } = useCreate<ICalibrationStepResult>();
  const { mutate: updateStep, mutation: updateMutation } = useUpdate<ICalibrationStepResult>();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const stepType: CalibrationStepType | undefined = Form.useWatch("step_type", form);
  const config = stepType ? STEP_CONFIGS[stepType] : null;
  const copy = stepType ? WIZARD_COPY[stepType] : null;

  // ---- Flow rate calculator state (mirrors CalibrationWizard) ----
  type FlowCalcMethod = "yolo" | "legacy";
  type FlowCalcPhase = "idle" | "pass1" | "pass2";
  const [flowCalcMethod, setFlowCalcMethod] = useState<FlowCalcMethod>("yolo");
  const [flowCalcPhase, setFlowCalcPhase] = useState<FlowCalcPhase>("idle");
  const [yoloFlowRatioOld, setYoloFlowRatioOld] = useState<number | null>(1.0);
  const [yoloModifier, setYoloModifier] = useState<number | null>(null);
  const [pass1FlowRatio, setPass1FlowRatio] = useState<number | null>(1.0);
  const [pass1Modifier, setPass1Modifier] = useState<number | null>(null);
  const [pass2FlowRatio, setPass2FlowRatio] = useState<number | null>(null);
  const [pass2Modifier, setPass2Modifier] = useState<number | null>(null);

  // ---- VFA artifact speeds state (mirrors CalibrationWizard) ----
  const [artifactSpeeds, setArtifactSpeeds] = useState<number[]>([]);
  const [newArtifactSpeed, setNewArtifactSpeed] = useState<number | null>(null);

  // ---- PA method selector (mirrors CalibrationWizard) ----
  const [paMethod, setPaMethod] = useState<"tower" | "pattern">("tower");

  const resetFlowCalcState = () => {
    setFlowCalcPhase("idle");
    setYoloFlowRatioOld(1.0);
    setYoloModifier(null);
    setPass1FlowRatio(1.0);
    setPass1Modifier(null);
    setPass2FlowRatio(null);
    setPass2Modifier(null);
  };

  const handleFlowMethodChange = (val: string | number) => {
    setFlowCalcMethod(val as FlowCalcMethod);
    resetFlowCalcState();
  };

  // Reset all calculator/special UI state when step type changes
  useEffect(() => {
    setFlowCalcMethod("yolo");
    resetFlowCalcState();
    setArtifactSpeeds([]);
    setNewArtifactSpeed(null);
    setPaMethod("tower");
  }, [stepType]);

  const handlePaMethodChange = (val: string | number) => {
    setPaMethod(val as "tower" | "pattern");
    form.setFieldValue("result", {});
  };

  // Init / reset when drawer opens
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFlowCalcMethod("yolo");
    resetFlowCalcState();
    setArtifactSpeeds([]);
    setNewArtifactSpeed(null);
    if (step) {
      form.setFieldsValue({
        step_type: step.step_type,
        inputs: step.inputs ?? {},
        result: step.selected_values ?? step.outputs ?? {},
        notes: step.notes,
        confidence: step.confidence,
      });
      // Infer PA method from saved inputs: tower has pa_step_a / measured_height_b
      if (step.step_type === "pressure_advance") {
        const hasTowerInputs =
          step.inputs != null && (step.inputs.pa_step_a !== undefined || step.inputs.measured_height_b !== undefined);
        setPaMethod(hasTowerInputs ? "tower" : "pattern");
      } else {
        setPaMethod("tower");
      }
    } else {
      setPaMethod("tower");
    }
  }, [open, step]);

  // Auto-compute result fields from inputs
  const inputValues = Form.useWatch("inputs", form) as Record<string, number | null> | undefined;
  useEffect(() => {
    if (!config?.autoCompute || !inputValues) return;
    if (stepType === "pressure_advance" && paMethod === "pattern") return;
    const computed = config.autoCompute(inputValues);
    if (Object.keys(computed).length > 0) {
      const current: Record<string, unknown> = form.getFieldValue("result") ?? {};
      form.setFieldValue("result", { ...current, ...computed });
    }
  }, [inputValues, paMethod]);

  // VFA: auto-compute avoidance speed range from artifact speeds list
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

  // Computed flow results
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

  const addArtifactSpeed = () => {
    if (newArtifactSpeed === null || isNaN(newArtifactSpeed)) return;
    setArtifactSpeeds((prev) => [...prev, newArtifactSpeed].sort((a, b) => a - b));
    setNewArtifactSpeed(null);
  };

  const removeArtifactSpeed = (idx: number) => {
    setArtifactSpeeds((prev) => prev.filter((_, i) => i !== idx));
  };

  const onFinish = (values: Record<string, unknown>) => {
    const payload = {
      step_type: values.step_type,
      inputs: values.inputs ?? null,
      outputs: values.result ?? null,
      selected_values: values.result ?? null,
      notes: values.notes ?? null,
      confidence: values.confidence ?? null,
    };
    if (!isEditing) {
      createStep(
        { resource: `calibration/session/${sessionId}/step`, values: payload, successNotification: false },
        {
          onSuccess: () => {
            onSuccess();
            onClose();
          },
        },
      );
    } else {
      updateStep(
        { resource: "calibration/step", id: step.id, values: payload, successNotification: false },
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
    <Drawer
      title={isEditing ? t("calibration.step_form.edit_title") : t("calibration.step_form.add_title")}
      open={open}
      onClose={onClose}
      width={520}
      extra={
        <Button type="primary" onClick={form.submit} loading={isLoading}>
          {t("calibration.buttons.save")}
        </Button>
      }
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        {/* Step type selector */}
        <Form.Item
          name="step_type"
          label={t("calibration.fields.step_type")}
          rules={[{ required: true, message: "Please select a calibration step." }]}
        >
          <Select options={STEP_TYPE_OPTIONS} disabled={isEditing} placeholder="Select a calibration step" />
        </Form.Item>

        {config && copy && (
          <>
            {/* Step description + wiki link */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <Text type="secondary" style={{ fontSize: 13, flex: 1, lineHeight: 1.5 }}>
                {copy.description.split(". ")[0] + "."}
              </Text>
              {copy.wikiUrl && (
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
                      flexShrink: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    <BookOutlined style={{ fontSize: 12 }} />
                    Wiki
                  </a>
                </Tooltip>
              )}
            </div>

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
                      Most modern CoreXY printers running Klipper with an accelerometer (ADXL345) or any Bambu Lab
                      printer already handle input shaping automatically — and way more accurately than a manual test
                      tower ever could. If this applies to you, just close this drawer without saving.
                    </span>
                  </div>
                }
              />
            )}

            {/* Flow Rate: pass result calculator */}
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
                {/* Header */}
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
                  {flowCalcPhase !== "idle" &&
                    (flowCalcMethod === "yolo" ? (
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                        YOLO
                      </Tag>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                        <div style={{ width: 20, height: 1, background: token.colorBorderSecondary, flexShrink: 0 }} />
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
                            <span
                              style={{ color: flowCalcPhase === "pass2" ? token.colorWhite : token.colorTextTertiary }}
                            >
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

                {/* Body */}
                <div style={{ padding: "14px 16px" }}>
                  {/* Idle */}
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
                      <div
                        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}
                      >
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

                  {/* YOLO pass 1 */}
                  {flowCalcPhase === "pass1" && flowCalcMethod === "yolo" && (
                    <div>
                      <Text
                        type="secondary"
                        style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}
                      >
                        Print the Archimedean Chords test model. Enter your current flow ratio and the correction value
                        shown on the print.
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
                              <span
                                style={{ color: yoloResult !== null ? token.colorPrimary : undefined, fontWeight: 500 }}
                              >
                                New Flow Ratio
                              </span>
                            }
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber
                              value={yoloResult ?? undefined}
                              disabled
                              precision={5}
                              style={{ width: "100%" }}
                            />
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

                  {/* Legacy pass 1 */}
                  {flowCalcPhase === "pass1" && flowCalcMethod === "legacy" && (
                    <div>
                      <Text
                        type="secondary"
                        style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}
                      >
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
                              <span
                                style={{
                                  color: pass1Result !== null ? token.colorPrimary : undefined,
                                  fontWeight: 500,
                                }}
                              >
                                Result
                              </span>
                            }
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber
                              value={pass1Result ?? undefined}
                              disabled
                              precision={5}
                              style={{ width: "100%" }}
                            />
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

                  {/* Legacy pass 2 */}
                  {flowCalcPhase === "pass2" && (
                    <div>
                      <Text
                        type="secondary"
                        style={{ fontSize: 13, lineHeight: 1.55, display: "block", marginBottom: 14 }}
                      >
                        Set your slicer flow ratio to the Pass 1 result, reprint the test model, then enter the new
                        correction percentage.
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
                              <span
                                style={{
                                  color: pass2Result !== null ? token.colorPrimary : undefined,
                                  fontWeight: 500,
                                }}
                              >
                                Result
                              </span>
                            }
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber
                              value={pass2Result ?? undefined}
                              disabled
                              precision={5}
                              style={{ width: "100%" }}
                            />
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
                  Print the VFA test tower and mark each speed where you observe VFA artifacts. Min and Max Avoidance
                  Speed are auto-computed from this list.
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

            {/* Your Result */}
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
                  <Col
                    key={f.key}
                    span={f.colSpan ?? (config.outputFields.length > 1 && f.type !== "select" ? 12 : 24)}
                  >
                    <FieldItem field={f} namePrefix="result" />
                  </Col>
                ))}
              </Row>
            </div>

            <Divider style={{ margin: "4px 0 20px" }} />
          </>
        )}

        <Space direction="vertical" style={{ width: "100%" }} size={0}>
          <Form.Item name="confidence" label={t("calibration.fields.confidence")}>
            <Select options={CONFIDENCE_OPTIONS} allowClear placeholder="Optional" />
          </Form.Item>
          <Form.Item name="notes" label={t("calibration.fields.notes")}>
            <Input.TextArea rows={3} maxLength={1024} />
          </Form.Item>
        </Space>
      </Form>
    </Drawer>
  );
};

export default StepResultDrawer;
