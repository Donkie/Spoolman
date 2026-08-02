// Feedback for edits that persist without an explicit Save press.
//
// Inline inspector fields, the settings page and the locations board all write
// straight through to the API on change. `trackSave` wraps those calls so the
// user gets a confirmation toast when the write lands — and an error toast (with
// the HTTP status, when we have one) when it doesn't, instead of the change
// silently reverting on the next refresh.

import { HttpError } from '$lib/api/http';
import { toasts } from '$lib/stores/toasts.svelte';
import * as m from '$lib/paraglide/messages';

/**
 * Report the outcome of an auto-save. Always resolves — callers are fire-and-
 * forget and must not produce unhandled rejections.
 *
 * @param context Short label for the console log when the save fails.
 */
export function trackSave(promise: Promise<unknown>, context = 'Save failed'): Promise<void> {
	return promise.then(
		() => {
			toasts.success(m['notifications.saveSuccessful']());
		},
		(e: unknown) => {
			console.error(context, e);
			toasts.error(m['notifications.error']({ statusCode: e instanceof HttpError ? e.status : '?' }));
		}
	);
}
