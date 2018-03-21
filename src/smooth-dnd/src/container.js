import { hasClass, addClass, removeClass, getParent } from './utils';
import { domDropHandler } from './dropHandlers';
import dragscroller from './dragscroller';
import {
	defaultGroupName,
	wrapperClass,
	animationClass,
	stretcherElementClass,
	stretcherElementInstance,
	translationValue,
	containerClass,
	containerInstance,
	containersInDraggable
} from './constants';
import layoutManager from './layoutManager';
import Mediator from './mediator';
import './container.css';

const defaultOptions = {
	groupName: null,
	behaviour: 'move', // move | copy
	acceptGroups: [defaultGroupName],
	orientation: 'vertical', // vertical | horizontal
	getChildPayload: () => { return undefined; },
	animationDuration: 180
};

function setAnimation(element, add, animationDuration) {
	if (add) {
		addClass(element, animationClass);
		element.style.transitionDuration = animationDuration + 'ms';
	} else {
		removeClass(element, animationClass);
		element.style.transitionDuration = null;
	}
}

function getContainer(element) {
	return element ? element[containerInstance] : null;
}

function initOptions(props = defaultOptions) {
	const result = Object.assign({}, defaultOptions, props);
	if (result.groupName && !props.acceptGroups) {
		result.acceptGroups = [props.groupName];
	}
	return result;
}

function isDragRelevant({ element, options }) {
	return function(sourceContainer) {
		const sourceOptions = sourceContainer.getOptions();
		if (options.behaviour === 'copy') return false;

		const parentWrapper = getParent(element, '.' + wrapperClass);
		if (parentWrapper === sourceContainer.element) {
			return false;
		}

		if (sourceContainer.element === element) return true;
		if (sourceOptions.groupName && sourceOptions.groupName === options.groupName) return true;
		if (options.acceptGroups.indexOf(sourceOptions.groupName) > -1) return true;

		return false;
	};
}

function wrapChild(child, orientation) {
	const div = document.createElement('div');
	div.className = `${wrapperClass} ${orientation} ${animationClass}`;
	child.parentElement.insertBefore(div, child);
	div.appendChild(child);
	return div;
}

function wrapChildren(element, orientation, animationDuration) {
	const draggables = Array.prototype.map.call(element.children, child => {
		let wrapper = child;
		if (!hasClass(child, wrapperClass)) {
			wrapper = wrapChild(child, orientation, animationDuration);
		}

		wrapper.style.transitionDuration = animationDuration + 'ms';
		wrapper[containersInDraggable] = [];
		wrapper[translationValue] = 0;
		return wrapper;
	});
	return draggables;
}

function findDraggebleAtPos({ layout }) {
	const find = (draggables, pos, startIndex, endIndex, withRespectToMiddlePoints = false) => {
		if (endIndex < startIndex) {
			return startIndex;
		}
		// binary serach draggable
		if (startIndex === endIndex) {
			let { begin, end } = layout.getBeginEnd(draggables[startIndex]);
			// mouse pos is inside draggable
			// now decide which index to return
			if (pos > begin && pos <= end) {
				if (withRespectToMiddlePoints) {
					return (pos < ((end + begin) / 2)) ? startIndex : startIndex + 1;
				} else {
					return startIndex;
				}
			} else {
				return null;
			}
		} else {
			const middleIndex = Math.floor((endIndex + startIndex) / 2);
			const { begin, end } = layout.getBeginEnd(draggables[middleIndex]);
			if (pos < begin) {
				return find(draggables, pos, startIndex, middleIndex - 1, withRespectToMiddlePoints);
			} else if (pos > end) {
				return find(draggables, pos, middleIndex + 1, endIndex, withRespectToMiddlePoints);
			} else {
				if (withRespectToMiddlePoints) {
					return (pos < ((end + begin) / 2)) ? middleIndex : middleIndex + 1;
				} else {
					return middleIndex;
				}
			}
		}
	};

	return (draggables, pos, withRespectToMiddlePoints = false) => {
		return find(draggables, pos, 0, draggables.length - 1, withRespectToMiddlePoints);
	};
}

