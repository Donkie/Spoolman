# JSON Logic Spike (Clean-Cut) for Formula Extra Fields

## Status
- Owner: TBD
- Branch: `feat/complex-fields-framework` (PR #874 context)
- Date: 2026-03-05
- Decision type: Spike RFC (implementation-first, no legacy compatibility)

## Background
Current formula fields use a custom expression syntax/evaluator with limited typing and helper coverage.
We want richer boolean/date/text logic and safer execution semantics without continuing ad-hoc parser growth.

Relevant requests:
- [#795](https://github.com/Donkie/Spoolman/issues/795) Labels: Date formatting
- [#853](https://github.com/Donkie/Spoolman/issues/853) Sort by hue
- [#870](https://github.com/Donkie/Spoolman/issues/870) Show empty spool weight column
- [#783](https://github.com/Donkie/Spoolman/issues/783) Extra action buttons per spool (partially related)

## Goals
- Replace the formula expression engine with JSON Logic for formula extra fields.
- Support result types: `number`, `text`, `boolean`, `date`, `datetime`, `time`.
- Enable richer operators: logical, comparison, conditional, string, and date helpers.
- Enforce frontend/backend evaluation parity for previews and rendered values.
- Keep execution safe and deterministic (no unrestricted eval).

## Non-Goals
- Backward compatibility with old formula syntax.
- Automatic migration of existing formula definitions.
- Replacing complex extra fields that add custom UI/actions/workflows.
- Server-side indexed filtering/sorting on computed values in this spike.

## Decision (Proposed)
- Use JSON Logic as the canonical formula representation.
- Store formulas as JSON AST only.
- Remove legacy expression parser/evaluator once spike implementation is accepted.

## Runtime Candidate Snapshot (2026-03-05)
| Candidate | Role | License | Activity signal | Notes |
| --- | --- | --- | --- | --- |
| `json-logic/json-logic-engine` | Frontend runtime | MIT | pushed 2026-01-21 | Active JS implementation with custom operator support. |
| `jwadhams/json-logic-js` | Frontend/runtime reference | MIT | pushed 2024-07-09 | Canonical older implementation, broader adoption but slower recent change pace. |
| `nadirizr/json-logic-py` | Backend runtime | MIT | pushed 2023-12-19 | Usable baseline, but older activity and parity risk with modern JS engines. |
| `llnl/jsonlogic` | Python tooling (non-evaluator) | MIT | pushed 2026-03-05 | Provides JSON Logic expression generation helpers, not a direct evaluator runtime. |
| `cloud-custodian/cel-python` | Alternative (non-JSON Logic) | Apache-2.0 | pushed 2026-02-17 | Strong typed alternative if JSON Logic parity fails. |

Proposed spike baseline:
- Frontend: `json-logic-engine`
- Backend: start with `nadirizr/json-logic-py` for evaluator parity harness; reassess additional evaluator candidates after fixture runs.

## Proposed Architecture
### Data model
- `DerivedFieldDefinition` stores:
- `result_type`
- `expression_json` (JSON object, required)
- Keep current surfaces/column toggle behavior unchanged.

### Backend
- Add a JSON Logic evaluator wrapper in Python.
- Provide a strict operator allowlist.
- Add custom operators for Spoolman domain helpers:
- `today`, `date_only`, `time_only`, `days_between`, `hours_between`, `hue_from_hex`, `coalesce`
- Validate AST at save-time with:
- operator allowlist checks
- reference format checks
- result type compatibility checks
- Preview endpoint accepts JSON AST and sample values.

### Frontend
- Formula editor becomes JSON Logic editor:
- raw JSON textarea in spike phase
- clickable chips for references/operators
- preview panel unchanged in behavior
- Type-aware helper palette by selected `result_type`.
- Keep current list/show/template surface controls.

## Operator/Helper Catalog (Initial)
### Logical and conditional
- `and`, `or`, `!`, `if`, `??` (or `coalesce`)

### Comparison
- `==`, `!=`, `<`, `<=`, `>`, `>=`

### Numeric
- `+`, `-`, `*`, `/`, `%`, `abs`, `min`, `max`, `round`, `floor`, `ceil`

### Text
- `cat`, `substr`, `lower`, `upper`, `trim`, `length`, `replace`

### Date and time
- `today`, `year`, `month`, `day`, `hour`, `minute`, `second`, `timestamp`
- `date_only`, `time_only`, `days_between`, `hours_between`

## Result Type Rules (Draft)
- `number`: numeric expressions only.
- `text`: string output or explicit stringify.
- `boolean`: logical/comparison output.
- `date`: ISO `YYYY-MM-DD`.
- `datetime`: ISO datetime string in UTC.
- `time`: ISO `HH:MM:SS`.

Validation should fail early when inferred output does not match `result_type`.

## Scope Boundaries vs Complex Extra Fields
JSON Logic formula fields can cover:
- computed columns
- status flags
- derived display values

Complex extra fields remain for:
- UI actions/buttons/workflows
- module-defined interactions beyond scalar value computation

## Implementation Plan
1. Backend foundation
- Add evaluator wrapper and allowlisted custom ops.
- Add AST validation and type checks.
- Update preview endpoint to JSON AST payload.

2. Frontend foundation
- Replace expression editor with JSON AST editor UI.
- Add reference/operator chip insertion.
- Keep preview UX and surface controls.

3. Integration
- Replace runtime formula evaluation in list/show/template render paths.
- Remove old formula parser/evaluator modules.

4. Tests
- Backend unit tests for ops, validation, and type enforcement.
- Frontend tests for insertion and preview payload shape.
- Parity tests using shared fixtures for FE and BE outputs.

## Risks
- JSON authoring UX can be heavy without a visual builder.
- FE/BE library semantic differences must be normalized.
- Date/time coercion edge cases can be surprising if not tightly specified.

## Immediate Next Step Checklist (Phase 0, 1-2 days)
- Build a 20-case parity fixture set (`tests_integration` + frontend fixture file):
- arithmetic, boolean logic, null/coalesce, string ops, date helpers, hue helper, invalid syntax, invalid type.
- Run fixture set against two backend candidates and one frontend candidate.
- Record mismatches with exact operator semantics and type coercion behavior.
- Select backend runtime and lock the operator subset for v1.
- Freeze UTC/date behavior in writing (`today` allowed, `now` deferred).
- Finalize API contract for preview/save payload (`expression_json` only).

## Phase 0 Snapshot (2026-03-05)
- Fixture set created: `tests_integration/tests/fields/json_logic_parity_fixtures.json` (20 cases).
- Runner created: `scripts/json_logic_parity.py`.
- Backend execution baseline:
- Engine: `json-logic-py` (sourced directly from GitHub due blocked PyPI access in this environment)
- Result: **20/20 pass**
- Meaning: operator set and custom helper wiring in the harness are viable for spike phase.

## Phase 1 Snapshot (2026-03-05)
- Backend API accepts `expression_json` for preview/save with allowlisted JSON Logic operators and custom helpers.
- Frontend formula runtime evaluates `expression_json` when present, with legacy string expressions as fallback.
- Settings dependency checks now resolve custom-field references from both legacy expressions and JSON Logic `var` nodes.
- Formula editor accepts an optional `Expression JSON (JSON Logic)` payload for preview/save during transition.

## Spike Exit Criteria
- At least 15 golden fixture expressions pass identically in FE and BE.
- Save-time validation blocks invalid operators/references/types.
- Preview and runtime rendering are consistent for all result types.
- Old expression engine fully removable without hidden dependencies.

## Open Questions
- Which Python JSON Logic library will be used, and does it support needed custom ops cleanly?
- Should `now()` be excluded initially to avoid time-volatile values in displayed columns?
- Do we allow nested object outputs at all, or scalar-only forever?
- Should date/time helpers always be UTC-only in v1?

## Deliverables
- `JSON_LOGIC_SPIKE.md` (this RFC)
- Prototype backend evaluator + validation
- Prototype frontend JSON editor + preview
- Test report with parity matrix and go/no-go recommendation
