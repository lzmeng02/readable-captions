# Panel Interaction Hardening Design

- **Date:** 2026-07-14
- **Status:** Approved in conversation
- **Branch:** `fix/chrome-frontend-runtime`
- **Pull request:** Draft PR #9
- **Scope:** Fix the confirmed Panel overflow, presentation-state, export-feedback, and accessibility defects. Login-dependent Bilibili/real-provider smoke remains non-gating.

## Problem statement

The current Panel has four confirmed frontend defects:

1. The More menu is rendered inside `.panel`, whose `overflow: hidden` clips the absolutely positioned menu whenever the Panel is collapsed.
2. Collapse state is stored in a module-level variable in `panel-view.ts`. It survives SPA dispose/remount cycles and is shared by concurrently mounted panels.
3. Clipboard and download failures have no visible UI result. In addition, `Promise.resolve(action())` evaluates synchronous download code before constructing the promise, so synchronous failures bypass the current catch handler.
4. Icon controls lack explicit accessible labels and menu state, while the clickable collapse title is a non-keyboard-operable `div`.

These are Panel-owned interaction defects. They do not require changing settings, generation, provider, or content-session protocols.

## Goals

- Keep presentation state isolated per `mountPanel()` instance.
- Start a newly mounted video Panel expanded, while preserving collapse through `updateData()` and host recovery on the same instance.
- Keep More actions usable while the Panel is collapsed.
- Show safe, localized feedback for copy/download success and failure.
- Catch both synchronous and asynchronous export failures and clean temporary DOM/blob resources.
- Give icon and collapse controls explicit names, state, and native keyboard behavior.
- Add focused regressions before production edits and keep all existing tests green.

## Non-goals

- Persist collapse preference across videos, tabs, or browser restarts.
- Implement a portal/floating-position engine, viewport collision detection, or Bilibili-ancestor overflow compensation.
- Convert the disclosure into an ARIA `menu` widget or implement full APG tab/tabpanel keyboard behavior.
- Treat real Chrome, authenticated Bilibili, or real provider smoke as a merge gate for this patch.
- Add a new UI framework or browser-test dependency.

## Considered approaches

### 1. Instance state plus a conditional overflow escape — selected

- Move `isCollapsed` into the `mountPanel()` closure and pass it to the view with an explicit change callback.
- Add a `menu-open` class to `.panel` and set `overflow: visible` only while More is open.
- Run export operations through one mount-owned action runner and render an inline status message.
- Replace the clickable title `div` with a native button and add explicit ARIA attributes to icon controls.

This directly fixes the proven defects, preserves current component boundaries, and is fully testable except for final CSS geometry. The menu may still be clipped by an external Bilibili ancestor or leave a very small viewport; those are separate, currently unverified layout risks.

### 2. Patch reset/dispose and remove overflow globally — rejected

Resetting a module-level collapse variable in `reset()` does not affect the production SPA path, which disposes and remounts. Resetting it in `dispose()` or on mount still mutates shared state and can make another live Panel jump on its next render. Removing `overflow: hidden` globally has a wider visual impact on rounded corners and internal layers than the confirmed bug requires.

### 3. Fixed/portal menu and controller-owned presentation store — deferred

A fixed or portalled menu could escape both Panel and page-level clipping and support flip/clamp behavior. A controller-owned store could deliberately persist collapse across video routes. Both add coordinate, scroll/resize, focus, cleanup, and product-semantics complexity that is unnecessary for the current defects.

## Detailed design

### Per-panel presentation state

`mountPanel()` owns `isCollapsed`, initialized to `false`. `PanelUiOptions` exposes the current value and an `onCollapsedChange(next)` callback to `panelTemplate()`; the view no longer reads or mutates module-level state.

- User toggle: update the current instance and rerender it.
- `updateData()`: preserve the current collapse state because it represents the same mounted session and is also used for host recovery.
- `reset(next)`: restore `isCollapsed = false` along with mode, Note, menu, and action feedback.
- `dispose()`: release resources without mutating any other instance.
- Dispose followed by a new `mountPanel()`: naturally starts expanded.