function resetDraggables({ element, draggables, layout, options }) {
	return function() {
		draggables.forEach(p => {
			setAnimation(p, false);
			layout.setTranslation(p, 0);
			layout.setVisibility(p, true);
			p[containersInDraggable] = [];
		});

		if (element[stretcherElementInstance]) {
			element[stretcherElementInstance].parentNode.removeChild(element[stretcherElementInstance]);
			element[stretcherElementInstance] = null;
		}

		setTimeout(() => {
			draggables.forEach(p => {
				setAnimation(p, true, options.animationDuration);
			});
		}, 50);
	};
}

function setTargetContainer(draggableInfo, element, set = true) {
	if (element && set) {
		draggableInfo.targetElement = element;
	} else {
		if (draggableInfo.targetElement === element) {
			draggableInfo.targetElement = null;
		}
	}
}

function handleDrop({ element, draggables, layout, options }) {
	const draggablesReset = resetDraggables({ element, draggables, layout, options });
	const dropHandler = (options.dropHandler || domDropHandler)(({ element, draggables, layout, options }));
	return function(draggableInfo, { addedIndex, removedIndex }) {
		draggablesReset();
		// if drop zone is valid => complete drag else do nothing everything will be reverted by draggablesReset()
		if (draggableInfo.targetElement) {
			let actualAddIndex = addedIndex !== null ? ((removedIndex !== null && removedIndex < addedIndex) ? addedIndex - 1 : addedIndex) : null;
			const dropHandlerParams = {
				removedIndex,
				addedIndex: actualAddIndex,
				payload: draggableInfo.payload,
				droppedElement: draggableInfo.element.firstChild
			};
			dropHandler(dropHandlerParams, options.onDrop);
			console.log(removedIndex, actualAddIndex, draggableInfo.payload, draggableInfo.element.firstChild);
		}
	};
}

function getContainerProps(element, initialOptions) {
	const options = initOptions(initialOptions);
	const draggables = wrapChildren(element, options.orientation, options.animationDuration);
	// set flex classes before layout is inited for scroll listener
	addClass(element, `${containerClass} ${options.orientation}`);
	const layout = layoutManager(element, options.orientation, options.animationDuration);
	return {
		element,
		draggables,
		options,
		layout
	};
}

function getRelaventParentContainer(container, relevantContainers) {
	let current = container.element;
	while (current) {
		const containerOfParentElement = getContainer(current.parentElement);
		if (containerOfParentElement && relevantContainers.indexOf(containerOfParentElement) > -1) {
			return {
				container: containerOfParentElement,
				draggable: current
			};
		}
		current = current.parentElement;
	}

	return null;
}

function registerToParentContainer(container, relevantContainers) {
	const parentInfo = getRelaventParentContainer(container, relevantContainers);
	if (parentInfo) {
		parentInfo.container.getChildContainers().push(container);
		container.setParentContainer(parentInfo.container);
		//current should be draggable
		parentInfo.draggable[containersInDraggable].push(container);
	}
}

function getRemovedItem({ draggables, element, options }) {
	let prevRemovedIndex = null;
	return ({ draggableInfo, dragResult }) => {
		let removedIndex = prevRemovedIndex;
		if (prevRemovedIndex == null && draggableInfo.container.element === element && options.behaviour === 'move') {
			removedIndex = prevRemovedIndex = draggableInfo.elementIndex;
		}

		return { removedIndex };
	};
}

function setRemovedItemVisibilty({ draggables, layout }) {
	return ({ draggableInfo, dragResult }) => {
		if (dragResult.removedIndex !== null) {
			layout.setVisibility(draggables[dragResult.removedIndex], false);
		}
	};
}

function getPosition({ element, layout }) {
	return ({ draggableInfo }) => {
		return {
			pos: !getContainer(element).isPosInChildContainer() ? layout.getPosition(draggableInfo.position) : null
		};
	};
}

function notifyParentOnPositionCapture({ element }) {
	let isCaptured = false;
	return ({ draggableInfo, dragResult }) => {
		if (getContainer(element).getParentContainer() && isCaptured !== (dragResult.pos !== null)) {
			isCaptured = dragResult.pos !== null;
			getContainer(element).getParentContainer().onChildPositionCaptured(isCaptured);
		}
	};
}

