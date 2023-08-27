/// <reference types="Cypress" />

// this.swup holds the swup instance

const baseUrl = Cypress.config('baseUrl');

describe('Request', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should send the correct referer', function () {
		const referer = `${baseUrl}/page-1.html`;
		cy.intercept('GET', '/page-2.html').as('request');
		cy.triggerClickOnLink('/page-2.html');
		cy.wait('@request').its('request.headers.referer').should('eq', referer);
	});

	it('should send the correct request headers', function () {
		const expected = this.swup.options.requestHeaders;
		cy.intercept('GET', '/page-3.html').as('request');
		cy.triggerClickOnLink('/page-3.html');
		cy.wait('@request')
			.its('request.headers')
			.then((headers) => {
				Object.entries(expected).forEach(([header, value]) => {
					cy.wrap(headers).its(header.toLowerCase()).should('eq', value);
				});
			});
	});

	it('should force-load on server error', function () {
		cy.intercept('/error-500.html', { statusCode: 500, times: 1 });
		cy.shouldHaveReloadedAfterAction(() => {
			this.swup.navigate('/error-500.html');
		});
		cy.shouldBeAtPage('/error-500.html');
	});

	it('should force-load on network error', function () {
		cy.intercept('/error-network.html', { times: 1 }, { forceNetworkError: true });
		cy.shouldHaveReloadedAfterAction(() => {
			this.swup.navigate('/error-network.html');
		});
		cy.shouldBeAtPage('/error-network.html');
	});
});

describe('Page load', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should allow calling original page:load handler', function () {
		this.swup.hooks.replace('page:load', (visit, args, defaultHandler) => {
			return defaultHandler(visit, args);
		});
		this.swup.navigate('/page-2.html');

		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});

	it('should allow returning a page object to page:load', function () {
		let requested = false;
		cy.intercept('/page-2.html', (req) => {
			requested = true;
		});

		this.swup.hooks.replace('page:load', () => {
			return {
				url: '/page-3.html',
				html: '<html><body><div id="swup"><h1>Page 3</h1></div></body></html>'
			};
		});
		this.swup.navigate('/page-2.html');

		cy.shouldBeAtPage('/page-3.html');
		cy.shouldHaveH1('Page 3');
		cy.window().should(() => {
			expect(requested).to.be.false;
		});
	});

	it('should allow returning a fetch Promise to page:load', function () {
		this.swup.hooks.replace('page:load', () => {
			return this.swup.fetchPage('page-3.html');
		});
		this.swup.navigate('/page-2.html');

		cy.shouldBeAtPage('/page-3.html');
		cy.shouldHaveH1('Page 3');
	});
});

