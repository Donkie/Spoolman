import { getContext, setContext } from 'svelte';

// Ties a <Field>'s label cell to the control(s) rendered in its value cell.
//
// FieldGrid is a two-column CSS grid: <Field> emits the label as one cell and the
// control as a sibling cell, so the two are never nested and the control gets no
// implicit label the way AddSpoolModal's <label>-wrapped inputs do. Without help
// a screen reader announces every inspector field as an unnamed edit box.
//
// <Field> publishes the id of its label text here; the generic controls that can
// sit in a value cell (EditableField, NumberInput, Combobox) read it and point
// aria-labelledby at it. Outside a <Field> the context is undefined and they fall
// back to whatever labelling the call site provides, so nothing changes for the
// controls used in AddSpoolModal.
//
// aria-labelledby rather than <label for>: a value cell may hold several controls
// (a range's min/max pair) or none that are labelable at all (ColorEditor), and a
// reference can be shared or simply left unused, where a `for` would have to pick
// exactly one control and would dangle when there isn't one.
const FIELD_LABEL_ID = Symbol('field-label-id');

export function setFieldLabelId(id: string): void {
	setContext(FIELD_LABEL_ID, id);
}

/** The enclosing <Field>'s label id, or undefined when rendered outside one. */
export function getFieldLabelId(): string | undefined {
	return getContext<string | undefined>(FIELD_LABEL_ID);
}
