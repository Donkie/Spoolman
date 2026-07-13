<script lang="ts">
	import Konva from 'konva';
	import { Stage, Layer, Rect, Text, Path, Group, Image, Transformer } from 'svelte-konva';
	import type { LabelDesign, LabelElement } from '$lib/labels/types';
	import type { LabelBinding } from '$lib/labels/template';
	import { elementToShape, qrLogoBox } from '$lib/labels/render';
	import { getLogoImage } from '$lib/labels/logo';

	interface Props {
		design: LabelDesign;
		/** Spool data to resolve placeholders/QR/colors; omit for template preview. */
		binding?: LabelBinding;
		baseUrl?: string;
		/** Screen pixels per millimeter. */
		pxPerMm: number;
		/** Enable drag / select / resize. */
		interactive?: boolean;
		selectedId?: string | null;
		onselect?: (id: string | null) => void;
		/** Fired when an element's geometry changes via drag or resize. */
		onchange?: (el: LabelElement) => void;
	}
	let {
		design,
		binding,
		baseUrl = '',
		pxPerMm,
		interactive = false,
		selectedId = $bindable(null),
		onselect,
		onchange
	}: Props = $props();

	// svelte-konva exposes the underlying Konva node as a component export.
	let transformerRef = $state<{ node: Konva.Transformer } | undefined>();
	let stageRef = $state<{ node: Konva.Stage } | undefined>();
	let logoImage = $state<HTMLImageElement | null>(null);

	$effect(() => {
		getLogoImage()
			.then((img) => (logoImage = img))
			.catch(() => {});
	});

	const specs = $derived(
		design.elements.map((el) => ({ el, spec: elementToShape(el, { binding, baseUrl }) }))
	);
	const stageW = $derived(design.label.w * pxPerMm);
	const stageH = $derived(design.label.h * pxPerMm);
	const selectedType = $derived(design.elements.find((e) => e.id === selectedId)?.type);

	// Re-attach the transformer to the selected element's node every render. Each
	// top-level node carries its element id as a Konva name, so we look it up
	// fresh — surviving node re-creation (e.g. toggling wrap swaps Text↔Group).
	$effect(() => {
		void specs; // re-run when elements change
		const t = transformerRef?.node;
		const stage = stageRef?.node;
		if (!t || !stage) return;
		const node = selectedId ? stage.findOne('.' + selectedId) : undefined;
		t.nodes(node ? [node] : []);
		t.getLayer()?.batchDraw();
	});

	function select(id: string | null) {
		if (!interactive) return;
		selectedId = id;
		onselect?.(id);
	}

	function onStageClick(e: { target: Konva.Node }) {
		// A click on empty stage (target is the Stage itself) deselects.
		if (e.target === e.target.getStage()) select(null);
	}

	function commitDrag(el: LabelElement, node: Konva.Node) {
		onchange?.({ ...el, x: round(node.x()), y: round(node.y()) });
	}

	// Text re-wraps live while dragging a side handle: fold the horizontal scale
	// into the wrap width and reset it to 1 each frame (Konva's editable-text
	// pattern). Only scaleX is touched, so it never fights the transformer.
	function textTransform(node: Konva.Node) {
		const t = node as Konva.Text;
		t.width(Math.max(2, t.width() * t.scaleX()));
		t.scaleX(1);
	}

	// Non-wrapping text lives in a clipped group; a side-handle drag widens the
	// clip (and the inner text) instead of scaling.
	function clipTextTransform(node: Konva.Node) {
		const g = node as Konva.Group;
		const newW = Math.max(2, g.clipWidth() * g.scaleX());
		g.clipWidth(newW);
		(g.findOne('Text') as Konva.Text | undefined)?.width(newW);
		g.scaleX(1);
	}

	// On release, fold whatever scale remains into real mm dimensions.
	function commitTransform(el: LabelElement, node: Konva.Node) {
		const sx = node.scaleX();
		const sy = node.scaleY();
		node.scaleX(1);
		node.scaleY(1);
		const base = { ...el, x: round(node.x()), y: round(node.y()) };
		switch (el.type) {
			case 'qr':
				onchange?.({ ...base, size: round(el.size * sx) } as LabelElement);
				break;
			case 'text': {
				// Non-wrapping text is a clipped group (width = clip width); wrapping
				// text is a plain Text node (width = wrap width).
				const w =
					el.wrap === false ? (node as Konva.Group).clipWidth() * sx : (node as Konva.Text).width() * sx;
				onchange?.({ ...base, w: round(w) } as LabelElement);
				break;
			}
			case 'swatch':
			case 'rect': {
				const r = node as Konva.Rect;
				onchange?.({ ...base, w: round(r.width() * sx), h: round(r.height() * sy) } as LabelElement);
				break;
			}
		}
	}

	function round(n: number): number {
		return Math.round(n * 100) / 100;
	}

	const ALL_ANCHORS = [
		'top-left',
		'top-center',
		'top-right',
		'middle-left',
		'middle-right',
		'bottom-left',
		'bottom-center',
		'bottom-right'
	];
	// Text resizes by width only (side handles) so it re-wraps; QR stays square;
	// boxes resize freely. Font size is set from the inspector.
	const anchors = $derived(
		selectedType === 'text'
			? ['middle-left', 'middle-right']
			: selectedType === 'qr'
				? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
				: ALL_ANCHORS
	);

	interface Box {
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
	}
	// Enforce a small minimum so a shape can't be collapsed to nothing.
	function boundBox(oldBox: Box, newBox: Box): Box {
		const min = 3 * pxPerMm;
		return Math.abs(newBox.width) < min || Math.abs(newBox.height) < min ? oldBox : newBox;
	}

	const TF_CONFIG = {
		rotateEnabled: false,
		anchorSize: 8,
		borderStroke: '#be682f',
		anchorStroke: '#be682f'
	};