describe('Cache', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should cache pages', function () {
		this.swup.navigate('/page-2.html');
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.shouldHaveCacheEntry('/page-2.html');
	});

	it('should cache pages from absolute URLs', function () {
		this.swup.navigate(`${baseUrl}/page-2.html`);
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.shouldHaveCacheEntry('/page-2.html');
	});

	it('should not cache pages for POST requests', function () {
		this.swup.navigate(`${baseUrl}/page-2.html`, { method: 'POST' });
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.shouldNotHaveCacheEntry('/page-2.html');
	});

	it('should disable cache from swup options', function () {
		const cacheAccessed = { read: null, write: null };
		this.swup.options.cache = false;
		this.swup.hooks.on('page:load', (visit, { cache }) => {
			cacheAccessed.read = cache;
			cacheAccessed.write = this.swup.cache.has(visit.to.url);
		});

		cy.window().then(() => this.swup.navigate('/page-2.html'));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().then(() => this.swup.navigate('/page-1.html'));
		cy.shouldBeAtPage('/page-1.html', 'Page 1');
		cy.window().then(() => this.swup.navigate('/page-2.html'));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cacheAccessed.read).to.be.false);
		cy.window().should(() => expect(cacheAccessed.write).to.be.false);
	});

	it('should disable cache from navigation options', function () {
		const cacheAccessed = { read: {}, write: {} };
		this.swup.hooks.on('page:load', (visit, { cache }) => {
			cacheAccessed.read[visit.to.url] = cache;
			cacheAccessed.write[visit.to.url] = this.swup.cache.has(visit.to.url);
		});

		// Check disabling completely
		cy.window().then(() => this.swup.navigate('/page-2.html', { cache: false }));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cacheAccessed.read['/page-2.html']).to.be.false);
		cy.window().should(() => expect(cacheAccessed.write['/page-2.html']).to.be.false);

		// Check disabling writes
		cy.window().then(() => this.swup.navigate('/page-1.html', { cache: { write: false } }));
		cy.shouldBeAtPage('/page-1.html', 'Page 1');
		cy.window().should(() => expect(cacheAccessed.write['/page-1.html']).to.be.false);

		cy.window().then(() => this.swup.cache.clear());

		// Check disabling reads
		cy.window().then(() => this.swup.navigate('/page-2.html', { cache: { read: false } }));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cacheAccessed.read['/page-2.html']).to.be.false);
		cy.window().should(() => expect(cacheAccessed.write['/page-2.html']).to.be.true);
	});

	it('should disable cache in visit object', function () {
		const cacheAccessed = { read: {}, write: {} };
		this.swup.hooks.on('page:load', (visit, { cache }) => {
			cacheAccessed.read[visit.to.url] = cache;
			cacheAccessed.write[visit.to.url] = this.swup.cache.has(visit.to.url);
		});

		// Check disabling writes
		cy.window().then(() => {
			this.swup.hooks.once('visit:start', (visit) => visit.cache.write = false);
			this.swup.navigate('/page-2.html');
		});
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cacheAccessed.write['/page-2.html']).to.be.false);

		cy.window().then(() => this.swup.navigate('/page-1.html'));
		cy.shouldBeAtPage('/page-1.html', 'Page 1');
		cy.window().then(() => this.swup.navigate('/page-2.html'));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');

		// Check disabling reads
		cy.window().then(() => {
			this.swup.hooks.once('visit:start', (visit) => visit.cache.read = false);
			this.swup.navigate('/page-1.html', 'Page 1');
		});
		cy.shouldBeAtPage('/page-1.html');
		cy.window().should(() => expect(cacheAccessed.read['/page-1.html']).to.be.false);
	});

	// Passes locally, but not in CI. TODO: investigate

	it('should mark pages as cached in page:load', function () {
		let cached = null;
		this.swup.hooks.on('page:load', (visit, { cache }) => cached = cache);

		cy.window().then(() => this.swup.navigate('/page-2.html'));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cached).to.be.false);
		cy.window().then(() => this.swup.navigate('/page-1.html'));
		cy.shouldBeAtPage('/page-1.html', 'Page 1');
		cy.window().then(() => this.swup.navigate('/page-2.html'));
		cy.shouldBeAtPage('/page-2.html', 'Page 2');
		cy.window().should(() => expect(cached).to.be.true);
	});
});

describe('Markup', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should add swup class to html element', function () {
		cy.get('html').should('have.class', 'swup-enabled');
		cy.shouldHaveH1('Page 1');
	});

	it('should add animation classes to html', function () {
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldHaveAnimationLeaveClasses('html');
		cy.shouldNotHaveAnimationClasses('#swup'); // making sure
		cy.shouldHaveAnimationEnterClasses('html');
		cy.shouldNotHaveAnimationClasses('html');
	});

	it('should add animation classes to containers', function () {
		this.swup.options.animationScope = 'containers';
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldHaveAnimationLeaveClasses('#swup');
		cy.shouldNotHaveAnimationClasses('html'); // making sure
		cy.shouldHaveAnimationEnterClasses('#swup');
		cy.shouldNotHaveAnimationClasses('#swup');
	});

	it('should remove swup class from html tag', function () {
		this.swup.destroy();
		cy.get('html').should('not.have.class', 'swup-enabled');
	});
});