function getElementSize({ layout }) {
	let elementSize = null;
	return ({ draggableInfo, dragResult }) => {
		if (dragResult.pos === null) {
			return elementSize = null;
		} else {
			elementSize = elementSize || layout.getSize(draggableInfo.element);
		}
		return { elementSize };
	};
}

function handleTargetContainer({ element }) {
	return ({ draggableInfo, dragResult }) => {
		setTargetContainer(draggableInfo, element, !!dragResult.pos);
	};
}

function getDragInsertionIndex({ draggables, layout }) {
	const findDraggable = findDraggebleAtPos({ layout });
	return ({ dragResult: { shadowBeginEnd, pos } }) => {
		if (!shadowBeginEnd) {
			const index = findDraggable(draggables, pos, true);
			return index !== null ? index : draggables.length;
		} else {
			if (shadowBeginEnd.begin + shadowBeginEnd.beginAdjustment <= pos && shadowBeginEnd.end >= pos) {
				// position inside ghost
				return null;
			}
		}

		if (pos < shadowBeginEnd.begin + shadowBeginEnd.beginAdjustment) {
			return findDraggable(draggables, pos);
		} else if (pos > shadowBeginEnd.end) {
			return findDraggable(draggables, pos) + 1;
		} else {
			return draggables.length;
		}
	};
}

function invalidateShadowBeginEndIfNeeded(params) {
	const shadowBoundsGetter = getShadowBeginEnd(params);
	return ({ draggableInfo, dragResult }) => {
		if (draggableInfo.invalidateShadow) {
			return shadowBoundsGetter({ draggableInfo, dragResult });
		}
		return null;
	};
}

function getNextAddedIndex(params) {
	const getIndexForPos = getDragInsertionIndex(params);
	return ({ dragResult }) => {
		let index = null;
		if (dragResult.pos !== null) {
			index = getIndexForPos({ dragResult });
			if (index === null) {
				index = dragResult.addedIndex;
			}
		}
		return {
			addedIndex: index
		};
	};
}

function resetShadowAdjustment() {
	let lastAddedIndex = null;
	return ({ dragResult: { addedIndex, shadowBeginEnd } }) => {
		if (addedIndex !== lastAddedIndex && lastAddedIndex !== null && shadowBeginEnd) {
			shadowBeginEnd.beginAdjustment = 0;
		}
		lastAddedIndex = addedIndex;
	};
}

function handleInsertionSizeChange({ element, draggables, layout, options }) {
	let strectherElement = null;
	let stretcherElementAdded = false;

	return function({ dragResult: { addedIndex, removedIndex, elementSize } }) {
		if (removedIndex === null) {
			if (addedIndex !== null) {
				if (!stretcherElementAdded) {
					const containerBeginEnd = layout.getBeginEndOfContainer();
					const hasScrollBar = layout.getScrollSize(element) > layout.getSize(element);
					const containerEnd = hasScrollBar ? (containerBeginEnd.begin + layout.getScrollSize(element) - layout.getScrollValue(element)) : containerBeginEnd.end;
					const lastDraggableEnd = layout.getBeginEnd(draggables[draggables.length - 1]).end - draggables[draggables.length - 1][translationValue];
					if (lastDraggableEnd + elementSize > containerEnd) {
						strectherElement = document.createElement('div');
						strectherElement.className = stretcherElementClass + ' ' + options.orientation;
						const stretcherSize = (elementSize + lastDraggableEnd) - containerEnd;
						layout.setSize(strectherElement.style, `${stretcherSize}px`);
						element.appendChild(strectherElement);
						element[stretcherElementInstance] = strectherElement;
					}
					stretcherElementAdded = true;
					setTimeout(() => {
						layout.invalidateRects();
					}, 100);
				}
			} else {
				if (strectherElement) {
					layout.setTranslation(strectherElement, 0);
					let toRemove = strectherElement;
					strectherElement = null;
					element.removeChild(toRemove);
					element[stretcherElementInstance] = null;
				}
				stretcherElementAdded = false;
				setTimeout(() => {
					layout.invalidateRects();
				}, 100);

			}
		}
	};
}

