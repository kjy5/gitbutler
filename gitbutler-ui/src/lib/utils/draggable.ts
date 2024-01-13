export interface Dropzone {
	disabled: boolean;
	active: string;
	hover: string;
	accepts: (data: any) => boolean;
	onDrop: (data: any) => Promise<void> | void;
}

const defaultDropzoneOptions: Dropzone = {
	disabled: false,
	active: 'dropzone-active',
	hover: 'dropzone-hover',
	accepts: (data) => data == 'default',
	onDrop: () => {}
};

export function dropzone(node: HTMLElement, opts: Partial<Dropzone> | undefined) {
	let currentOptions = { ...defaultDropzoneOptions, ...opts };

	function setup(opts: Partial<Dropzone> | undefined) {
		currentOptions = { ...defaultDropzoneOptions, ...opts };
		if (currentOptions.disabled) return;

		register(node, currentOptions);
	}

	function clean() {
		unregister(currentOptions);
	}

	setup(opts);

	return {
		update(opts: Partial<Dropzone> | undefined) {
			clean();
			setup(opts);
		},
		destroy() {
			clean();
		}
	};
}

const registry: [HTMLElement, Dropzone][] = [];

function register(node: HTMLElement, dropzone: Dropzone) {
	registry.push([node, dropzone]);
}

function unregister(dropzone: Dropzone) {
	const index = registry.findIndex(([, dz]) => dz == dropzone);
	if (index >= 0) registry.splice(index, 1);
}

export interface DraggableOptions {
	data: any;
	disabled: boolean;
	selector?: string;
	fileId?: string;
}

const defaultDraggableOptions: DraggableOptions = {
	data: 'default',
	disabled: false
};

export function applyGhostStyle(element: HTMLElement) {
	element.style.position = 'absolute';
	element.style.top = '-9999px'; // Element has to be in the DOM so we move it out of sight
	element.style.display = 'inline-block';
	element.style.padding = '30px'; // To prevent clipping of rotated element
}

export function createContainerForMultiDrag(children: Element[]): HTMLDivElement {
	const clone = document.createElement('div');
	const inner = document.createElement('div');
	clone.appendChild(inner);
	applyGhostStyle(clone);
	inner.style.display = 'flex';
	inner.style.flexDirection = 'column';
	inner.style.gap = 'var(--space-2)';
	rotateInnerElement(clone);

	children.forEach((child) => {
		clone.children[0].appendChild(cloneWithPreservedDimensions(child));
	});
	return clone;
}

export function cloneWithPreservedDimensions(node: any) {
	const clone = node.cloneNode(true) as HTMLElement;
	clone.style.height = node.clientHeight + 'px';
	clone.style.width = node.clientWidth + 'px';
	return clone;
}

export function cloneWithRotation(node: any) {
	const clone = node.cloneNode(true) as HTMLElement;
	applyGhostStyle(clone);

	// Style the inner node so it retains the shape and then rotate
	// TODO: This rotation puts a requirement on draggables to have
	// an outer container, which feels extra. Consider refactoring.
	rotateInnerElement(clone);
	return clone as HTMLElement;
}

function rotateInnerElement(element: HTMLElement) {
	const inner = element.children[0] as HTMLElement;
	inner.style.rotate = `${Math.floor(Math.random() * 3)}deg`;
}

