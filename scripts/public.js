/**
 * Power Choosers - Public Website JavaScript
 * Shared functionality across all public-facing pages
 */

(function () {
    'use strict';

    // ===========================
    // HEADER SCROLL EFFECT
    // Add .scrolled class to header when user scrolls
    // ===========================
    function initHeaderScrollEffect() {
        const header = document.querySelector('.site-header');
        if (!header) {
            console.log('[Public.js] Header not found');
            return;
        }

        console.log('[Public.js] Header scroll effect initialized');

        let lastScrollY = window.scrollY;
        let ticking = false;

        function updateHeader() {
            const scrollY = window.scrollY;

            // Add scrolled class when user has scrolled more than 5px (lowered from 10px)
            if (scrollY > 5) {
                header.classList.add('scrolled');
                console.log('[Public.js] Scrolled class added at', scrollY, 'px');
            } else {
                header.classList.remove('scrolled');
            }

            lastScrollY = scrollY;
            ticking = false;
        }

        function requestTick() {
            if (!ticking) {
                window.requestAnimationFrame(updateHeader);
                ticking = true;
            }
        }

        // Listen for scroll events
        window.addEventListener('scroll', requestTick, { passive: true });

        // Initial check
        updateHeader();
    }

    // ===========================
    // MOBILE NAVIGATION TOGGLE
    // ===========================
    function initMobileNav() {
        const navToggle = document.getElementById('nav-toggle');
        const navLinks = document.querySelector('.nav-links');

        if (!navToggle || !navLinks) return;

        // Toggle menu
        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
        });

        // Close menu when clicking a link or button
        navLinks.addEventListener('click', (e) => {
            const target = e.target;
            if (target instanceof Element && (target.matches('a') || target.matches('button'))) {
                navLinks.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navLinks.contains(e.target) && !navToggle.contains(e.target) && navLinks.classList.contains('open')) {
                navLinks.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ===========================
    // SCROLL ANIMATIONS
    // Reveal elements as they come into viewport
    // ===========================
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe all elements with .animate-on-scroll class
        const animatedElements = document.querySelectorAll('.animate-on-scroll');
        animatedElements.forEach(el => observer.observe(el));
    }

    // ===========================
    // INITIALIZE ON DOM READY
    // ===========================
    function init() {
        initHeaderScrollEffect();
        initMobileNav();
        initScrollAnimations();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
