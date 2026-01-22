I have identified the cause of the "zoom in" and "flicker" issues:
1.  **Staggered Animations**: The Recent Calls list items (`.rc-item`) have `animation-delay` styles injected by JavaScript, which triggers a re-render of their entrance animation whenever the list updates or the view transitions from skeleton to real data.
2.  **Global Entrance Animations**: Elements like `.modern-reveal` (which uses `scaleFadeIn`) or `.rc-item.rc-new` have entrance animations that fire when they are inserted into the DOM. When we swap the skeleton for the real content, these animations run *on top of* the smooth cross-fade I implemented, causing the "flicker" and "zoom" effect.

**The Solution:**
I will disable these "internal" entrance animations when the content is inside the `td-real-layer`. This ensures that the *only* motion is the smooth cross-fade of the entire layer, while the content inside remains static and stable.

**Plan:**
1.  **Modify `styles/main.css`**:
    *   Add a CSS rule to forcibly disable animations for key elements (`.rc-item`, `.task-card`, `.activity-item`) when they are inside the `.td-real-layer`. This prevents them from "popping" or "zooming" in again.
2.  **Modify `scripts/pages/task-detail.js`**:
    *   Remove the `animation-delay` inline style from the Recent Calls items generator (`taskRcItemHtml`). This removes the staggered "zipper" effect which contributes to the visual noise during loading.

This approach directly addresses the "animation rerender" root cause you identified.