describe('Events', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should trigger custom dom events', function () {
		let triggered = false;
		let data = [];
		cy.document().then((document) => {
			document.addEventListener('swup:link:click', (event) => {
				triggered = true;
				data = event.detail;
			});
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.window().should(() => {
			expect(triggered, 'event was not triggered').to.be.true;
			expect(data).to.have.property('hook', 'link:click');
		});
	});

	it('should prevent the default click event', function () {
		let triggered = false;
		let prevented = false;
		cy.document().then((document) => {
			document.documentElement.addEventListener('click', (event) => {
				triggered = true;
				prevented = event.defaultPrevented;
			});
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.window().should(() => {
			expect(triggered, 'event was not triggered').to.be.true;
			expect(prevented, 'preventDefault() was not called').to.be.true;
		});
	});

	it('should trigger a custom click event', function () {
		const handlers = { click() {} };
		cy.spy(handlers, 'click');

		this.swup.hooks.on('link:click', handlers.click);
		cy.triggerClickOnLink('/page-2.html');
		cy.window().should(() => {
			expect(handlers.click).to.be.called;
		});
	});

	it('should remove custom event handlers', function () {
		const handlers = { transition() {}, content() {} };
		cy.spy(handlers, 'transition');
		cy.spy(handlers, 'content');

		this.swup.hooks.on('visit:start', handlers.transition);
		this.swup.hooks.on('content:replace', handlers.content);

		cy.triggerClickOnLink('/page-2.html');
		cy.window().should(() => {
			expect(handlers.transition).to.be.calledOnce;
			expect(handlers.content).to.be.calledOnce;
		});

		cy.window().then(() => {
			this.swup.hooks.off('visit:start', handlers.transition);
		});
		cy.triggerClickOnLink('/page-3.html');
		cy.window().should(() => {
			expect(handlers.transition).to.be.calledOnce;
			expect(handlers.content).to.be.calledTwice;
		});
	});
});

describe('Animation timing', function () {
	it('should detect animation timing', function () {
		cy.visit('/animation-duration.html');
		cy.shouldAnimateWithDuration(400);
	});

	it('should detect complex animation timing', function () {
		cy.visit('/animation-complex.html');
		cy.shouldAnimateWithDuration(600);
	});

	it('should warn about missing animation timing', function () {
		cy.visit('/animation-none.html', {
			onBeforeLoad: (win) => cy.stub(win.console, 'warn').as('consoleWarn')
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
		cy.get('@consoleWarn').should(
			'be.calledOnceWith',
			'[swup] No CSS animation duration defined on elements matching `[class*="transition-"]`'
		);
	});

	it('should not warn about partial animation timing', function () {
		cy.visit('/animation-partial.html', {
			onBeforeLoad: (win) => cy.stub(win.console, 'warn').as('consoleWarn')
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
		cy.get('@consoleWarn').should('have.callCount', 0);
	});

	it('should detect keyframe timing', function () {
		cy.visit('/animation-keyframes.html');
		cy.shouldAnimateWithDuration(700);
	});
});

describe('Navigation', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should navigate to other pages', function () {
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');

		cy.wait(200); // Wait for animation finish
		cy.triggerClickOnLink('/page-3.html');
		cy.shouldBeAtPage('/page-3.html');
		cy.shouldHaveH1('Page 3');
	});

	it('should navigate if no animation selectors defined', function () {
		this.swup.options.animationSelector = false;
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});

	it('should navigate if no CSS animation is defined', function () {
		cy.visit('/animation-none.html');
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});

	it('should ignore visit if a new visit has started', function() {
		cy.delayRequest('/page-2.html', 1000);
		cy.triggerClickOnLink('/page-2.html');
		cy.wait(50);
		cy.triggerClickOnLink('/page-3.html');
		cy.shouldBeAtPage('/page-3.html', 'Page 3');
		cy.wait(1000);
		cy.shouldBeAtPage('/page-3.html', 'Page 3');
	});

	it('should ignore visit if a new visit to same URL has started', function() {
		const titles = [];
		this.swup.options.linkToSelf = 'navigate';
		this.swup.hooks.on('visit:start', (visit) => titles.push(visit.id));
		this.swup.hooks.on('content:replace', () => document.title = titles[titles.length - 1]);

		cy.delayRequest('/page-2.html', 500);
		cy.triggerClickOnLink('/page-2.html');
		cy.wait(50);
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html', titles[1]);
		cy.wait(500);
		cy.shouldBeAtPage('/page-2.html', titles[1]);
	});

	// it('should ignore visit when meta key pressed', function() {
	//     cy.triggerClickOnLink('/page-2.html', { metaKey: true });
	//     cy.wait(200);
	//     cy.shouldBeAtPage('/page-1.html');
	//     cy.shouldHaveH1('Page 1');
	// });
});

describe('Link resolution', function () {
	beforeEach(() => {
		cy.visit('/link-resolution.html');
		cy.wrapSwupInstance();
	});

	it('should skip links to different origins', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('[data-test-id=nav-link-ext]').click();
		});
		cy.location().should((location) => {
			expect(location.origin).to.eq('https://example.net');
		});
	});

	it('should follow relative links', function () {
		cy.get('[data-test-id=nav-link-rel]').click();
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});

	it('should resolve document base URLs', function () {
		cy.visit('/nested/nested-1.html');
		cy.get('[data-test-id=nav-link-sub]').click();
		cy.shouldBeAtPage('/nested/nested-2.html');
		cy.shouldHaveH1('Nested Page 2');
	});

	it('should reset scroll when clicking link to same page', function () {
		let navigated = false;
		cy.window().then(() => {
			this.swup.hooks.once('visit:start', () => (navigated = true));
		});
		cy.scrollTo(0, 200);
		cy.window().its('scrollY').should('equal', 200);
		cy.get('[data-testid=nav-link-self]').click();
		cy.window().its('scrollY').should('equal', 0);
		cy.window().should(() => {
			expect(navigated).to.be.false;
		});
	});

	it('should navigate to same page if configured via linkToSelf option', function () {
		let navigated = false;
		cy.window().then(() => {
			this.swup.options.linkToSelf = 'navigate';
			this.swup.hooks.once('visit:start', () => (navigated = true));
		});
		cy.scrollTo(0, 200);
		cy.window().its('scrollY').should('equal', 200);
		cy.get('[data-testid=nav-link-self]').click();
		cy.window().its('scrollY').should('equal', 0);
		cy.window().should(() => {
			expect(navigated).to.be.true;
		});
	});

});

