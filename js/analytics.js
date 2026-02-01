/**
 * DailyScalper Analytics Tracking
 * Shared tracking code for all pages
 */
(function() {
    'use strict';

    var page = window.location.pathname.includes('diary') ? 'diary' : 'index';

    // Track CTA button clicks with specific destination detection
    document.querySelectorAll('a.vbes').forEach(function(link) {
        link.addEventListener('click', function() {
            var href = this.href || '';
            var destination = 'unknown';
            var eventName = 'cta_click';

            if (href.includes('my.roboforex.com/en/copyfx')) {
                destination = 'roboforex_copy_page';
                eventName = 'roboforex_copy_click';
            } else if (href.includes('my.roboforex.com')) {
                destination = 'roboforex_register';
                eventName = 'roboforex_register_click';
            }

            gtag('event', eventName, {
                'event_category': 'CTA',
                'event_label': this.textContent.trim().substring(0, 50),
                'link_url': href,
                'link_destination': destination,
                'page': page
            });
        });
    });

    // Track MyFxBook verification links
    document.querySelectorAll('a[href*="myfxbook"]').forEach(function(link) {
        link.addEventListener('click', function() {
            gtag('event', 'myfxbook_click', {
                'event_category': 'External Link',
                'event_label': 'MyFxBook Verification',
                'link_url': this.href,
                'link_destination': 'myfxbook',
                'page': page
            });
        });
    });

    // Track cookie consent button clicks
    var acceptBtn = document.getElementById('cookie-accept');
    var declineBtn = document.getElementById('cookie-decline');

    if (acceptBtn) {
        acceptBtn.addEventListener('click', function() {
            gtag('event', 'cookie_consent', {
                'event_category': 'Cookie Consent',
                'event_label': 'Accepted',
                'page': page
            });
        });
    }

    if (declineBtn) {
        declineBtn.addEventListener('click', function() {
            gtag('event', 'cookie_consent', {
                'event_category': 'Cookie Consent',
                'event_label': 'Declined',
                'page': page
            });
        });
    }

    // Track mobile menu toggle
    var mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            gtag('event', 'menu_toggle', {
                'event_category': 'Navigation',
                'event_label': 'Mobile Menu',
                'page': page
            });
        });
    }

    // Track ALL link clicks (excluding already tracked ones)
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a');
        if (!link) return;

        // Skip links already tracked with specific events
        if (link.classList.contains('vbes')) return;
        if (link.href && link.href.includes('myfxbook')) return;

        var href = link.href || '';
        var isExternal = href && !href.includes(window.location.hostname) && href.startsWith('http');
        var linkText = link.textContent.trim().substring(0, 50) || link.getAttribute('aria-label') || 'No text';

        gtag('event', 'link_click', {
            'event_category': isExternal ? 'External Link' : 'Internal Link',
            'event_label': linkText,
            'link_url': href,
            'page': page
        });
    });

    // Scroll Depth Tracking
    var scrollThresholds = [25, 50, 75, 100];
    var scrollTracked = {};
    window.addEventListener('scroll', function() {
        var scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
        scrollThresholds.forEach(function(threshold) {
            if (scrollPercent >= threshold && !scrollTracked[threshold]) {
                scrollTracked[threshold] = true;
                gtag('event', 'scroll_depth', {
                    'event_category': 'Engagement',
                    'event_label': threshold + '%',
                    'scroll_percentage': threshold,
                    'page': page
                });
            }
        });
    });

    // Time on Page Tracking
    var timeThresholds = [30, 60, 120, 300]; // seconds
    var timeTracked = {};
    var startTime = Date.now();
    setInterval(function() {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        timeThresholds.forEach(function(threshold) {
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
        });
    }, 5000);

    // Copy Text Tracking
    document.addEventListener('copy', function(e) {
        var selectedText = window.getSelection().toString().trim();
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
