---
inclusion: always
---

# Hover Effects

## Standard hover behavior
- **Color change only**: Slightly brighter/lighter color on hover
- **No underlines**: Never add text-decoration on hover
- **No bold text**: Never change font-weight on hover
- **No background changes**: For text links, only change text color
- **Smooth transition**: Use `transition: var(--transition-fast)` or `transition: color 0.2s ease`

## Interactive elements that should have hover effects
- Contact names (`.name-cell`, `.contact-link`)
- Company names (`.company-link`, `.acct-link`)
- Phone numbers (`.phone-link`, `.phone-cell`)
- Email addresses (`.email-link`)
- Navigation items (`.nav-item`)
- Clickable table cells
- Action buttons (`.qa-btn`, `.action-btn`)
- Form inputs and buttons

## CSS implementation
```css
/* Standard hover pattern for text links */
.interactive-text {
    color: var(--text-primary);
    text-decoration: none;
    cursor: pointer;
    transition: var(--transition-fast);
}

.interactive-text:hover {
    color: var(--text-inverse);
    text-decoration: none;
}

/* For phone numbers and emails specifically */
.phone-link:hover,
.email-link:hover {
    color: var(--text-inverse);
    text-decoration: none;
}
```

## Do not
- Do not add `text-decoration: underline` on hover
- Do not add `font-weight: bold` on hover
- Do not add background color changes for text links
- Do not use different hover colors per page - keep consistent
- Do not add hover effects to non-interactive elements

## Focus states
- Use `:focus-visible` for keyboard navigation
- Add subtle outline: `outline: 2px solid var(--orange-primary); outline-offset: 2px; border-radius: 2px;`
- Remove default focus outline: `outline: none;`

## Consistency check
- All clickable text should have the same hover behavior
- Hover effects should be subtle and professional
- Use CSS variables for colors to maintain consistency
- Test hover effects on all interactive elements across all pages