describe('Redirects', function () {
	beforeEach(() => {
		cy.intercept('GET', '/redirect-2.html', (req) => {
			req.redirect('/redirect-3.html', 302);
		});
		cy.visit('/redirect-1.html');
	});

	it('should follow redirects', function () {
		cy.triggerClickOnLink('/redirect-2.html');
		cy.shouldBeAtPage('/redirect-3.html');
		cy.shouldHaveH1('Redirect 3');
	});

	it('should not cache redirects', function () {
		cy.triggerClickOnLink('/redirect-2.html');
		cy.shouldBeAtPage('/redirect-3.html');
		cy.shouldHaveH1('Redirect 3');
		cy.shouldHaveCacheEntries([]);
	});
});

describe('Ignoring visits', function () {
	beforeEach(() => {
		cy.visit('/ignore-visits.html');
		cy.wrapSwupInstance();
	});

	it('should ignore links with data-no-swup attr', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('[data-test-id="ignore-element"]').first().click();
		});
		cy.shouldBeAtPage('/page-2.html');
	});

	it('should ignore links with data-no-swup parent', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('[data-test-id="ignore-parent"]').first().click();
		});
		cy.shouldBeAtPage('/page-2.html');
	});

	it('should ignore links via custom ignored path', function () {
		this.swup.options.ignoreVisit = (url) => url.endsWith('#hash');
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('[data-test-id="ignore-path-end"]').first().click();
		});
		cy.shouldBeAtPage('/page-2.html#hash');
	});

	it('should ignore visits in swup.navigate', function () {
		this.swup.options.ignoreVisit = (url) => true;
		cy.shouldHaveReloadedAfterAction(() => {
			this.swup.navigate('/page-2.html');
		});
		cy.shouldBeAtPage('/page-2.html');
	});
});