function calculateTranslations({ element, draggables, layout }) {
	let prevAddedIndex = null;
	let prevRemovedIndex = null;
	return function({ dragResult: { addedIndex, removedIndex, elementSize } }) {
		if (addedIndex !== prevAddedIndex || removedIndex !== prevRemovedIndex) {
			for (let index = 0; index < draggables.length; index++) {
				if (index !== removedIndex) {
					const draggable = draggables[index];
					let translate = 0;
					if (removedIndex !== null && removedIndex < index) {
						translate -= layout.getSize(draggables[removedIndex]);
					}
					if (addedIndex !== null && addedIndex <= index) {
						translate += elementSize;
					}
					layout.setTranslation(draggable, translate);
				}
			}

			prevAddedIndex = addedIndex;
			prevRemovedIndex = removedIndex;

			return { addedIndex, removedIndex };
		}
	};
}

function getShadowBeginEnd({ draggables, layout }) {
	let prevAddedIndex = null;
	return ({ draggableInfo, dragResult }) => {
		const { addedIndex, removedIndex, elementSize, pos, shadowBeginEnd } = dragResult;
		if (pos !== null) {
			if (addedIndex !== null && (draggableInfo.invalidateShadow || addedIndex !== prevAddedIndex)) {
				if (prevAddedIndex)
					prevAddedIndex = addedIndex;
				let beforeIndex = addedIndex - 1;
				let begin = 0;
				let afterBounds = null;
				let beforeBounds = null;
				if (beforeIndex === removedIndex) {
					beforeIndex--;
				}
				if (beforeIndex > -1) {
					const beforeSize = layout.getSize(draggables[beforeIndex]);
					beforeBounds = layout.getBeginEnd(draggables[beforeIndex]);
					if (elementSize < beforeSize) {
						const threshold = (beforeSize - elementSize) / 2;
						begin = beforeBounds.end - threshold;
					} else {
						begin = beforeBounds.end;
					}
				} else {
					beforeBounds = { end: layout.getBeginEndOfContainer().begin };
				}

				let end = 10000;
				let afterIndex = addedIndex;
				if (afterIndex === removedIndex) {
					afterIndex++;
				}
				if (afterIndex < draggables.length) {
					const afterSize = layout.getSize(draggables[afterIndex]);
					afterBounds = layout.getBeginEnd(draggables[afterIndex]);

					if (elementSize < afterSize) {
						const threshold = (afterSize - elementSize) / 2;
						end = afterBounds.begin + threshold;
					} else {
						end = afterBounds.begin;
					}
				} else {
					afterBounds = { begin: layout.getContainerRectangles().end };
				}

				const shadowRectTopLeft = beforeBounds && afterBounds ? layout.getTopLeftOfElementBegin(beforeBounds.end, afterBounds.begin) : null;

				return {
					shadowBeginEnd: {
						begin,
						end,
						rect: shadowRectTopLeft,
						beginAdjustment: shadowBeginEnd ? shadowBeginEnd.beginAdjustment : 0,
					}
				};
			} else {
				return null;
			}
		} else {
			prevAddedIndex = null;
			return {
				shadowBeginEnd: null
			};
		}
	};
}

function handleFirstInsertShadowAdjustment() {
	let lastAddedIndex = null;
	return ({ dragResult: { pos, addedIndex, shadowBeginEnd }, draggableInfo: { invalidateShadow } }) => {
		if (pos !== null) {
			if (addedIndex != null && lastAddedIndex === null) {
				if (pos < shadowBeginEnd.begin) {
					const beginAdjustment = pos - shadowBeginEnd.begin - 5;
					shadowBeginEnd.beginAdjustment = beginAdjustment;
				}
				lastAddedIndex = addedIndex;
			}
		} else {
			lastAddedIndex = null;
		}
	};
}

function getDragHandler(params) {
	return compose(params)(
		getRemovedItem,
		setRemovedItemVisibilty,
		getPosition,
		notifyParentOnPositionCapture,
		getElementSize,
		handleTargetContainer,
		invalidateShadowBeginEndIfNeeded,
		getNextAddedIndex,
		resetShadowAdjustment,
		handleInsertionSizeChange,
		calculateTranslations,
		getShadowBeginEnd,
		handleFirstInsertShadowAdjustment
	);
}

