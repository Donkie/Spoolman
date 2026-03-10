import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Col, Divider, Flex, List, Modal, Row, Space, Table, Tooltip, Typography, theme } from "antd";
import { Content } from "antd/es/layout/layout";
import { ColumnsType } from "antd/es/table";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect, useMemo, useState } from "react";
import { Trans } from "react-i18next";
import { Link, useLocation } from "react-router";
import { FORMULA_HELPER_GROUPS } from "../../utils/formulaFields";

dayjs.extend(utc);

const { useToken } = theme;
const { Paragraph, Text } = Typography;

type BuiltInEntity = "spool" | "filament" | "vendor";

type BuiltInFieldDefinition = {
  key: string;
  type: "text" | "integer" | "integer_range" | "float" | "float_range" | "datetime" | "boolean" | "choice";
  intent: string;
};

const BUILT_IN_FIELD_DEFINITIONS: Record<BuiltInEntity, BuiltInFieldDefinition[]> = {
  spool: [
    { key: "id", type: "integer", intent: "Stable system identifier for this spool record." },
    { key: "registered", type: "datetime", intent: "UTC timestamp for when the spool was first created in Spoolman." },
    { key: "first_used", type: "datetime", intent: "UTC timestamp of the first tracked filament usage event on this spool." },
    { key: "last_used", type: "datetime", intent: "UTC timestamp of the most recent tracked usage event on this spool." },
    { key: "filament", type: "choice", intent: "Linked filament profile this physical spool belongs to." },
    { key: "price", type: "float", intent: "Effective price for this spool, used for cost tracking and reporting." },
    { key: "initial_weight", type: "float", intent: "Starting net filament weight for this specific spool instance." },
    { key: "spool_weight", type: "float", intent: "Empty spool weight override used for measured-weight calculations." },
    { key: "remaining_weight", type: "float", intent: "Current estimated net filament remaining on the spool." },
    { key: "used_weight", type: "float", intent: "Current estimated net filament consumed from the spool." },
    { key: "remaining_length", type: "float", intent: "Current estimated filament length remaining on the spool." },
    { key: "used_length", type: "float", intent: "Current estimated filament length consumed from the spool." },
    { key: "location", type: "text", intent: "Storage or printer location label for organizing spool inventory." },
    { key: "lot_nr", type: "text", intent: "Manufacturer lot identifier used for traceability and color consistency." },
    { key: "comment", type: "text", intent: "Free-form operator notes for this spool." },
    { key: "archived", type: "boolean", intent: "Archive status flag used to hide inactive spools from normal workflows." },
  ],
  filament: [
    { key: "id", type: "integer", intent: "Stable system identifier for this filament profile." },
    { key: "registered", type: "datetime", intent: "UTC timestamp for when the filament profile was created." },
    { key: "name", type: "text", intent: "Human-readable filament product name." },
    { key: "vendor", type: "choice", intent: "Linked manufacturer profile for this filament." },
    { key: "material", type: "text", intent: "Base material category such as PLA, PETG, ABS, or similar." },
    { key: "price", type: "float", intent: "Reference price for a full spool of this filament profile." },
    { key: "density", type: "float", intent: "Material density used for weight/length conversion math." },
    { key: "diameter", type: "float", intent: "Nominal filament diameter used for volume and length calculations." },
    { key: "weight", type: "float", intent: "Nominal net filament weight for a full spool." },
    { key: "spool_weight", type: "float", intent: "Nominal empty spool weight for measured-weight workflows." },
    { key: "article_number", type: "text", intent: "External catalog code such as SKU, UPC, or EAN." },
    { key: "settings_extruder_temp", type: "integer", intent: "Reference nozzle temperature for print profile setup." },
    { key: "settings_bed_temp", type: "integer", intent: "Reference bed temperature for print profile setup." },
    { key: "color_hex", type: "text", intent: "Primary hex color used for UI display and swatches." },
    { key: "multi_color_hexes", type: "text", intent: "Hex color list for multi-color filament definitions." },
    { key: "multi_color_direction", type: "choice", intent: "Multi-color layout mode, such as coextruded or longitudinal." },
    { key: "external_id", type: "text", intent: "Provider-specific identifier for external filament databases." },
    { key: "comment", type: "text", intent: "Free-form notes about this filament profile." },
  ],
  vendor: [
    { key: "id", type: "integer", intent: "Stable system identifier for this manufacturer profile." },
    { key: "registered", type: "datetime", intent: "UTC timestamp for when the manufacturer profile was created." },
    { key: "name", type: "text", intent: "Manufacturer name used across linked filament profiles." },
    { key: "empty_spool_weight", type: "float", intent: "Default empty spool weight for this manufacturer." },
    { key: "external_id", type: "text", intent: "Provider-specific identifier for external manufacturer databases." },
    { key: "comment", type: "text", intent: "Free-form notes about this manufacturer profile." },
  ],
};
const JSON_OPERATOR_GROUPS: Array<{ label: string; operators: string[] }> = [
  { label: "Logical / Conditional", operators: ["if", "and", "or", "!"] },
  { label: "Comparison", operators: ["==", "!=", "<", "<=", ">", ">="] },
  { label: "Arithmetic", operators: ["+", "-", "*", "/", "%"] },
];