describe('Link selector', function () {
	beforeEach(() => {
		cy.visit('/link-selector.html');
		cy.wrapSwupInstance();
	});

	it('should ignore SVG links by default', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('svg a').first().click();
		});
		cy.shouldBeAtPage('/page-2.html');
	});

	it('should follow SVG links when added to selector', function () {
		this.swup.options.linkSelector = 'a[href], svg a[*|href]';
		cy.get('svg a').first().click();
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});

	it('should ignore map area links by default', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			cy.get('map area').first().click({ force: true });
		});
		cy.shouldBeAtPage('/page-2.html');
	});

	it('should follow map area links when added to selector', function () {
		this.swup.options.linkSelector = 'a[href], map area[href]';
		cy.get('map area').first().click({ force: true });
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});
});

describe('Resolve URLs', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should ignore links for equal resolved urls', function () {
		this.swup.options.resolveUrl = () => '/page-1.html';
		cy.triggerClickOnLink('/page-2.html');
		cy.wait(200);
		cy.shouldBeAtPage('/page-1.html');
	});

	it('should skip popstate handling for equal resolved urls', function () {
		this.swup.options.resolveUrl = () => '/page-1.html';
		cy.pushHistoryState('/pushed-page-1/');
		cy.pushHistoryState('/pushed-page-2/');
		cy.wait(500).then(() => {
			window.history.back();
			cy.shouldBeAtPage('/pushed-page-1/');
			cy.shouldHaveH1('Page 1');
		});
	});
});

describe('History', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should create a new history state on visit', function () {
		cy.visit('/history.html');

		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');

		cy.get('[data-test-id=create-link]').first().click();
		cy.shouldBeAtPage('/page-3.html');
		cy.window().then((window) => {
			window.history.back();
			cy.window().should(() => {
				expect(window.history.state.url).to.equal('/page-2.html');
			});
		});
	});

	it('should replace the current history state via data attribute', function () {
		cy.visit('/history.html');

		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');

		cy.get('[data-test-id=update-link]').first().click();
		cy.shouldBeAtPage('/page-3.html');
		cy.window().then((window) => {
			window.history.back();
			cy.window().should(() => {
				expect(window.history.state.url).to.equal('/history.html');
			});
		});
	});

	it('should replace the current history state via API', function () {
		cy.window().then(() => {
			this.swup.navigate('/page-2.html');
		});
		cy.shouldBeAtPage('/page-2.html');
		cy.window().then(() => {
			this.swup.navigate('/page-3.html', { history: 'replace' });
		});
		cy.shouldBeAtPage('/page-3.html');
		cy.window().then((window) => {
			window.history.back();
			cy.window().should(() => {
				expect(window.history.state.url).to.equal('/page-1.html');
			});
		});
	});

	it('should navigate to previous page on popstate', function () {
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');

		cy.window().then((window) => {
			window.history.back();
			cy.shouldBeAtPage('/page-1.html');
			cy.shouldHaveH1('Page 1');
		});
	});

	it('should navigate to next page on popstate', function () {
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');

		cy.window().then((window) => {
			window.history.back();
			window.history.forward();
			cy.shouldBeAtPage('/page-2.html');
			cy.shouldHaveH1('Page 2');
		});
	});

	it('should save state into the history', function () {
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');

		cy.window().then((window) => {
			window.history.back();
			cy.window().should(() => {
				expect(window.history.state.url, 'page url not saved').to.equal('/page-1.html');
				expect(window.history.state.source, 'state source not saved').to.equal('swup');
			});
		});
	});

	it('should calculate the travel direction of history visits', function () {
		let direction = null;
		this.swup.hooks.on('history:popstate', (visit) => {
			direction = visit.history.direction;
		});

		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html', 'Page 2');

		cy.window().then((window) => window.history.back());
		cy.window().should(() => expect(direction).to.equal('backwards'));

		cy.shouldBeAtPage('/page-1.html', 'Page 1');

		cy.window().then((window) => window.history.forward());
		cy.window().should(() => expect(direction).to.equal('forwards'));

		cy.triggerClickOnLink('/page-3.html');
		cy.shouldBeAtPage('/page-3.html', 'Page 3');

		cy.window().then((window) => window.history.go(-2));
		cy.window().should(() => expect(direction).to.equal('backwards'));
	});

	it('should trigger a custom popstate event', function () {
		const handlers = { popstate() {} };
		cy.spy(handlers, 'popstate');

		this.swup.hooks.on('history:popstate', handlers.popstate);

		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');

		cy.window().then((window) => window.history.back());
		cy.window().should(() => expect(handlers.popstate).to.be.called);
	});

	it('should skip popstate handling for foreign state entries', function () {
		cy.pushHistoryState('/page-2.html', { source: 'not-swup' });
		cy.pushHistoryState('/page-3.html', { source: 'not-swup' });
		cy.window().then((window) => {
			window.history.back();
			cy.shouldBeAtPage('/page-2.html');
			cy.shouldHaveH1('Page 1');
		});
	});
});

