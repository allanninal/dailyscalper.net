(function () {
    'use strict';

    if (typeof window.gtag !== 'function') return;

    // Derive a page label from location so every event carries page context
    var page = (function () {
        var path = location.pathname;
        if (path === '/' || path === '/index.html') return 'home';
        if (path === '/diary.html' || path === '/diary') return 'diary';
        if (path === '/404.html' || path === '/404') return '404';
        if (path === '/blog/' || path === '/blog/index.html') return 'blog_index';
        if (path.indexOf('/blog/') === 0) return 'blog_post';
        return path;
    })();

    // --- CTA click tracking: detect conversion URLs on ANY link (class-agnostic) ---
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a');
        if (!link || !link.href) return;
        var href = link.href;

        var eventName = null;
        var destination = null;
        if (href.indexOf('roboforex.com/ph/copy-trading') !== -1 ||
            href.indexOf('my.roboforex.com/en/copyfx') !== -1) {
            eventName = 'roboforex_copy_click';
            destination = 'roboforex_copy_page';
        } else if (href.indexOf('my.roboforex.com') !== -1) {
            eventName = 'roboforex_register_click';
            destination = 'roboforex_register';
        }
        if (!eventName) return;

        gtag('event', eventName, {
            'event_category': 'CTA',
            'event_label': (link.textContent || '').trim().substring(0, 50),
            'link_url': href,
            'link_destination': destination,
            'page': page,
            'value': 100,
            'currency': 'USD'
        });
    }, true);

    // --- MyFxBook verification clicks ---
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a[href*="myfxbook"]');
        if (!link) return;
        gtag('event', 'myfxbook_click', {
            'event_category': 'External Link',
            'event_label': 'MyFxBook Verification',
            'link_url': link.href,
            'link_destination': 'myfxbook',
            'page': page
        });
    }, true);

    // --- Generic internal link_click (GA4 Enhanced Measurement already handles outbound) ---
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a');
        if (!link || !link.href) return;
        var href = link.href;

        // Skip links already tracked with specific events
        if (href.indexOf('roboforex.com') !== -1) return;
        if (href.indexOf('myfxbook') !== -1) return;

        // Skip external links — GA4 Enhanced Measurement "Outbound clicks" covers them
        var isExternal = href.indexOf(location.hostname) === -1 && href.indexOf('http') === 0;
        if (isExternal) return;

        var linkText = (link.textContent || '').trim().substring(0, 50) ||
            link.getAttribute('aria-label') || 'No text';
        gtag('event', 'link_click', {
            'event_category': 'Internal Link',
            'event_label': linkText,
            'link_url': href,
            'page': page
        });
    }, true);

    // --- Mobile menu toggle (no-op if absent) ---
    var mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function () {
            gtag('event', 'menu_toggle', {
                'event_category': 'Navigation',
                'event_label': 'Mobile Menu',
                'page': page
            });
        });
    }

    // --- Scroll depth (rAF-throttled, passive listener) ---
    var scrollThresholds = [25, 50, 75, 100];
    var scrollTracked = {};
    var scrollPending = false;
    window.addEventListener('scroll', function () {
        if (scrollPending) return;
        scrollPending = true;
        requestAnimationFrame(function () {
            scrollPending = false;
            var docHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (docHeight <= 0) return;
            var scrollPercent = Math.round((window.scrollY / docHeight) * 100);
            for (var i = 0; i < scrollThresholds.length; i++) {
                var threshold = scrollThresholds[i];
                if (scrollPercent >= threshold && !scrollTracked[threshold]) {
                    scrollTracked[threshold] = true;
                    gtag('event', 'scroll_depth', {
                        'event_category': 'Engagement',
                        'event_label': threshold + '%',
                        'scroll_percentage': threshold,
                        'page': page
                    });
                }
            }
        });
    }, { passive: true });

    // --- Time on page milestones ---
    var timeThresholds = [30, 60, 120, 300];
    var timeTracked = {};
    var startTime = Date.now();
    setInterval(function () {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        for (var i = 0; i < timeThresholds.length; i++) {
            var threshold = timeThresholds[i];
            if (elapsed >= threshold && !timeTracked[threshold]) {
                timeTracked[threshold] = true;
                var label = threshold < 60 ? threshold + 's' : Math.floor(threshold / 60) + 'm';
                gtag('event', 'time_on_page', {
                    'event_category': 'Engagement',
                    'event_label': label,
                    'time_seconds': threshold,
                    'page': page
                });
            }
        }
    }, 5000);

    // --- Copy-text tracking ---
    document.addEventListener('copy', function () {
        var selectedText = window.getSelection ? window.getSelection().toString().trim() : '';
        if (selectedText.length > 0) {
            gtag('event', 'copy_text', {
                'event_category': 'Engagement',
                'event_label': selectedText.substring(0, 100),
                'text_length': selectedText.length,
                'page': page
            });
        }
    });
})();