function getDefaultDragResult() {
	return {
		addedIndex: null,
		removedIndex: null,
		elementSize: null,
		pos: null,
		shadowBeginEnd: null
	};
}

function compose(params) {
	return (...functions) => {
		const hydratedFunctions = functions.map(p => p(params));
		let result = null;
		return (draggableInfo) => {
			result = hydratedFunctions.reduce((dragResult, fn) => {
				return Object.assign(dragResult, fn({ draggableInfo, dragResult }));
			}, result || getDefaultDragResult());
			return result;
		};
	};
}

// Container definition begin
function Container(element) {
	return function(options) {
		let dragResult = null;
		let lastDraggableInfo = null;
		const props = getContainerProps(element, options);
		let dragHandler = getDragHandler(props);
		let dropHandler = handleDrop(props);
		let handleScrollOnDrag = dragscroller(props);
		let parentContainer = null;
		let posIsInChildContainer = false;
		let childContainers = [];

		function processLastDraggableInfo() {
			if (lastDraggableInfo !== null) {
				lastDraggableInfo.invalidateShadow = true;
				dragResult = dragHandler(lastDraggableInfo);
				lastDraggableInfo.invalidateShadow = false;
			}
		}

		function onChildPositionCaptured(isCaptured) {
			posIsInChildContainer = isCaptured;
			if (parentContainer) {
				parentContainer.onChildPositionCaptured(isCaptured);
				if (lastDraggableInfo) {
					dragResult = dragHandler(lastDraggableInfo);
				}
			}
		}

		function prepareDrag(container, relevantContainers) {
			registerToParentContainer(container, relevantContainers);
			container.layout.invalidateRects();
			
			const element = container.element;
			const draggables = props.draggables;
			for (let i = 0; i < element.children.length; i++) {
				draggables[i] = element.children[i];
			}

			for (let i = 0; i < draggables.length - element.children.length; i++) {
				draggables.pop();
			}
		}

		props.layout.setScrollListener(function() {
			processLastDraggableInfo();
		});

		function dispose(container) {
			// additional dispose actions
		}

		return {
			element,
			draggables: props.draggables,
			isDragRelevant: isDragRelevant(props),
			getScale: props.layout.getContainerScale,
			getChildPayload: props.options.getChildPayload,
			groupName: props.options.groupName,
			layout: props.layout,
			getChildContainers: () => childContainers,
			onChildPositionCaptured,
			dispose,
			prepareDrag,
			isPosInChildContainer: () => posIsInChildContainer,
			handleDrag: function(draggableInfo) {
				lastDraggableInfo = draggableInfo;
				dragResult = dragHandler(draggableInfo);
				// console.log(dragResult);
				handleScrollOnDrag({ draggableInfo, dragResult });
			},
			handleDrop: function(draggableInfo) {
				lastDraggableInfo = null;
				onChildPositionCaptured(false);
				dragHandler = getDragHandler(props);
				dropHandler(draggableInfo, dragResult);
				handleScrollOnDrag({ reset: true });
				handleScrollOnDrag = dragscroller(props);
				parentContainer = null;
				childContainers = [];
			},
			getDragResult: function() {
				return dragResult;
			},
			getTranslateCalculator: function(...params) {
				return calculateTranslations(props)(...params);
			},
			setParentContainer: (e) => { parentContainer = e; },
			getParentContainer: () => parentContainer,
			onTranslated: () => {
				processLastDraggableInfo();
			},
			getOptions: () => props.options,
		};
	};
}

const options = {
	onDragStart: (itemIndex) => { },
	onDragMove: () => { },
	onDrop: () => { },
	behaviour: 'move',
	groupName: 'bla bla', // if not defined => container will not interfere with other containers
	acceptGroups: [],
	orientation: 'vertical',
	dragHandleSelector: null,
	nonDragAreaSelector: 'some selector',
	dragBeginDelay: 0,
	animationDuration: 180,
	getChildPayload: (index) => null,
};

// exported part of container
export default function(element, options) {
	const containerIniter = Container(element);
	const container = containerIniter(options);
	element[containerInstance] = container;
	Mediator.register(container);
	return {
		setOptions: containerIniter,
		dispose: function() {
			Mediator.unregister(container);
			container.layout.dispose();
			container.dispose(container);
		}
	};
}