export const Help = () => {
  const { token } = useToken();
  const t = useTranslate();
  const location = useLocation();
  const [builtInFieldEntity, setBuiltInFieldEntity] = useState<BuiltInEntity | null>(null);
  const sectionBodyStyle = { fontSize: token.fontSize, lineHeight: 1.7 };
  const nestedLevel4Style = { marginLeft: 16 };
  const nestedLevel5Style = { marginLeft: 28 };
  const nestedLevel6Style = { marginLeft: 40 };

  const renderLevel3Heading = (title: string, marginTop = 0) => (
    <Flex align="center" gap={12} style={{ marginTop, marginBottom: 8 }}>
      <Title level={3} style={{ margin: 0 }}>
        {title}
      </Title>
      <div style={{ flex: 1, borderBottom: `1px solid ${token.colorBorderSecondary}` }} />
    </Flex>
  );

  const builtInFieldRows = useMemo(() => {
    if (!builtInFieldEntity) {
      return [];
    }
    return BUILT_IN_FIELD_DEFINITIONS[builtInFieldEntity];
  }, [builtInFieldEntity]);

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const targetId = decodeURIComponent(location.hash.replace(/^#/, ""));
    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    // Route transitions can render asynchronously; run once immediately and once shortly after.
    const animationFrame = requestAnimationFrame(scrollToTarget);
    const timeout = window.setTimeout(scrollToTarget, 180);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [location.hash]);

  const builtInFieldColumns: ColumnsType<{ key: string; type: string; intent: string }> = [
    {
      title: "Field",
      dataIndex: "key",
      key: "field",
      width: "24%",
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: "18%",
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: "Intent",
      dataIndex: "intent",
      key: "intent",
      render: (value: string) => <Text type="secondary">{value}</Text>,
    },
  ];

  const builtInFieldEntityTitle =
    builtInFieldEntity === "spool"
      ? "Spool"
      : builtInFieldEntity === "filament"
        ? "Filament"
        : builtInFieldEntity === "vendor"
          ? "Manufacturer"
          : "";

  return (
    <Content
      style={{
        padding: 20,
        minHeight: 280,
        maxWidth: 1200,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      <Trans
        i18nKey={"help.description"}
        components={{
          p: <p />,
          title: <Title />,
          filamentCreateLink: <Link to="/filament/create" />,
          spoolCreateLink: <Link to="/spool/create" />,
          vendorCreateLink: <Link to="/vendor/create" />,
          readmeLink: <Link to="https://github.com/Donkie/Spoolman#integration-status" target="_blank" />,
          itemsHelp: (
            <List
              itemLayout="horizontal"
              size="large"
              dataSource={[
                {
                  title: t("filament.filament"),
                  description: t("help.resources.filament"),
                  icon: <HighlightOutlined />,
                },
                {
                  title: t("spool.spool"),
                  description: t("help.resources.spool"),
                  icon: <FileOutlined />,
                },
                {
                  title: t("vendor.vendor"),
                  description: t("help.resources.vendor"),
                  icon: <UserOutlined />,
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta avatar={item.icon} title={item.title} description={item.description} />
                </List.Item>
              )}
            />
          ),
        }}
      />
      <Divider />
      <Title level={2} style={{ marginBottom: 8 }}>
        Field Overview
      </Title>
      <Paragraph type="secondary" style={sectionBodyStyle}>
        Spoolman includes built-in fields per entity and supports two extra field types:{" "}
        <Text strong>Custom Extra Fields</Text> and <Text strong>Formula Extra Fields</Text>.
      </Paragraph>
      <section id="built-in-fields">
        {renderLevel3Heading("Built-in Fields")}
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel4Style }}>
          Built-in fields are core Spoolman attributes used by default forms, list columns, APIs, and label/template
          references.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel4Style, marginBottom: 0 }}>
          Open a quick field map:
        </Paragraph>
        <Flex gap={8} wrap style={{ ...nestedLevel4Style, marginTop: 8 }}>
          <Button size="small" onClick={() => setBuiltInFieldEntity("spool")}>
            Spool
          </Button>
          <Button size="small" onClick={() => setBuiltInFieldEntity("filament")}>
            Filament
          </Button>
          <Button size="small" onClick={() => setBuiltInFieldEntity("vendor")}>
            Manufacturer
          </Button>
        </Flex>
      </section>
      <Modal
        title={builtInFieldEntity ? `${builtInFieldEntityTitle} Built-in Fields` : undefined}
        open={builtInFieldEntity !== null}
        footer={null}
        onCancel={() => setBuiltInFieldEntity(null)}
        width={900}
      >
        <Table
          size="small"
          pagination={false}
          columns={builtInFieldColumns}
          dataSource={builtInFieldRows}
          rowKey="key"
          scroll={{ y: 420 }}
        />
      </Modal>
      <section id="extra-fields">
        {renderLevel3Heading("Extra Fields", 24)}
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel4Style }}>
          Extra fields let you store additional data directly and define user-maintained derived values across
          entities.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel4Style }}>
          Configure definitions in{" "}
          <Link to="/settings/extra/spool">Settings → Extra Fields → Spools</Link>,{" "}
          <Link to="/settings/extra/filament">Filaments</Link>, and{" "}
          <Link to="/settings/extra/vendor">Manufacturers</Link>.
        </Paragraph>
      </section>
      <section id="custom-extra-fields">
        <Title level={4} style={{ marginTop: 24, marginBottom: 8, ...nestedLevel4Style }}>
          Custom Extra Fields
        </Title>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Custom extra fields store direct values that you enter or import for each entity record.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Supported types include <Text code>text</Text>, <Text code>integer</Text>, <Text code>integer_range</Text>,{" "}
          <Text code>float</Text>, <Text code>float_range</Text>, <Text code>datetime</Text>,{" "}
          <Text code>boolean</Text>, and <Text code>choice</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          In custom extra fields, key and type are immutable after creation. For choice fields, existing choices and
          the multi-choice mode are also immutable. Deleting a field removes its data from all records.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Keys should stay stable because APIs and integrations use them as identifiers. Default values apply only to
          newly created items.
        </Paragraph>
      </section>
      <section id="formula-fields">
        <Title level={4} style={{ marginTop: 24, marginBottom: 8, ...nestedLevel4Style }}>
          Formula Extra Fields
        </Title>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Formula extra fields turn existing built-in/custom data into calculated values you can reuse everywhere.
          Common examples are spool age, normalized date labels, cost deltas, and short text tags.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          They are read-only outputs configured per entity, so source records stay unchanged. The primary authoring
          format is <Text code>Expression JSON (JSON Logic)</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Configure them in <Link to="/settings/extra/spool">Settings → Extra Fields</Link> for Spools, Filaments, or
          Manufacturers. In <Text strong>Formula Extra Fields</Text>, click <Text code>+</Text>, build your JSON
          expression, then validate with <Text code>Sample Values (JSON)</Text> and <Text code>Preview Expression</Text>{" "}
          before saving.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          In each formula field editor, use <Text strong>Include in API</Text> to mark that field as eligible for API
          output. Entity responses include only those field-level opt-ins under a <Text code>derived</Text> object
          whenever <Text code>include_derived=true</Text> is requested. Each field key is exposed as{" "}
          <Text code>{`derived.<key>`}</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel5Style }}>
          Formula values are computed when records are loaded and are not stored as dedicated database columns. Dynamic
          helpers such as <Text code>today()</Text> refresh when data is reloaded. Enabling API derived output can add
          response compute time on large lists. Per request, clients can override the default with{" "}
          <Text code>include_derived=true</Text> or <Text code>include_derived=false</Text>.
        </Paragraph>
        <Title id="formula-json-logic" level={5} style={{ marginTop: 0, marginBottom: 8, ...nestedLevel5Style }}>
          JSON Logic
        </Title>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          Token groups are clickable inserts that speed up authoring and reduce JSON syntax mistakes.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          <Text strong>Field References</Text> insert JSON Logic variable objects. For example,{" "}
          <Text code>{`{weight}`}</Text> inserts <Text code>{`{"var":"weight"}`}</Text> and{" "}
          <Text code>{`{extra.purchase_date}`}</Text> inserts <Text code>{`{"var":"extra.purchase_date"}`}</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          <Text strong>Operators</Text> insert operator templates, and <Text strong>Helper Functions</Text> insert
          helper templates that can be completed with compatible field references.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          Helper insertion is staged: click a helper first, then click the required compatible references. While a
          helper is pending, incompatible helper/reference tokens are visible but dimmed. Use <Text code>X</Text> to
          cancel pending helper selection, or <Text code>Helper only</Text> to insert that helper with placeholder
          inputs.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          Formula-to-formula references are not supported. Build nested JSON Logic in a single formula instead of
          referencing another formula field. Formula outputs are available in API/template usage via{" "}
          <Text code>{`derived.<key>`}</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          On wider layouts, operators are shown in a right-side panel next to the JSON editor and can be collapsed or
          expanded. On narrow layouts, operators are hidden from the panel and can still be entered directly in JSON.
        </Paragraph>
        <Row gutter={[16, 16]} align="top" style={nestedLevel6Style}>
          <Col xs={24} xl={12}>
            <Title id="formula-token-groups" level={5} style={{ marginTop: 0, marginBottom: 8 }}>
              Token Groups
            </Title>
            <div
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                padding: 12,
                background: token.colorBgContainer,
              }}
            >
              <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginBottom: 10 }}>
                Operators
              </Paragraph>
              <Row gutter={[8, 8]}>
                {JSON_OPERATOR_GROUPS.map((group) => (
                  <Col xs={24} md={8} key={group.label}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: token.borderRadius,
                        padding: 8,
                        minHeight: 84,
                      }}
                    >
                      <Text strong>{group.label}</Text>
                      <div style={{ marginTop: 6 }}>
                        <Space size={[4, 4]} wrap>
                          {group.operators.map((operator) => (
                            <Text key={operator} code>
                              {operator}
                            </Text>
                          ))}
                        </Space>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
              <Divider style={{ margin: "12px 0" }} />
              <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginBottom: 10 }}>
                Helper Functions
              </Paragraph>
              <Row gutter={[8, 8]}>
                {FORMULA_HELPER_GROUPS.map((group) => (
                  <Col xs={24} md={12} key={group.key}>
                    <div
                      style={{
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: token.borderRadius,
                        padding: 8,
                      }}
                    >
                      <Text strong>{t(`settings.complex_fields.formula.token_categories.${group.key}`)}</Text>
                      <div style={{ marginTop: 6 }}>
                        <Space size={[4, 4]} wrap>
                          {group.helpers.map((helper) => (
                            <Tooltip key={helper.name} title={helper.description}>
                              <Text code>{helper.name}</Text>
                            </Tooltip>
                          ))}
                        </Space>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          </Col>
          <Col xs={24} xl={12}>
            <Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
              Concrete Examples
            </Title>
            <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginBottom: 12 }}>
              Variables come from available field references for the selected entity, including built-in fields
              (for example <Text code>{`{created_at}`}</Text>) and custom fields
              (for example <Text code>{`{extra.purchase_date}`}</Text>).
            </Paragraph>
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <div
                style={{
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                  padding: 10,
                }}
              >
                <Text strong>Example 1: Full timestamp to YYYY-MM-DD</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Variable definitions:
                </Paragraph>
                <Text code>{`{"created_at":"2026-03-09T14:23:45Z"}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Expression JSON:
                </Paragraph>
                <Text code>{`{"date_only":[{"var":"created_at"}]}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 0 }}>
                  Result: <Text code>{`"2026-03-09"`}</Text>
                </Paragraph>
              </div>
              <div
                style={{
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                  padding: 10,
                }}
              >
                <Text strong>Example 2: Difference between two datetimes</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Variable definitions:
                </Paragraph>
                <Text code>{`{"first_used":"2026-03-01T10:00:00Z","last_used":"2026-03-09T16:00:00Z"}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Expression JSON:
                </Paragraph>
                <Text code>{`{"days_between":[{"var":"first_used"},{"var":"last_used"}]}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 0 }}>
                  Result: <Text code>{`8.25`}</Text>
                </Paragraph>
              </div>
              <div
                style={{
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                  padding: 10,
                }}
              >
                <Text strong>Example 3: Short text label from lot number</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Variable definitions:
                </Paragraph>
                <Text code>{`{"lot_nr":"ABCD-23991"}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 6 }}>
                  Expression JSON:
                </Paragraph>
                <Text code>{`{"left":[{"var":"lot_nr"},4]}`}</Text>
                <Paragraph type="secondary" style={{ ...sectionBodyStyle, marginTop: 8, marginBottom: 0 }}>
                  Result: <Text code>{`"ABCD"`}</Text>
                </Paragraph>
              </div>
            </Space>
          </Col>
        </Row>
        <Title level={5} style={{ marginTop: 0, marginBottom: 8, ...nestedLevel6Style }}>
          Formatting & Validation
        </Title>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          The expression editor uses a JSON code editor (CodeMirror). Use <Text code>Format JSON</Text> to
          auto-pretty-print your JSON Logic object. Keep <Text code>Preview Expression</Text> +{" "}
          <Text code>Sample Values (JSON)</Text> as your first validation pass.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          <Text code>Sample Values (JSON)</Text> must be a valid JSON object used only for preview/testing. Use plain
          keys without braces, and match keys to your <Text code>{`{"var":"..."}`}</Text> references. Example:{" "}
          <Text code>{`{"weight": 1000, "remaining_weight": 225, "created_at": "2026-02-28T10:15:00Z", "color_hex": "#FF00FF"}`}</Text>.
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          Reference docs:{" "}
          <a href="https://jsonlogic.com/" target="_blank" rel="noreferrer">
            jsonlogic.com
          </a>
          {" · "}
          <a href="https://jsonlogic.com/operations.html" target="_blank" rel="noreferrer">
            operations
          </a>
          {" · "}
          <a href="https://jsonlint.com/" target="_blank" rel="noreferrer">
            JSONLint
          </a>
        </Paragraph>
        <Paragraph type="secondary" style={{ ...sectionBodyStyle, ...nestedLevel6Style }}>
          Choose where each formula appears: <Text code>Show</Text> (record details), <Text code>List</Text>{" "}
          (table/list pages), and <Text code>Template</Text> (label/title/filename templates).
        </Paragraph>
        <ul style={{ margin: "0 0 16px 56px", color: token.colorTextSecondary, lineHeight: 1.7, fontSize: token.fontSize }}>
          <li>
            If a formula includes <Text code>List</Text>, you can enable column toggling so it can be hidden or shown
            through <Text code>Hide Columns</Text> on list pages.
          </li>
          <li>
            If a formula includes <Text code>Template</Text>, it can be referenced in templates as{" "}
            <Text code>{`{derived.your_key}`}</Text> (for example, <Text code>{`{derived.days_between_events}`}</Text>).
          </li>
        </ul>
      </section>
    </Content>
  );
};

export default Help;