This ownership also prevents one Panel's future rerender from adopting another Panel's collapse value.

### More-menu clipping

When `isMenuOpen` is true, the root element includes `menu-open`:

```html
<div class="panel collapsed menu-open">
```

The stylesheet keeps the default containment and relaxes it only for the active disclosure:

```css
.panel.menu-open {
    overflow: visible;
}
```

`.content` remains the scrolling boundary through its existing `overflow-y: auto`. This fixes Panel-owned clipping in collapsed, narrow, and short Panel states without introducing positioning code. Real-page ancestor clipping and viewport flip behavior remain explicitly unverified.

### Export action lifecycle and feedback

`mount.ts` owns one transient action state:

```ts
type PanelAction = "copy" | "download";
type ActionFeedback =
    | { action: PanelAction; status: "success" }
    | { action: PanelAction; status: "error" }
    | null;
```

Main-content and Note exports use the same action kinds because their user-facing result is identical. A single `runAction(action, operation)` function:

1. Increments a request version and clears the prior feedback timer.
2. Executes `await operation()` inside `try/catch`, so synchronous throws and promise rejections follow the same path.
3. Ignores stale completions after a newer action, reset, or dispose.
4. Renders a safe localized message and clears it after 2500 ms.

Success copy reads “Copied”; success download reads “Download started”, because the extension can only confirm dispatch, not completion. Failures use generic “Copy failed” or “Download failed” messages and never render raw exception text. Success uses `role="status"`; failure uses `role="alert"`.

`reset()` and `dispose()` invalidate active action results and clear the timer. `export-utils.ts` uses `finally` blocks so the fallback textarea, temporary anchor, and blob URL cleanup are scheduled even when `execCommand()` or `click()` fails.

### Accessibility behavior

- The title/collapse control becomes a native `button` with localized `aria-label` and `aria-expanded=${!isCollapsed}`. Native Enter/Space activation replaces custom keyboard handlers.
- Copy, download, More, and Note-close icon buttons keep their tooltips and receive matching explicit `aria-label` values.
- Decorative SVGs inside those controls receive `aria-hidden="true"`.
- More receives `aria-expanded=${isMenuOpen}` and `aria-controls="rc-overflow-menu"`; the disclosure container receives that id.
- The More content remains ordinary buttons. No `role="menu"`, `menuitem`, or `aria-haspopup="menu"` is added without the associated focus and arrow-key model.
- Existing tabs remain ordinary buttons in this patch; a complete tab-pattern conversion is separate work.

## Test strategy

Every regression is added and observed failing before its production change.

### Panel lifecycle and menu

- Collapse then `reset()` returns the same Panel to expanded.
- Collapse, dispose, and mount a new Panel starts expanded.
- Collapsing Panel A does not affect Panel B after B rerenders.
- `updateData()` on the same Panel preserves collapse.
- Opening More while collapsed renders both `collapsed` and `menu-open`, and the stylesheet contract releases overflow only for `menu-open`.

jsdom cannot prove hit-testing or clipping geometry. The automated contract will prevent removal of the state/style fix, while real Chrome/Bilibili layout remains documented as non-gating and unverified.

### Export behavior

- Rejected copy renders a safe visible error.
- A synchronous download throw is caught and renders a safe visible error.
- Successful copy and download render the correct temporary status.
- A newer action supersedes an older completion.
- Reset/dispose prevents stale feedback and clears timers.
- Fallback copy and download helpers clean temporary resources after failure.

### Accessibility

- Icon controls expose explicit localized labels.
- More toggles `aria-expanded` and references the disclosure id.
- The collapse control is a button, reports expanded state, and responds to native keyboard activation.

### Verification

Run focused Panel/export suites, then `npm test`, standalone TypeScript checking, `npm run build`, and `git diff --check`. Rebuild ignored `dist/` for user testing without staging it. Request an independent whole-diff code review before updating Draft PR #9.

## Documentation impact

Update `docs/architecture.md` to state that Panel presentation/action state is instance-owned and update `docs/development.md` with the new regression boundaries and non-gating layout limitation. No settings schema or public protocol documentation changes are required.