describe('API', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('should navigate to pages using swup API', function () {
		this.swup.navigate('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
	});
});

describe('Visit context', function () {
	beforeEach(() => {
		cy.visit('/page-1.html');
		cy.wrapSwupInstance();
	});

	it('has the current and next url', function () {
		let from = '';
		let to = '';
		this.swup.hooks.before('visit:start', (visit) => {
			from = visit.from.url;
			to = visit.to.url;
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.window().should(() => {
			expect(from).to.eq('/page-1.html');
			expect(to).to.eq('/page-2.html');
		});
	});

	it('has the correct current url on history visits', function () {
		let from = '';
		let to = '';
		this.swup.hooks.before('visit:start', (visit) => {
			from = visit.from.url;
			to = visit.to.url;
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.shouldBeAtPage('/page-2.html');
		cy.shouldHaveH1('Page 2');
		cy.window().then((window) => {
			window.history.back();
			cy.shouldBeAtPage('/page-1.html');
			cy.shouldHaveH1('Page 1');
			cy.window().should(() => {
				expect(from).to.eq('/page-2.html');
				expect(to).to.eq('/page-1.html');
			});
		});
	});

	it('passes along the click trigger and event', function () {
		let el = null;
		let event = null;
		this.swup.hooks.before('visit:start', (visit) => {
			el = visit.trigger.el;
			event = visit.trigger.event;
		});
		cy.triggerClickOnLink('/page-2.html');
		cy.window().should((win) => {
			expect(el).to.be.instanceof(win.HTMLAnchorElement);
			expect(event).to.be.instanceof(win.MouseEvent);
		});
	});

	it('passes along the popstate status and event', function () {
		let event = null;
		let historyVisit = null;
		this.swup.hooks.before('visit:start', (visit) => {
			event = visit.trigger.event;
			historyVisit = visit.history.popstate;
		});
		cy.window().then(() => {
			this.swup.navigate('/page-2.html');
		});
		cy.shouldBeAtPage('/page-2.html');
		cy.window().then((window) => window.history.back());
		cy.shouldBeAtPage('/page-1.html');
		cy.window().should((win) => {
			expect(event).to.be.instanceof(win.PopStateEvent);
			expect(historyVisit).to.be.true;
		});
	});

	it('passes along the custom animation', function () {
		let name = null;
		let expectedName = null;
		this.swup.hooks.before('visit:start', (visit) => {
			name = visit.animation.name;
		});
		cy.get('a[data-swup-animation]').should(($el) => {
			expect($el.length).to.be.at.least(1);
			expectedName = $el.first().attr('data-swup-animation');
			expect(expectedName).to.eq('custom');
		});
		cy.get('a[data-swup-animation]').click();
		cy.window().should(() => {
			expect(name).to.eq(expectedName);
		});
	});

	it('should allow disabling animations', function () {
		this.swup.hooks.before('visit:start', (visit) => {
			visit.animation.animate = false;
		});
		cy.shouldAnimateWithDuration(0, '/page-2.html');
	});
});

describe('Containers', function () {
	beforeEach(() => {
		cy.visit('/containers-1.html');
		cy.wrapSwupInstance();
	});

	it('should be customizable from context', function () {
		this.swup.hooks.before('visit:start', (visit) => {
			visit.containers = ['#aside'];
		});
		this.swup.navigate('/containers-2.html', { animate: false });
		cy.get('h1').should('contain', 'Containers 1');
		cy.get('h2').should('contain', 'Heading 2');
	});

	it('should be customizable from hook context', function () {
		this.swup.hooks.before('content:replace', (visit) => {
			visit.containers = ['#main'];
		});
		this.swup.navigate('/containers-2.html', { animate: false });
		cy.get('h1').should('contain', 'Containers 2');
		cy.get('h2').should('contain', 'Heading 1');
	});

	it('should force-load on container mismatch', function () {
		cy.shouldHaveReloadedAfterAction(() => {
			this.swup.navigate('/containers-missing.html');
		});
		cy.shouldBeAtPage('/containers-missing.html');
	});
});

describe('Persist', function () {
	beforeEach(() => {
		cy.visit('/persist-1.html');
		cy.wrapSwupInstance();
	});

	it('should persist elements across page loads', function () {
		let state = Math.random();
		let newState = Math.random();
		cy.get('[data-testid="persisted"]').then(($el) => {
			$el[0].__state = state;
			this.swup.navigate('/persist-2.html', { animate: false });
		});
		cy.shouldBeAtPage('/persist-2.html', 'Persist 2');
		cy.get('[data-testid="persisted"]').should('contain', 'Persist 1');
		cy.get('[data-testid="unpersisted"]').should('contain', 'Persist 2');
		cy.get('[data-testid="persisted"]').then(($el) => {
			newState = $el[0].__state;
			expect(state).to.eq(newState);
		});
	});
});

describe('Scrolling', function () {
	beforeEach(() => {
		cy.visit('/scrolling-1.html');
		cy.wrapSwupInstance();
	});

	it('should scroll to hash element and back to top', function () {
		cy.get('[data-test-id=link-to-anchor]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor]');

		cy.triggerClickOnLink('/page-1.html');
		cy.window().should((window) => {
			expect(window.scrollY).equal(0);
		});
	});

	it('should scroll to anchor with path', function () {
		cy.get('[data-test-id=link-to-self-anchor]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor]');
	});

	it('should scroll to top', function () {
		cy.get('[data-test-id=link-to-self-anchor]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor]');
		cy.get('[data-test-id=link-to-top]').click();
		cy.window().should((window) => {
			expect(window.scrollY).equal(0);
		});
	});

	it('should scroll to id-based anchor', function () {
		cy.get('[data-test-id=link-to-anchor-by-id]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-by-id]');
	});

	it('should scroll to name-based anchor', function () {
		cy.get('[data-test-id=link-to-anchor-by-name]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-by-name]');
	});

	it('should prefer undecoded id attributes', function () {
		cy.get('[data-test-id=link-to-anchor-encoded]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-encoded]');
	});

	it('should accept unencoded anchor links', function () {
		cy.get('[data-test-id=link-to-anchor-unencoded]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-unencoded]');
	});

	it('should scroll to anchor with special characters', function () {
		cy.get('[data-test-id=link-to-anchor-with-colon]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-with-colon]');
		cy.get('[data-test-id=link-to-anchor-with-unicode]').click();
		cy.shouldHaveElementInViewport('[data-test-id=anchor-with-unicode]');
	});

	it('should scroll to requested hash after navigation', function () {
		cy.get('[data-test-id=link-to-page-anchor]').click();
		cy.shouldBeAtPage('/scrolling-2.html#anchor');
		cy.shouldHaveH1('Scrolling 2');
		cy.shouldHaveElementInViewport('[data-test-id=anchor]');
	});

	it('should append the hash if changing visit.to.hash on the fly', function () {
		cy.window().then(() => {
			this.swup.hooks.once('visit:start', (visit) => (visit.to.hash = '#anchor'));
		});
		cy.get('[data-testid=link-to-page]').click();
		cy.shouldBeAtPage('/scrolling-2.html#anchor');
		cy.shouldHaveH1('Scrolling 2');
		cy.shouldHaveElementInViewport('[data-testid=anchor]');
	});

	it('should not append the hash if changing visit.scroll.target on the fly', function () {
		cy.window().then(() => {
			this.swup.hooks.once('visit:start', (visit) => (visit.scroll.target = '#anchor'));
		});
		cy.get('[data-testid=link-to-page]').click();
		cy.shouldBeAtPage('/scrolling-2.html');
		cy.shouldHaveH1('Scrolling 2');
		cy.shouldHaveElementInViewport('[data-testid=anchor]');
	});
});
