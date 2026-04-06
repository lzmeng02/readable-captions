# UI Design Guidelines (Bilibili Native Style)

## Agent Instructions

You are generating UI code for a browser extension embedded within Bilibili.com.

Your ultimate goal is to make the injected UI feel visually native to Bilibili's right-side panel environment.
It should look like it belongs next to Bilibili's own sidebar modules, not like a generic browser popup or admin dashboard.

Always adhere strictly to the following design tokens and rules.

Do not hallucinate styles.
Do not add heavy shadows.
Do not use large border radii.
Keep it flat, compact, clean, and seamlessly integrated.

---

## 1. Design Principles

### 1.1 Native-feeling, not decorative

The UI should feel like a natural extension of Bilibili's existing sidebar system.

### 1.2 Compact information density

This UI lives in a narrow right-side panel context.
Avoid oversized spacing, oversized controls, or dashboard-like layouts.

### 1.3 Flat and restrained

Use borders and subtle hover states for separation.
Do not rely on heavy elevation, gradients, or strong visual effects.

### 1.4 Consistency first

Overflow menus, tabs, lists, form controls, and options-page components should all feel like they belong to the same component system.

---

## 2. Color Palette

All color values must strictly use the Bilibili-native hex codes below.

### Brand and interactions

- Theme Blue (active / hover): `#00aeec`
- Theme Blue Dark (deep hover): `#008ac5`

### Text and typography

- Primary Text: `#18191c`
- Secondary Text: `#61666d`
- Muted Text: `#9499a0`

### Backgrounds and borders

- Main Background: `#ffffff`
- Hover / Card Background: `#f4f5f7`
- Borders / Dividers: `#e3e5e7`

---

## 3. Typography

### Font family

Always use the following font stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

### Font sizes

- Panel Title: `16px`, `font-weight: 500`
- Tabs: `14px`
- Body / List Text: `13px`, `line-height: 1.6`
- Meta / Timestamp / Helper Text: `12px`

### Typography rules

- Always enforce `font-family: inherit` on interactive elements such as `button`, `input`, `select`, and `textarea`
- For timestamps and other numeric labels, use `font-variant-numeric: tabular-nums`
- Prefer restrained font-weight usage; do not overuse bold text

---

## 4. Layout and Shapes

### Borders

- Panels / surfaces: `border: 1px solid #e3e5e7`
- Dividers: `1px solid #e3e5e7`

### Border radius

- Main panels and list items: `6px`
- Small controls / buttons / selectors / menu items: `4px`

Do not use large radii such as 10px, 12px, 16px, or capsule shapes unless explicitly requested.

### Shadows

- Do not use `box-shadow` unless explicitly necessary
- Prefer no shadow
- If a floating layer absolutely needs depth, use an extremely subtle shadow only

### Spacing

- Typical panel outer padding: `12px` to `16px`
- Typical compact control padding: small and dense
- Gap between hoverable list items: `2px`

### Alignment

- Use `align-items: baseline` when aligning mixed font sizes such as timestamps and body text
- Keep optical alignment clean and compact

---

## 5. Core Component Specs

## 5.1 Native Bili Tabs

### Layout

- Flex container
- `border-bottom: 1px solid #e3e5e7`
- Items should divide space evenly when appropriate
- Text should be centered
- Keep the tab row visually light and compact

### Typography

- `font-size: 14px`
- `font-family: inherit`
- `white-space: nowrap`

### Active state

- Text color: `#00aeec`
- `font-weight: 500`

### Active indicator

- Use a bottom indicator line via pseudo-element or equivalent
- Width: `24px`
- Height: `2px`
- Background: `#00aeec`
- Border radius: `2px`

### Do not

- Do not use pill tabs
- Do not use segmented-control backgrounds
- Do not use large tab backgrounds behind inactive items

---

## 5.2 Interactive Lists and Rows

### Row surface

- Transparent background by default
- `padding: 8px`
- `border-radius: 6px`
- Compact vertical density

### Hover state

- Background becomes `#f4f5f7`
- Transition duration: `0.2s`

### Content

- Timestamp text should default to `#9499a0`
- On row hover, timestamp may transition to `#00aeec`
- If timestamp is clickable, underline on interaction is acceptable

### Do not

- Do not use grey timestamp pills
- Do not use chat-bubble style blocks
- Do not add decorative background badges unless necessary

---

## 5.3 Form Controls

### General form style

Form controls should feel compact and integrated, not like browser-default elements.

