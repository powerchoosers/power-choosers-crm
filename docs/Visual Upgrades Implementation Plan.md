Visual Upgrades Implementation Plan
Goal Description
Enhance the CRM's visual experience with two "2026-era" features:

Spotlight Border: A mouse-tracking radial gradient effect on interactive list items (.premium-borderline), creating a high-end "illuminated" feel.
Morphing Transitions: Using the View Transitions API to smoothly morph elements (avatars, titles) from list view to detail view, providing context and continuity.
User Review Required
NOTE

Spotlight effect relies on JavaScript mouse movement tracking. We will implement 
SpotlightManager
 to efficiently update CSS variables only when necessary. Morphing requires browser support for View Transitions (Chrome/Edge/Arc). Fallback is standard fade.

Proposed Changes
Styles
[MODIFY] 
main.css
Define --mouse-x and --mouse-y for spotlight.
Add .premium-borderline::before for the spotlight glow.
Add View Transition rules:
::view-transition-old(main-avatar), ::view-transition-new(main-avatar): Set animation-duration: 0.5s and timing functions.
::view-transition-old(main-title), ::view-transition-new(main-title): Smooth cross-fade and scale.
Update header components in Detail pages to have static view-transition-name values.
Scripts
[NEW] 
effects.js
Implement 
SpotlightManager
 class.
Listen for mousemove on .premium-borderline containers.
Update --mouse-x and --mouse-y styling on the target element.
Export global init function.
[MODIFY] 
main.js
Import/Initialize 
SpotlightManager
.
Enhance Navigation Logic:
Add assignMorphTargets(targetContainer) helper.
Update 
navigateToPage
 to accept an optional morphSource element.
Before startViewTransition, apply main-avatar and main-title to the source elements.
Ensure 
performNavigation
 adds them to destination elements.
[MODIFY] 
account-detail.js
 & 
contact-detail.js
Update 
renderAccountDetail
 and 
renderContactDetail
 templates to include view-transition-name on avatars and titles.
[MODIFY] 
layout.js
 (or wherever navigation logic primarily lives if not main.js)
Ensure generic navigation handlers support the new transition data attributes.
Verification Plan
Manual Verification
Spotlight:
Hover over "Suggested Leads", "Recent Activities", and "Contacts".
Verify a subtle gradient glow follows the mouse cursor along the border.
Ensure it does not stick or cause lag.
Morphing:
Click a Contact in the "Account Detail" list.
Verify the avatar flies to the header position of the new page.
Verify the name text morphs into the page title.
Verify backing out reverses the animation (if possible, or at least fades smoothly).

.