</script>

<div class="label-canvas" style:width="{stageW}px" style:height="{stageH}px">
	<Stage bind:this={stageRef} width={stageW} height={stageH} onclick={onStageClick} ontap={onStageClick}>
		<Layer scaleX={pxPerMm} scaleY={pxPerMm}>
			{#each specs as { el, spec } (el.id)}
				{#if spec.kind === 'qr'}
					{@const box = qrLogoBox(spec.size)}
					<Group
						name={el.id}
						x={spec.x}
						y={spec.y}
						draggable={interactive}
						onclick={() => select(el.id)}
						ontap={() => select(el.id)}
						ondragend={(e) => commitDrag(el, e.target)}
						ontransformend={(e) => commitTransform(el, e.target)}
					>
						<Rect x={0} y={0} width={spec.size} height={spec.size} fill="#ffffff" />
						<Path data={spec.pathData} fill="#000000" />
						{#if spec.logo && logoImage}
							<Rect x={box.padXY} y={box.padXY} width={box.pad} height={box.pad} fill="#ffffff" />
							<Image image={logoImage} x={box.logoXY} y={box.logoXY} width={box.logo} height={box.logo} />
						{/if}
					</Group>
				{:else if spec.kind === 'text'}
					<Text
						{...spec.config}
						name={el.id}
						draggable={interactive}
						onclick={() => select(el.id)}
						ontap={() => select(el.id)}
						ondragend={(e) => commitDrag(el, e.target)}
						ontransform={(e) => textTransform(e.target)}
						ontransformend={(e) => commitTransform(el, e.target)}
					/>
				{:else if spec.kind === 'textclip'}
					<Group
						name={el.id}
						x={spec.x}
						y={spec.y}
						clipX={0}
						clipY={0}
						clipWidth={spec.width}
						clipHeight={spec.clipHeight}
						draggable={interactive}
						onclick={() => select(el.id)}
						ontap={() => select(el.id)}
						ondragend={(e) => commitDrag(el, e.target)}
						ontransform={(e) => clipTextTransform(e.target)}
						ontransformend={(e) => commitTransform(el, e.target)}
					>
						<Text {...spec.config} />
					</Group>
				{:else}
					<Rect
						{...spec.config}
						name={el.id}
						draggable={interactive}
						onclick={() => select(el.id)}
						ontap={() => select(el.id)}
						ondragend={(e) => commitDrag(el, e.target)}
						ontransformend={(e) => commitTransform(el, e.target)}
					/>
				{/if}
			{/each}
			{#if interactive}
				<Transformer
					bind:this={transformerRef}
					{...TF_CONFIG}
					enabledAnchors={anchors}
					keepRatio={selectedType === 'qr'}
					boundBoxFunc={boundBox}
				/>
			{/if}
		</Layer>
	</Stage>
</div>

<style>
	.label-canvas {
		background: #fff;
		border: 1px solid var(--border);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	}
</style>