export function draggable(node: HTMLElement, opts: Partial<DraggableOptions> | undefined) {
	let dragHandle: HTMLElement | null;
	let currentOptions: DraggableOptions = { ...defaultDraggableOptions, ...opts };
	let clone: HTMLElement | undefined;

	const onDropListeners = new Map<HTMLElement, Array<(e: DragEvent) => void>>();
	const onDragLeaveListeners = new Map<HTMLElement, Array<(e: DragEvent) => void>>();
	const onDragEnterListeners = new Map<HTMLElement, Array<(e: DragEvent) => void>>();
	const onDragOverListeners = new Map<HTMLElement, Array<(e: DragEvent) => void>>();

	function handleMouseDown(e: MouseEvent) {
		dragHandle = e.target as HTMLElement;
	}

	/**
	 * The problem with the ghost element is that it gets clipped after rotation unless we enclose
	 * it within a larger bounding box. This means we have an extra `<div>` in the html that is
	 * only present to support the rotation
	 */
	function handleDragStart(e: DragEvent) {
		let elt: HTMLElement | null = dragHandle;
		while (elt) {
			if (elt.dataset.noDrag !== undefined) {
				e.stopPropagation();
				e.preventDefault();
				return false;
			}
			elt = elt.parentElement;
		}

		// If the draggable specifies a selector then we check if we're dragging selected
		// elements, falling back to the single node executing the drag.
		if (currentOptions.selector) {
			const selectedElements = Array.from(
				document.querySelectorAll(currentOptions.selector).values()
			);
			if (selectedElements.length > 0) {
				clone = createContainerForMultiDrag(selectedElements);
			}
		}
		if (!clone) {
			clone = cloneWithRotation(node);
		}

		document.body.appendChild(clone);

		// Dim the original element while dragging
		node.style.opacity = '0.6';

		// activate destination zones
		registry
			.filter(([_node, dz]) => dz.accepts(currentOptions.data))
			.forEach(([target, dz]) => {
				const onDrop = (e: DragEvent) => {
					e.preventDefault();
					dz.onDrop(currentOptions.data);
				};

				const onDragEnter = (e: DragEvent) => {
					e.preventDefault();
					target.classList.add(dz.hover);
				};

				const onDragLeave = (e: DragEvent) => {
					e.preventDefault();
					target.classList.remove(dz.hover);
				};

				const onDragOver = (e: DragEvent) => {
					e.preventDefault();
				};

				// keep track of listeners so that we can remove them later
				if (onDropListeners.has(target)) {
					onDropListeners.get(target)!.push(onDrop);
				} else {
					onDropListeners.set(target, [onDrop]);
				}

				if (onDragEnterListeners.has(target)) {
					onDragEnterListeners.get(target)!.push(onDragEnter);
				} else {
					onDragEnterListeners.set(target, [onDragEnter]);
				}

				if (onDragLeaveListeners.has(target)) {
					onDragLeaveListeners.get(target)!.push(onDragLeave);
				} else {
					onDragLeaveListeners.set(target, [onDragLeave]);
				}

				if (onDragOverListeners.has(target)) {
					onDragOverListeners.get(target)!.push(onDragOver);
				} else {
					onDragOverListeners.set(target, [onDragOver]);
				}

				// https://stackoverflow.com/questions/14203734/dragend-dragenter-and-dragleave-firing-off-immediately-when-i-drag
				setTimeout(() => {
					target.classList.add(dz.active);
				}, 10);

				target.addEventListener('drop', onDrop);
				target.addEventListener('dragenter', onDragEnter);
				target.addEventListener('dragleave', onDragLeave);
				target.addEventListener('dragover', onDragOver);
			});

		// Get chromium to fire dragover & drop events
		// https://stackoverflow.com/questions/6481094/html5-drag-and-drop-ondragover-not-firing-in-chrome/6483205#6483205
		e.dataTransfer?.setData('text/html', 'd'); // cannot be empty string
		e.dataTransfer?.setDragImage(clone, e.offsetX + 30, e.offsetY + 30); // Adds the padding
		e.stopPropagation();
	}

	function handleDragEnd(e: DragEvent) {
		node.style.opacity = '1';
		if (clone) {
			clone.remove();
			clone = undefined;
		}

		// deactivate destination zones
		registry
			.filter(([_node, dz]) => dz.accepts(currentOptions.data))
			.forEach(([node, dz]) => {
				// remove all listeners
				onDropListeners.get(node)?.forEach((listener) => {
					node.removeEventListener('drop', listener);
				});
				onDragEnterListeners.get(node)?.forEach((listener) => {
					node.removeEventListener('dragenter', listener);
				});
				onDragLeaveListeners.get(node)?.forEach((listener) => {
					node.removeEventListener('dragleave', listener);
				});
				onDragOverListeners.get(node)?.forEach((listener) => {
					node.removeEventListener('dragover', listener);
				});

				node.classList.remove(dz.active);
				node.classList.remove(dz.hover);
			});

		e.stopPropagation();
	}

	function setup(opts: Partial<DraggableOptions> | undefined) {
		currentOptions = { ...defaultDraggableOptions, ...opts };

		if (currentOptions.disabled) return;

		node.draggable = true;

		node.addEventListener('dragstart', handleDragStart);
		node.addEventListener('dragend', handleDragEnd);
		node.addEventListener('mousedown', handleMouseDown, { capture: false });
	}

	function clean() {
		node.draggable = false;
		node.removeEventListener('dragstart', handleDragStart);
		node.removeEventListener('dragend', handleDragEnd);
	}

	setup(opts);

	return {
		update(opts: Partial<DraggableOptions> | undefined) {
			clean();
			setup(opts);
		},
		destroy() {
			clean();
		}
	};
}