### Select / dropdown

- `appearance: none`
- `-webkit-appearance: none`
- Background: `#f4f5f7` or transparent
- Border: `1px solid #e3e5e7`
- Radius: `4px`
- Font: inherit

### Hover state

- Border color: `#00aeec`
- Text color: `#00aeec`

### Input / textarea

- Background: `#ffffff`
- Border: `1px solid #e3e5e7`
- Radius: `6px` for larger input areas, `4px` for small compact controls
- Compact padding
- Text color should follow the normal text palette

### Helper text

- Use `12px`
- Color: `#9499a0`

### Do not

- Do not leave default browser font styles
- Do not use giant padded form rows
- Do not make settings forms feel like enterprise dashboards

---

## 5.4 Scrollbars

When the content area scrolls, customize the WebKit scrollbar to match Bilibili's slim style.

- Width: `6px`
- Thumb: `#e3e5e7`
- Thumb radius: `3px`
- Thumb hover: `#c9ccd0`
- Track: transparent

---

## 5.5 Header Action Buttons

### Style direction

Header action buttons should match the existing panel action button language.

### Recommended characteristics

- Small square or near-square clickable area
- Compact size
- Transparent background by default
- Small radius: `4px`
- Icon color should use muted text color by default
- On hover, use `#f4f5f7` background and stronger text/icon color

### Do not

- Do not make header icons look like floating toolbar buttons
- Do not use heavy borders or large pills

---

## 5.6 Overflow Menu

The overflow menu should feel like a small polished extension of the panel header.

### Surface

- Background: `#ffffff`
- Border: `1px solid #e3e5e7`
- Border radius: `6px`
- No shadow by default
- If a shadow is absolutely necessary, keep it extremely subtle

### Size

- Compact width, typically around `120px` to `140px`
- Do not make it oversized

### Positioning

- Visually align it with the header action area
- It should feel anchored to the three-dots button
- It should not look like a generic browser popup

### Menu content

- Tight spacing
- Menu item font size: `13px`
- Text color: `#18191c`
- Compact row height, around `32px` to `36px`

### Hover state

- Background: `#f4f5f7`
- Keep the interaction understated

### Interaction expectations

- Clicking outside should close the menu
- Pressing Escape should close the menu
- Clicking a menu item should close the menu

### Do not

- Do not duplicate actions that already have dedicated buttons unless explicitly requested
- Do not use large shadows
- Do not use system-default popup styling
- Do not make the menu look detached from the panel

---

## 5.7 Options Page

The options page should keep the same visual language as the panel, but adapted for a full page.

### Overall tone

- Clean
- Compact
- Lightweight
- Purposeful
- Not a dashboard
- Not a generic raw form page

### Layout

- Use a controlled content width
- Avoid huge full-width stretched forms
- Use grouped sections or cards
- Keep generous clarity but compact density

### Visual hierarchy

- Page title
- Short description
- Section title
- Field label
- Helper text

### Sections

Recommended first-page sections:

- General
- Summary
- Export

### Styling

- White surfaces
- Light borders
- Small radii
- Soft, restrained spacing
- Typography aligned with the panel style

### Messaging

If summary/provider fields are not active yet, clearly label them as:

- configuration only
- not active yet
- future use / experimental

### Do not

- Do not make the options page look like a blank browser-generated page
- Do not make it feel like a full admin console
- Do not overdesign it

---

## 6. Developer Don'ts

### Absolutely avoid

- Do not use rounded capsule backgrounds for tabs
- Do not use large radii
- Do not use heavy box shadows
- Do not use generic browser-default fonts on interactive elements
- Do not use oversized padding like 24px+
- Do not hardcode heights that break flex layouts
- Do not use huge cards or dashboard-style panels
- Do not introduce a visual style unrelated to the current Readable Captions panel
- Do not make overflow menus or settings pages look like generic webapp components

---

## 7. Practical UI Review Checklist

Before finishing any UI patch, check:

1. Does this look like it belongs on Bilibili's right-side panel?
2. Does it visually match the existing Readable Captions panel?
3. Is spacing compact enough for a sidebar environment?
4. Are borders, radii, and hover states restrained?
5. Did any button, select, or input accidentally fall back to browser-default style?
6. Does the overflow menu feel like a native extension of the header, not a random popup?
7. Does the options page feel like a lightweight extension settings page, not a dashboard?

If the answer to any of these is no, revise the UI before finalizing.