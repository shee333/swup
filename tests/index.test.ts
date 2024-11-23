import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	query,
	queryAll,
	nextTick,
	isPromise,
	runAsPromise,
	forceReflow,
	getContextualAttr
} from '../src/utils/index';

// Set up JSDOM environment for tests that require the DOM
beforeEach(() => {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
	global.document = dom.window.document;
	global.window = dom.window;
	global.HTMLElement = dom.window.HTMLElement;
	global.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
});

describe('query', () => {
	it('should return the first element matching the selector', () => {
		document.body.innerHTML = `<div class="test"></div><div class="test"></div>`;
		const element = query('.test');
		expect(element).toBeInstanceOf(HTMLElement);
		expect(element).toBe(document.querySelector('.test'));
	});

	it('should return null if no element matches the selector', () => {
		document.body.innerHTML = `<div class="test"></div>`;
		const element = query('.nonexistent');
		expect(element).toBeNull();
	});
});

describe('queryAll', () => {
	it('should return all elements matching the selector', () => {
		document.body.innerHTML = `<div class="test"></div><div class="test"></div>`;
		const elements = queryAll('.test');
		expect(elements).toHaveLength(2);
		elements.forEach((el) => expect(el).toBeInstanceOf(HTMLElement));
	});

	it('should return an empty array if no elements match the selector', () => {
		document.body.innerHTML = `<div class="test"></div>`;
		const elements = queryAll('.nonexistent');
		expect(elements).toEqual([]);
	});
});

describe('nextTick', () => {
	it('should resolve after the next event loop', async () => {
		const spy = vi.fn();
		nextTick().then(spy);
		expect(spy).not.toHaveBeenCalled();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(spy).toHaveBeenCalled();
	});
});

describe('isPromise', () => {
	it('should return true for Promise objects', () => {
		expect(isPromise(Promise.resolve())).toBe(true);
	});

	it('should return true for thenable objects', () => {
		const thenable = { then: () => {} };
		expect(isPromise(thenable)).toBe(true);
	});

	it('should return false for non-Promise objects', () => {
		expect(isPromise({})).toBe(false);
		expect(isPromise(null)).toBe(false);
		expect(isPromise(undefined)).toBe(false);
	});
});

describe('runAsPromise', () => {
	it('should resolve with the return value of a synchronous function', async () => {
		const result = await runAsPromise(() => 42);
		expect(result).toBe(42);
	});

	it('should resolve with the resolved value of an asynchronous function', async () => {
		const asyncFunc = () => Promise.resolve('async result');
		const result = await runAsPromise(asyncFunc);
		expect(result).toBe('async result');
	});

	it('should reject if the function throws an error', async () => {
		const errorFunc = () => {
			throw new Error('error');
		};
		await expect(runAsPromise(errorFunc)).rejects.toThrow('error');
	});

	it('should reject if the promise returned by the function rejects', async () => {
		const asyncErrorFunc = () => Promise.reject(new Error('async error'));
		await expect(runAsPromise(asyncErrorFunc)).rejects.toThrow('async error');
	});
});

describe('forceReflow', () => {
	it('should force a reflow on the given element', () => {
		const element = document.createElement('div');
		document.body.appendChild(element);
		const spy = vi.spyOn(element, 'getBoundingClientRect');
		forceReflow(element);
		expect(spy).toHaveBeenCalled();
	});

	it('should force a reflow on the document body if no element is provided', () => {
		const spy = vi.spyOn(document.body, 'getBoundingClientRect');
		forceReflow();
		expect(spy).toHaveBeenCalled();
	});
});

describe('getContextualAttr', () => {
	it('should return the attribute value from the closest element', () => {
		document.body.innerHTML = `<div data-attr="value"><span id="child"></span></div>`;
		const child = document.getElementById('child');
		const attr = getContextualAttr(child, 'data-attr');
		expect(attr).toBe('value');
	});

	it('should return true if the attribute is present without a value', () => {
		document.body.innerHTML = `<div data-attr><span id="child"></span></div>`;
		const child = document.getElementById('child');
		const attr = getContextualAttr(child, 'data-attr');
		expect(attr).toBe(true);
	});

	it('should return undefined if no element with the attribute is found', () => {
		document.body.innerHTML = `<div><span id="child"></span></div>`;
		const child = document.getElementById('child');
		const attr = getContextualAttr(child, 'data-attr');
		expect(attr).toBeUndefined();
	});
});
