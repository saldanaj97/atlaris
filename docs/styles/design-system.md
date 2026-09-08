# Atlaris Design System v1.0-rc1

**Complete documentation release candidate · September 5, 2026 · Sections 00–27**

This handbook assembles the inherited foundations, components and patterns with the final overview, principles and standards. It does not claim production adoption or accessibility conformance. The 379-token authoring file is unchanged. The reviewed repository baseline is `f8994dc7144ca8ce64354771c8fd95082cdd52a6`.

Earlier section text is preserved with its originating reference IDs. Use the source register for that stage, not an identically numbered reference in another stage. Historical “next” statements describe their original draft; §00 states the assembled release scope. §17's disclosed progress-rail refinement takes precedence over the older recipe; no token was silently changed.

## Repository adoption status

This file is the **canonical detailed design-system specification** for Atlaris. [DESIGN.md](../../DESIGN.md) is the concise agent/developer entry point. Intended design follows this specification; current application code and tests remain authoritative for product behavior. JCS-86 adopts the shared cool-black/lavender foundations through `src/app/globals.css`, generated dark tokens and the existing shared page primitives. A matching cool light theme is a repository-owned extension approved for this slice; light, dark and system preferences remain supported.

This is a bounded foundations migration, not completion of the page or component redesign. All source contracts, proposals, specimen-only results and open decisions below retain their stated status unless explicitly covered by the repository adoption notes here. In particular, full vector lockup production, named-font comparison, sidebar behavior, component compositions and integrated accessibility remain unresolved where stated. Analytics keeps the [existing metric contract](../architecture/usage-analytics-metric-contract.md).

**Original package context:** the handbook below was authored against `f8994dc7144ca8ce64354771c8fd95082cdd52a6`. Statements about the old `DESIGN.md` precedence in §§00.3 and 27 describe that snapshot; the repository adoption notes above supersede that documentation conflict and identify the runtime slice implemented here. References to `tokens/atlaris.tokens.json`, generated CSS/catalogs, package scripts, HTML/PDF specimens, JSON registries and earlier stage files describe the original external reference package. Those companion files remain outside the repository. The supplied compiler can generate tokens externally as described below; do not reconstruct a competing token source from these tables. Package/handbook checks are separate from application checks. Use the inherited source registers below for the retained chapter reference IDs.

The [style-guide compatibility pointer](./style-guide.md) and [archived After Hours direction](./after-hours-direction.md) do not establish current design rules. Historical package paths and future example destinations below are not claims that those paths exist in the application repository.

### External token generation

Keep the reference package outside this repository for the redesign. Its `tokens/atlaris.tokens.json` remains the editable token source; `scripts/token-compiler.py` supplies validation and CSS generation using Python 3.10+ and the standard library. No package copy, dependency installation, repository generator or application build dependency on a local Downloads path is needed.

The supplied rc1 package does **not** contain the `scripts/build.py` mentioned in the original handbook. Running `token-compiler.py` directly also does not emit files: call its existing functions instead. Set `ATLARIS_DESIGN_PACKAGE` to the external package directory, then run:

```bash
python3 - "$ATLARIS_DESIGN_PACKAGE" <<'PY'
from pathlib import Path
import runpy
import sys
import tempfile

package = Path(sys.argv[1]).expanduser().resolve()
compiler = runpy.run_path(str(package / "scripts/token-compiler.py"))
compiler["validate"]()
checks = compiler["contrast_checks"]()
if not checks or not all(check["as_expected"] for check in checks):
    raise SystemExit("Unexpected token contrast result")
css = compiler["generate_css"]()
output = Path(tempfile.mkdtemp(prefix="atlaris-design-tokens-")) / "atlaris-tokens.css"
output.write_text(css, encoding="utf-8")
print(output)
PY
```

This writes only a temporary CSS artifact after validation succeeds. It reads the external source without changing the reference package. Intentional rejected contrast pairs must remain rejected (`as_expected` checks that distinction); this is not an application accessibility certification.

The verified generated artifact is adopted at `src/styles/generated/atlaris-tokens.css`; its values remain generated and must not be edited by hand. Regenerate from the external JSON when dark values change and review the semantic bridge in `src/app/globals.css`. The original package is dark-only: the approved light extension is authored once in the existing `:root` runtime tokens, not copied into a competing dark palette or into the external reference package. The machine-specific package location and generation evidence belong in the ignored local daily recap, not in application configuration.

### JCS-86 foundation boundaries

- Existing Work Sans and Sora font loaders remain; exact named-font comparison against the artwork is still open. The mono role uses a system font stack.
- The existing responsive breakpoints already match §06. Shared page gutters, application title sizes and Surface card dimensions adopt the reference geometry while preserving component APIs and route behavior.
- The legacy Tailwind `--spacing: 0.2rem` remains for unmigrated consumers. Foundation recipes use explicit dimensions from the quarter-rem reference scale; changing the global multiplier would enlarge every numeric spacing utility by 25%. Control geometry belongs to JCS-94 and route-specific spacing to each page issue.
- JCS-94 owns complete control and action recipes. JCS-95 owns feedback and overlay compositions (dialogs, sheets, confirmations, toasts and state surfaces). Changes required now to preserve readable action labels, status text, control boundaries and focus are compatibility work for the new token roles.
- JCS-87 owns sidebar composition. Page layouts, marketing imagery/copy, reader compositions, analytics presentation and JCS-6 brand assets remain their own issues. Shared token adoption does not claim those designs are complete.
- Local application checks and browser evidence are recorded with JCS-86. Package contrast checks cover source pairs, not all rendered pages or an application-wide accessibility certification.

## Contents

- **00 — Overview** (Final-stage draft synthesis)
- **01 — Principles** (Final-stage draft synthesis)
- **02 — Logo & brand marks** (Foundations v0.2)
- **03 — Color** (Foundations v0.2)
- **04 — Typography** (Foundations v0.2)
- **05 — Spacing** (Foundations v0.2)
- **06 — Layout & breakpoints** (Foundations v0.2)
- **07 — Borders, radius & elevation** (Foundations v0.2)
- **08 — Iconography** (Foundations v0.2)
- **09 — Imagery** (Foundations v0.2)
- **10 — Motion** (Foundations v0.2)
- **11 — Primitive tokens** (Foundations v0.2)
- **12 — Semantic tokens** (Foundations v0.2)
- **13 — Component tokens** (Foundations v0.2)
- **14 — Actions** (Components v0.3)
- **15 — Forms** (Components v0.3)
- **16 — Navigation** (Components v0.3)
- **17 — Data display** (Components v0.3)
- **18 — Feedback** (Components v0.3)
- **19 — Overlays** (Components v0.3)
- **20 — Page layouts** (Patterns v0.4)
- **21 — Cards & content groups** (Patterns v0.4)
- **22 — Forms** (Patterns v0.4)
- **23 — Loading / empty / error** (Patterns v0.4)
- **24 — Responsive behavior** (Patterns v0.4)
- **25 — Accessibility** (Final-stage draft synthesis)
- **26 — Content & copy** (Final-stage draft synthesis)
- **27 — Implementation mapping** (Final-stage draft synthesis)
- **27.9 — Launch adoption map** (JCS-96 repository decision record)

---

_Source: Final-stage draft synthesis. New final-stage requirements and synthesis; proposals and source contracts remain distinguished._

## 00 — Overview

### 00.1 Purpose and release status

Atlaris helps a learner turn a goal into a learning plan and return to the next useful piece of work. This system codifies the supplied cool-black/lavender direction without expanding the product merely to reproduce generated artwork. The four page families remain marketing, application, learning reader and standalone utility. [F01–F04]

**Version 1.0-rc1 is the complete 00–27 documentation release candidate.** “Complete” refers to chapter coverage and the assembled reference package. It does not mean that every draft decision is approved, the product is migrated, the assets are production-ready, or the application conforms to an accessibility standard. No repository, deployment, account or original brand file was changed by this work.

The target is a restrained, content-led interface: cool-black surfaces, clear light text, lavender emphasis, explicit interaction boundaries and occasional atmospheric imagery. Working views prioritize readable learning content over promotional decoration. The typography remains Work Sans for UI and Sora for display as comparison candidates; no exact font identification or canonical full vector wordmark is claimed. [F01 pp. 3–6; F02 §§02–04]

### 00.2 The complete chapter map

| Group       | Chapters                                                                                                                                                   | Authority in this release                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Orientation | 00 Overview; 01 Principles                                                                                                                                 | New synthesis of the supplied system; proposed operating rules.                       |
| Foundations | 02 Logo & brand marks; 03 Color; 04 Typography; 05 Spacing; 06 Layout & breakpoints; 07 Borders, radius & elevation; 08 Iconography; 09 Imagery; 10 Motion | Carried forward from v0.2.                                                            |
| Tokens      | 11 Primitive; 12 Semantic; 13 Component                                                                                                                    | v0.2 naming model, with the v0.3 additions retained in the canonical file.            |
| Components  | 14 Actions; 15 Forms; 16 Navigation; 17 Data display; 18 Feedback; 19 Overlays                                                                             | Carried forward from v0.3, including the disclosed progress-rail refinement.          |
| Patterns    | 20 Page layouts; 21 Cards & content groups; 22 Forms; 23 Loading / empty / error; 24 Responsive behavior                                                   | Carried forward from v0.4.                                                            |
| Standards   | 25 Accessibility; 26 Content & copy; 27 Implementation mapping                                                                                             | New operational requirements, copy contracts, integration sequence and release gates. |

The companion Markdown is the detailed reference. The PDF is a visual summary; it is not a substitute for the full interaction contracts. The HTML handbook indexes all chapters and includes a local review worksheet. Earlier interactive specimens remain under `examples/` in the ZIP. Their mock data and handlers are not production code.

### 00.3 Use the right source for the question

| Question                                             | Source of truth                                                                           | What does not establish it                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| What is the approved visual direction?               | Supplied final artwork, with provenance from the inventory.                               | Older generated variants or the repository's earlier copper/plum brand. |
| What numeric design values does this candidate use?  | `tokens/atlaris.tokens.json`, interpreted through documented recipes.                     | Pixels sampled from screenshots or manually edited generated CSS.       |
| What functionality and data are currently available? | Pinned repository contracts and current authoritative server responses at implementation. | Demo content, prototype actions or decorative sidebar labels.           |
| What is actually running?                            | The compiled application and its current configuration.                                   | A proposed target token or static source review.                        |
| What is required for accessibility?                  | Applicable WCAG success criteria, with the selected project policies in §25.              | A contrast swatch, APG example, or automated pass count alone.          |
| What is ready to release?                            | Evidence for the exact integrated build, declared test scope and explicit approval.       | A finished document or successful standalone HTML simulation.           |

The reviewed branch still resolves to `f8994dc7144ca8ce64354771c8fd95082cdd52a6`. The new token file is the **target design authority**; until it is deliberately integrated, `globals.css` remains the runtime implementation. Existing `DESIGN.md` describes the older After Hours direction and instructs agents to prefer current CSS. Those are migration conflicts to resolve explicitly, not permission to change source precedence silently. [G01–G03]

### 00.4 Evidence labels and inherited notes

**Source contract** is supported by a named file and read scope. **Draft specification / project policy** is a proposed decision made in these documents. **Specimen-only** is a local illustrative behavior. **Verified in this package** means a recorded check of this package, not of the product. **Not tested / open** is not a pass.

Sections 02–24 are preserved from their source-stage documents. Historical statements such as “next stage” or old token totals describe those stages; the chapter map and release status here establish the current assembled scope. Reference IDs inside inherited chapters are local to their originating source register, not global IDs. The package retains those original documents/registers so references can be resolved without guessing.

Two explicit precedence notes carry forward rather than silently rewriting source material:

- The current token set contains **379 records**. The 289-token count in v0.2 is historical; v0.3 added 90 and v0.4 changed none. This release adds, removes and changes no token records.
- For the progress recipe, use `component.progress.track-background` and `component.progress.track-border` from v0.3. The retained `component.progress.track` alias is not the current filled-rail recipe. The failed fill/old-track pair stays a documented rejection. [F03 §§17.5, 17.6; token catalog]

### 00.5 Scope boundaries

Preserve the actual routes, auth return paths, authorization, billing eligibility, plan-selection requirements, session/recovery logic and data meanings. Do not introduce a template browser, global search, notifications inbox, code runner, community, tracked study timer, monthly analytics selector or recent-activity feed to fill a mockup. The existing usage page retains the eight-week pulse and seven metrics. Prices, quotas, cancellation effects, refunds and service estimates are not frozen by this reference. [F01 p. 8; F03 §17; F04 §§20–23]

Dark-first specification does not remove light/system preferences. Independent hero imagery and the full canonical vector lockup are bounded asset tasks, not blockers to understanding or integrating an unillustrated component. A logo image trim in a specimen is not a new master asset. [F02 §§02, 09; G04]

### 00.6 How to use the system

For a new or revised screen: identify its real route and user task; select the appropriate page pattern; reuse existing component APIs; apply the semantic/component tokens; preserve all relevant states; then check accessibility, copy and actual data before approval. A novel component or token requires a demonstrated gap, not just a new visual preference.

For implementation: start with §27 and one bounded end-to-end slice. For visual review: compare §03–07 and the relevant state board. For behavior: read the component and pattern together. For review evidence: record build/commit, route, state, viewport, input mode, browser/assistive technology and result. No test result transfers automatically from one build or specimen to another.

The complete chapter set is now available. The next operational step is integration and decision closure, not another round of whole-page redesigns.

---

_Source: Final-stage draft synthesis. New final-stage requirements and synthesis; proposals and source contracts remain distinguished._

## 01 — Principles

These principles are a synthesis of the supplied inventory, foundations, components and patterns. They are proposed decision rules, not additional product features or a retroactive assertion that every generated screen followed them. Their purpose is to resolve choices that a token value alone cannot answer. [F01–F04]

### 01.1 Put the learning task before the atmosphere

**Rule:** learning content, progress context and the next permitted action must remain useful without the background illustration. Keep lesson prose and code on opaque readable surfaces. Expressive landscapes belong in bounded marketing or utility regions, not behind every paragraph. [F01 p. 4; F02 §09; F04 §20]

**Apply:** collapse a local outline before narrowing the reading column; remove repeated sales banners from working screens before reducing type size.

**Decision test:** hide all decorative images. Can the learner still understand where they are and what to do next? If not, hierarchy or content is missing.

### 01.2 Give each decision one clear primary action

**Rule:** use lavender emphasis intentionally. Supporting actions remain neutral or quiet, while destructive emphasis belongs to the irreversible commit. Multiple regions can each contain a primary action; the policy is not an arbitrary one-button limit for an entire page. [F02 §13; F03 §14; F04 §20.3]

**Apply:** “Create plan” can lead the generation form; Cancel remains secondary. A completed badge is not another bright action button.

**Decision test:** can the user identify the next action before reading every control? If three controls compete equally, revise the hierarchy before adding color.

### 01.3 Describe the state the system actually knows

**Rule:** distinguish a successful read from an empty result, a submitted request from a finished job, and an unknown outcome from a confirmed failure. Estimated completed time is not elapsed study time. [F03 §§17–19; F04 §23]

**Apply:** when a plan ID arrives, say generation has started or continues; do not announce “Your plan is ready.” After an uncertain deletion, reconcile before enabling another deletion.

**Decision test:** what specific response or measurement supports this number, status or claim? If the answer is “the mockup,” exclude or label it as example content.

### 01.4 Preserve work, context and agency

**Rule:** layout changes, failed requests and dismissed status panels must not erase work or imply cancellation that did not occur. Focus should remain with the task, or move to a logical survivor when the current control disappears. [F03 §19; F04 §§21–24]

**Apply:** keep selected plan IDs when a table becomes cards; retain edited notification preferences on failure; distinguish “Close status” from a real supported cancellation command.

**Decision test:** after resizing, retrying or dismissing, can the user resume without reconstructing the previous state? Preserve security/access restrictions even when retaining old content would look smoother.

### 01.5 Make state perceivable without color or motion alone

**Rule:** status uses words or other explicit indicators; current navigation has a persistent marker; keyboard focus is a separate layer from hover, selection and validation. Reduced motion keeps useful labels and state information. [F02 §§07–10; F03 common state contract; F04 §24]

**Apply:** an invalid field keeps its error boundary while a focus outline shows keyboard location. A loading label remains when the spinner stops.

**Decision test:** using a keyboard with animation disabled, is the action, location and result still understandable? A decorative glow is not a substitute for an interaction boundary.

### 01.6 Reuse one vocabulary before adding another abstraction

**Rule:** semantic roles, established components and real route patterns come before per-page exceptions. Preserve existing APIs and business owners unless an explicit migration changes them. The token source, generated values and documentation must agree. [F02 §§11–13; F03 handoff; F04 integration guidance]

**Apply:** update Button recipes rather than create a parallel button family. Use the existing session hook rather than copy a specimen's fake timers. Keep plan, module and task identities separate.

**Decision test:** which existing role or pattern cannot solve this need, and why? “It looks slightly different” is not sufficient justification for another token or wrapper.

### 01.7 Let content and user preferences govern the layout

**Rule:** responsive design changes the arrangement, not the user's task or access to information. Use available content width, growing controls, bounded prose and local scrolling for genuinely two-dimensional content. Respect light/system and input/motion preferences rather than silently removing them. [F02 §§05–07; F04 §24; G04]

**Apply:** wrap a long title before shrinking it; preserve all table fields in a card alternative; verify focus after navigation switches between Sheet and sidebar.

**Decision test:** at narrow width, enlarged text or a short viewport, can the user still read, decide and recover? If not, change the composition rather than clipping essential content.

### 01.8 Resolving tradeoffs

When principles conflict, protect accurate state, access/security, retained work and operability first. Then preserve reading hierarchy and a clear action. Reuse the established visual language where it fits those constraints. Decorative fidelity is last, not because it is unimportant, but because it cannot justify misleading or unusable behavior.

A proposed exception records the affected pattern, the concrete need, alternatives considered, accessibility/product consequences, approver and verification evidence. The owner can make that decision without inventing a committee. Until accepted, it remains a proposal rather than a new default. [Project policy; §27.8]

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 02 — Logo & brand marks

### Source decision

Use the supplied standalone SVG mark as the canonical mark geometry. For a complete logo, the supplied **light-on-dark PNG is the appearance reference**, not a newly reconstructed wordmark. This draft does not infer its font, redraw it, or claim to have created a complete vector master. [A01 §2; A02]

| Role                     | Source                                  | Rule                                                                                         |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Standalone mark on dark  | `brand/mark-on-dark.svg`                | Exact fill `#F8FAFC`; original 1024 × 1024 viewBox.                                          |
| Standalone mark on light | `brand/mark-on-light.svg`               | Exact fill `#0B1118`; same standard path geometry.                                           |
| Context-colored mark     | `brand/mark-current-color.svg`          | Use controlled `currentColor`; do not let arbitrary parent status colors recolor the brand.  |
| Small favicon            | `brand/favicon-16.svg`                  | Retain simplified details; do not shrink the full mark as a substitute.                      |
| 32px favicon             | `brand/favicon-32.svg`                  | Keep the supplied small-format export.                                                       |
| Complete lockups         | `logo-on-dark.png`, `logo-on-light.png` | Different visible bounds and weight; do not swap at equal canvas width as equivalent assets. |
| Social graphic           | `brand/og-default.png`                  | 1200 × 630 export from the existing source; metadata uses this path.                        |

### Draft usage rules

Define **M** as the visible mark height, excluding transparent canvas padding. Reserve at least **0.5M** around a standalone mark or around the outer bounds of a full lockup. These clear-space values are new design rules, not extracted measurements.

Use the standard standalone mark at a provisional **24 CSS px visible size or larger**. Use the dedicated favicon variant for 16px browser use. Start full lockups at **128 CSS px visible width or larger**; inspect the final vector at real size before locking that minimum. Set the clickable logo target independently from the artwork, using the control target rules in section 05.

Keep the mark upright, preserve proportions and retain the approved mark-to-wordmark relationship. Do not apply gradients, glows, outlines, new tracking, or an approximate live-font wordmark. On imagery, place it on a quiet, sufficiently contrasting area. Decorative duplicates use empty alt text; a linked identity should have an accessible name that describes its destination.

### Outstanding production asset

Create one complete outlined SVG lockup matching the light-on-dark reference, then derive its dark-on-light colorway from the same geometry. The source PNGs have equal 2172 × 724 canvases but visible bounds of 1177 × 258 (`logo-on-dark.png`) and 1874 × 427 (`logo-on-light.png`) at alpha ≥128. The companion `assets/lockup-display-crop.png` is **only a trimmed presentation copy**, not a new master or a normalization of both variants. [A01 §2]

The social-image source also differs from the root metadata’s `/og-default.jpg` at 1200 × 630. Resolve filename, encoding, dimensions and metadata together during the asset migration; this package changes none of them. [R02]

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 03 — Color

### Dark-first, not dark-only

This draft specifies the approved **cool-black / lavender** direction. It does not remove the application’s existing light/system preference, and it does not invent a light application theme from a light-logo asset. New dark tokens are scoped to `[data-atlaris-theme="dark"]`; there is no global `:root` or production `.dark` override. [A01 §§4, 11]

The two mark colors are exact asset values. Their reuse as surface/text colors, all remaining UI values, and the interaction-state assignments are proposed normalization decisions. The old plum/copper values remain the verified repository baseline, not the target theme. [A01 §4; R01]

### Main semantic roles

| Role             | Hex     | Use                                               |
| ---------------- | ------- | ------------------------------------------------- |
| Canvas           | #070B10 | Opaque working background.                        |
| Surface          | #0B1118 | Cards, panels and fields.                         |
| Raised           | #111A25 | Menus and elevated regions.                       |
| Neutral hover    | #1B2838 | Opaque neutral hover/pressed fill.                |
| Selected surface | #1C1933 | Current navigation and restrained accent regions. |
| Primary text     | #F8FAFC | Headings, labels and primary content.             |
| Secondary text   | #B8C5D6 | Supporting prose.                                 |
| Muted text       | #8C9CB2 | Metadata and placeholders; no additional opacity. |
| Link             | #AE9CFF | Underlined inline links.                          |
| Focus ring       | #B3A2FF | Opaque outline separated from the control.        |
| Subtle divider   | #253244 | Nonessential grouping and separators.             |
| Control boundary | #62738A | Field and outline-control identification.         |
| Strong boundary  | #8C9CB2 | Higher-emphasis/hover boundary.                   |

### Action colors

| Action           | Default | Hover   | Pressed | Label   |
| ---------------- | ------- | ------- | ------- | ------- |
| Primary          | #8B78FF | #A08FFF | #7C68EB | #070B10 |
| Destructive fill | #C7344F | #CE3954 | #BA2C46 | #F8FAFC |
| Inverse          | #F8FAFC | #E2E8F0 | #B8C5D6 | #070B10 |

Use lavender for the main application action. White/inverse is a defined marketing or utility treatment, not a competing second primary action. Inline links have their own role. Errors use a separate foreground/border token rather than borrowing the destructive button’s fill.

Secondary controls use raised neutral surfaces and primary text. Outline controls use the control boundary. Ghost controls rely on their label/icon and interaction state, not a barely visible outline. Disabled controls use opaque `#111A25` / `#8C9CB2`; the specimen does not multiply their opacity.

### Status and chart roles

| Status         | Foreground / border | Subtle background |
| -------------- | ------------------- | ----------------- |
| Success        | #65D7AF             | #102B26           |
| Warning        | #F0C765             | #2E2514           |
| Danger / error | #FF8C94             | #30191F           |
| Information    | #78B9FF             | #13283E           |

Every status needs text or another non-color indicator. The five categorical chart colors are `#A08FFF`, `#78B9FF`, `#65D7AF`, `#F0C765`, `#FF8C94`. Pair them with labels and, where needed, distinct dashes/markers. These are visual roles, not permission to add metrics. Preserve the existing eight-week pulse and its seven summary metrics. [A01 §8]

### Contrast contract

The bundle contains **65 opaque sRGB contrast checks: 63 intended passing pairs and 2 deliberately rejected combinations**. Computations compare unrounded values with their threshold; the table display is rounded. These are color-pair tests, not a WCAG conformance declaration. [W01, W05, W06]

| Pair                         | Ratio   | Decision                                            |
| ---------------------------- | ------- | --------------------------------------------------- |
| Primary text / surface       | 18.12:1 | Use.                                                |
| Muted text / surface         | 6.78:1  | Use at full opacity.                                |
| Dark label / primary         | 5.85:1  | Use.                                                |
| Dark label / primary pressed | 4.73:1  | Use at full opacity; do not darken further.         |
| White label / primary        | 3.22:1  | Reject for ordinary-size button text.               |
| Control border / surface     | 3.92:1  | Use for necessary control boundaries.               |
| Subtle divider / surface     | 1.46:1  | Decoration only; reject as the sole field boundary. |

Standard text needs 4.5:1; large text can use 3:1 under the WCAG definition. Do not classify a 20px semibold label as “large” automatically. Required visual control information and graphical objects need 3:1 against adjacent colors. Decorative boundaries are a different case. Inactive controls are contrast-exempt, but this system voluntarily keeps their labels legible. [W05, W06]

Transparent fills, images and gradients require their own composite checks. Passing a token pair does not establish the contrast of an opacity-modified Tailwind class, third-party widget or image-backed heading.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 04 — Typography

### Family decisions and evidence

**Work Sans** remains the UI/body/ordinary-heading candidate. **Sora** remains the marketing-display candidate. These names are verified in `src/app/layout.tsx`; they are not identified from the generated PNGs. The normalized fallback stacks are draft decisions. The logo wordmark is separate. [R01, R02]

Use `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for the draft code role. The old CSS declares JetBrains Mono, but its loading is not established by the audited root. Do not add another font dependency without a deliberate decision. [A01 §5]

**Typeface matching is not yet validated.** The browser used for this package did not have Work Sans or Sora installed and could not retrieve the comparison files. The packaged specimen therefore records system-fallback rendering. Its opt-in “Load comparison fonts” action can load the named families from Google Fonts in an online browser. No external request occurs until that action is selected; no font binaries are included.

### Proposed type scale

All nominal pixel sizes assume a 16px root. The authoring file uses rem sizes and unitless line heights. Do not force the user’s default root size to 16px.

| Role            | Family      | Size / nominal line | Weight | Tracking | Use                       |
| --------------- | ----------- | ------------------- | ------ | -------- | ------------------------- |
| display         | Sora        | 64 / 69.12px        | 600    | −1.28px  | Marketing desktop.        |
| display-compact | Sora        | 40 / 46px           | 600    | −0.64px  | Marketing narrow layouts. |
| title           | Work Sans   | 32 / 40px           | 600    | −0.64px  | Application title.        |
| title-compact   | Work Sans   | 28 / 36px           | 600    | −0.64px  | Narrow application title. |
| section         | Work Sans   | 24 / 32px           | 600    | −0.24px  | Main content section.     |
| card            | Work Sans   | 20 / 28px           | 600    | 0        | Card/subsection.          |
| reading         | Work Sans   | 16 / 26px           | 400    | 0        | Lesson prose.             |
| body            | Work Sans   | 14 / 22px           | 400    | 0        | Compact application copy. |
| label           | Work Sans   | 14 / 20px           | 500    | 0        | Controls.                 |
| input           | Work Sans   | 16 / 24px           | 400    | 0        | Editable field values.    |
| meta            | Work Sans   | 12 / 18px           | 400    | 0        | Nonessential metadata.    |
| eyebrow         | Work Sans   | 12 / 16px           | 600    | +1.6px   | Short uppercase labels.   |
| code            | System mono | 14 / 22px           | 400    | 0        | Code examples.            |

Keep headings semantic: an h2 does not become an h1 to obtain a larger visual size. Use the `semantic.type.*` role independently from the HTML element. Keep one primary page heading and a logical outline. Essential instructions use body/reading roles, not metadata or tracked uppercase.

Use a **70ch default reading measure**, within the audit’s 65–75ch range. Long titles wrap; numbers use tabular figures where alignment matters. Do not truncate a user’s essential task or action label. Code can scroll inside its own region; ordinary prose must reflow. [A01 §5; W09]

### Repository binding

When integrating with `next/font`, bind the UI and display family tokens to the existing `--font-work-sans` and `--font-sora` variables on the same theme-owning element. Literal family names may not select Next’s generated font faces. Keep the current font loader; do not introduce client-side Google requests to the production app just because the standalone specimen has an optional comparison loader.

Font-size, tracking and weight choices remain draft until a named-font browser comparison checks the lesson reader, generation form and representative long titles. The PDF’s reference typography is document-only, not proof of a family match.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 05 — Spacing

### Target scale

| Token suffix | Nominal px | rem   |
| ------------ | ---------- | ----- |
| 0            | 0          | 0.0   |
| half         | 2          | 0.125 |
| 1            | 4          | 0.25  |
| 2            | 8          | 0.5   |
| 3            | 12         | 0.75  |
| 4            | 16         | 1.0   |
| 5            | 20         | 1.25  |
| 6            | 24         | 1.5   |
| 8            | 32         | 2.0   |
| 10           | 40         | 2.5   |
| 12           | 48         | 3.0   |
| 16           | 64         | 4.0   |
| 24           | 96         | 6.0   |

The token prefix is `primitive.space`. Use the 2px half-step only for optical alignment, focused-control separation and similarly small adjustments. Avoid introducing 13px/17px gaps to preserve inconsistencies in a raster export.

| Relationship                         | Draft rule                                              |
| ------------------------------------ | ------------------------------------------------------- |
| Icon to label                        | 8px; smaller exceptions must be explicit.               |
| Label to field / helper relationship | 8px.                                                    |
| Between form fields                  | 24px.                                                   |
| Panel padding                        | 24px standard; 16px compact/narrow.                     |
| Application section gap              | 32px.                                                   |
| Page gutters                         | 16px narrow; 24px medium; 32px wide.                    |
| Marketing section separation         | Start with 64–96px; adapt to content, not empty height. |

### Control sizes and targets

Compact controls have a nominal **32px minimum height**, default controls **40px**, and prominent controls **48px**. On coarse-pointer layouts use at least **44px** for targets, including compact/icon controls. Keep icon artwork independent from its hit area. These are product policy choices; WCAG 2.2 AA’s target-size criterion uses 24 × 24 CSS px with defined exceptions, not a universal 44px mandate. [W07]

Use minimum heights with content-driven padding, not clipped fixed-height boxes. Enlarged text and localized labels must still fit. Read-only is not disabled; it stays readable, selectable and keyboard-reachable where appropriate.

### Migration rule

The audited repo uses `--spacing: 0.2rem`. The draft target is `0.25rem`: a 25% increase for affected spacing-based utilities. This bundle does not change that global variable. [R01; W02]

When integrating, first measure computed sizes in representative views. Convert control dimensions to the intended min-height contract, test page layouts, and only then decide whether the global multiplier can change. In particular, changing the spacing base alone does not turn the existing `h-9` default button into a 40px control: 9 × 4px is 36px. The component’s sizing recipe also needs adjustment. [R03, R04]

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 06 — Layout & breakpoints

### Shared geometry

| Role            | Draft value    | Meaning                                                       |
| --------------- | -------------- | ------------------------------------------------------------- |
| Desktop sidebar | 14rem / 224px  | Authenticated navigation column, not present below lg.        |
| Header minimum  | 4rem / 64px    | Allow content growth; preserve safe-area and focus behavior.  |
| Content maximum | 80rem / 1280px | Maximum inner main content, excluding sidebar/gutters.        |
| Form maximum    | 40rem / 640px  | Input flow content measure.                                   |
| Overlay maximum | 32rem / 512px  | Overlay default maximum, subject to viewport inset.           |
| Reading measure | 70ch           | CSS composition rule, not an invalid DTCG ch-dimension token. |

### Breakpoint behavior

| Threshold   | Draft behavior                                                                        |
| ----------- | ------------------------------------------------------------------------------------- |
| Below 40rem | 16px gutters; 28px app title; single-column forms and content groups.                 |
| sm · 40rem  | Allow wider action rows only when their content fits.                                 |
| md · 48rem  | 24px gutters; eligible content can use two columns.                                   |
| lg · 64rem  | Show 224px desktop sidebar; main content gets the remaining width.                    |
| xl · 80rem  | 32px gutters; local lesson outline may sit beside reading content when both fit.      |
| 2xl · 96rem | Keep content maximum; do not stretch reading measure or increase density arbitrarily. |

The threshold values follow the documented Tailwind defaults; the behaviors above are this draft’s choices. Raster image dimensions are not evidence of CSS viewport widths. [W03; A01 §6]

Use available content width—not simply viewport width—to decide card columns. Subtract the sidebar, page padding and any local outline first. For the lesson reader, collapse the secondary outline into an accessible disclosure before compressing the reading column. A mobile navigation panel’s complete dismissal/focus contract belongs in sections 16 and 24; the specimen uses a native document-navigation disclosure, not a production mobile menu.

Keep four families: marketing, authenticated application, lesson reader, standalone utility. Marketing can have a footer and a contained hero. Working views should not inherit the mockups’ newsletter footer, template browser or repeated promotional banner by default. Maintenance stays outside the authenticated sidebar and must preserve truthful status and recovery instructions. [A01 §§6–8]

The repo’s inspected shell still uses SiteHeader and a centered PageShell. Sidebar adoption must preserve auth, eligibility and safe-area behavior; it is not just a CSS recolor. Reuse centralized route constants instead of adding the mockups’ unsupported destinations. [A01 §9]

### Responsive validation

The standalone specimen was checked at 320, 390, 768, 1024 and 1440 CSS px, plus coarse-pointer targets and 200% root-text enlargement at 390px. It has no page-level horizontal overflow in those checks. Actual browser zoom, Safari/Firefox, translated content and the full app remain separate gates. Tables and code may need their own intentional scroll regions; hiding page overflow is not a fix. [W09]

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 07 — Borders, radius & elevation

### Radius roles

| Role    | Value  | Usage                                           |
| ------- | ------ | ----------------------------------------------- |
| Micro   | 4px    | Small inset details only.                       |
| Control | 8px    | Buttons, inputs and navigation items.           |
| Card    | 12px   | Panels, content cards and grouped sections.     |
| Overlay | 16px   | Dialogs, drawers and popovers.                  |
| Pill    | 9999px | Badges, compact status labels and round shapes. |

These roles replace visual drift, not component APIs. The existing CSS derives rounded aliases from a 12px base and exposes a separate 32px marketing radius. Assign explicit target roles before changing global rounded utilities. [A01 §5; R01]

### Boundary and focus contract

Use 1px borders for ordinary boundaries, 2px for intentional emphasis and the focus ring. Subtle dividers use `#253244`; required control boundaries use `#62738A`; hover/strong boundaries use `#8C9CB2`. A field must not lose its invalid border when hovered or focused.

The default focus treatment is **2px solid `#B3A2FF`, offset by 2px**, with a dark separating layer for bright controls. Focus remains visible during hover and pressed states. The specimen tests actual keyboard focus, not just its forced-focus preview. This is a system treatment, not a claim that every composed page satisfies WCAG focus requirements. [W08]

### Elevation and layers

| Role           | Token value                                      | Use                                                |
| -------------- | ------------------------------------------------ | -------------------------------------------------- |
| Surface        | Background/border difference, no required shadow | Most working panels.                               |
| Raised shadow  | `0 4px 16px 0 rgb(0 0 0 / 0.24)`                 | Optional raised surfaces.                          |
| Overlay shadow | `0 16px 48px 0 rgb(0 0 0 / 0.48)`                | Dialogs/popovers.                                  |
| Scrim          | `rgb(0 0 0 / 0.72)`                              | Background dimming, not a text contrast guarantee. |

The layer order is base 0, sticky 10, menu 20, scrim 40, dialog 50, toast 60, skip link 100. Validate these against existing portals and local stacking contexts; a larger z-index cannot escape a parent stacking context. Browser top-layer elements have separate behavior.

Purple/blue atmospheric glow belongs to optional imagery treatment, not elevation. Do not add a glow to every focused panel or use a shadow instead of a necessary control border.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 08 — Iconography

Use the existing Lucide-based interface vocabulary rather than introduce another icon family. Lucide imports are present in the inspected components; the sizes and stroke rules here are proposed normalization choices. The Atlaris compass is a separate brand asset, not a generic interface glyph. [A01 §7; R03]

| Artwork box | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| 12px        | Exceptional micro annotation; never an independent small hit target. |
| 16px        | Compact label-adjacent icon.                                         |
| 20px        | Default interface icon.                                              |
| 24px        | Prominent icon or navigation treatment.                              |
| 32px        | Feature illustration, not a default toolbar icon.                    |

Start with a consistent **2px stroke at a 24px icon coordinate system**, rounded caps/joins and an 8px icon-to-label gap. Retain the selected icon library’s proportions. Do not mix unrelated outlined, filled and duotone styles to decorate different pages.

Provide visible text where the meaning is ambiguous. Icon-only controls need an accessible name and a full-size button target; a tooltip is not the accessible name. Decorative icons accompanying a complete label should be hidden from assistive technology. Current navigation and status use explicit labels/markers rather than recoloring alone.

Do not infer search, notifications, projects or community functionality from a mockup icon. Use only actual routes and supported actions. [A01 §8]

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 09 — Imagery

### Preserve the approved visual language

The source screens establish cool-black landscapes, astronomical horizons, isolated distant highlights and subdued blue/lavender atmosphere. Use them to frame a message, not as repeated decoration beneath every control. This is observed visual direction; exact crop, overlay and brightness settings were not supplied. [A01 §6; A03]

| Slot               | Draft rule                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Marketing hero     | One atmospheric image with a quiet text-safe region; responsive crop chosen intentionally.                         |
| Application header | Optional compact image, not a mandatory full-height hero.                                                          |
| Lesson reader      | No decorative image behind prose, code, form fields or progress labels.                                            |
| Plan card          | Use imagery only when it aids recognition; keep status/actions outside the image.                                  |
| Maintenance        | Atmosphere may be prominent, but status, affected capabilities and a truthful recovery instruction remain primary. |

Default working surfaces remain opaque. When imagery touches text, test the actual composite under that text; an assumed overlay percentage is not a readability guarantee. A proposed overlay must be verified at each crop and breakpoint. Decorative art carries no essential information and needs no spoken description; informative art needs an appropriate alternative.

### Asset workflow

The uploaded archive contains full-screen raster references, not separate planet/landscape source files. The thumbnails in this package are labeled references only. Do not crop an approved UI screenshot and ship it as a hero background. [A01 §2]

Prepare only the imagery needed for the next implemented page. For each independent asset record source/provenance, intended slot, aspect ratio, focal point, crop, overlay, alt-text policy and performance variants. Do not assume metadata or a screenshot proves asset rights.

A draft starting point is a 16:9 landscape source for optional cards and a wider, separately cropped hero derivative. These are slot proposals, not additional required assets. No new imagery is generated as part of this stage.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 10 — Motion

No timing is recoverable from a still screenshot. The following timing/behavior contract is newly specified from the audit’s proposals, not an observed property of the approved PNGs. The old dashboard’s 500–720ms sequences are source evidence, not the required new default. [A01 §6]

| Role              | Duration | Easing                                      | Use                                                     |
| ----------------- | -------- | ------------------------------------------- | ------------------------------------------------------- |
| Feedback          | 150ms    | `cubic-bezier(.2, 0, 0, 1)`                 | Color/border changes on controls.                       |
| Overlay           | 200ms    | Enter `(0, 0, .2, 1)`; exit `(.4, 0, 1, 1)` | Nonessential fade and small content transitions.        |
| Deliberate reveal | 300ms    | Enter `(0, 0, .2, 1)`                       | Optional contextual reveal; not a page-loading gate.    |
| Immediate         | 0ms      | None                                        | Reduced-motion equivalent and urgent state information. |

Animate only what communicates a change. Do not animate a percentage unless it corresponds to real progress, and do not invent estimated completion time from a spinner. Avoid repeating atmospheric motion in working views. Hover does not require movement or a lifted card.

The specimen contains an 800ms linear spinner as a local demonstration, not an additional recovery estimate or motion brand principle. Under `prefers-reduced-motion: reduce`, spatial transitions and that spinner stop while their text labels remain. This preference handling is a project baseline; it does not replace testing keyboard, focus or real asynchronous behavior. [A01 §6; W01]

Reduced motion must never leave an element at opacity zero awaiting an animation-end event. Focus changes and announcements should not depend on visual animation. Next-stage component specifications must define dismissal, pending actions and focus restoration where applicable.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 11 — Primitive tokens

### Authoring format

`tokens/atlaris.tokens.json` is the single editable token source. It uses the **DTCG 2025.10** format for the types present in this package. This is a stable Community Group specification, not a W3C Recommendation. The included compiler validates the Atlaris subset; it is not a complete general-purpose DTCG implementation or an import guarantee for every design tool. [W04]

The source has three explicit groups: `primitive`, `semantic`, `component`. Individual token/group keys do not contain periods; periods in a reference path separate nested groups. Each token has `$type`, `$value`, `$description` and provenance metadata under `$extensions.app.atlaris.design-system`. [W04]

Primitive categories are color, spacing, radius, border width, control/icon size, layout, breakpoints, font family/weight/size/tracking, motion duration/easing, stacking layers, opacity and shadow. Only the needed palette range is included; this is not a synthetic ten-step scale for every hue.

### Example

```json
{
  "primitive": {
    "color": {
      "lavender": {
        "500": {
          "$type": "color",
          "$value": {
            "colorSpace": "srgb",
            "components": [0.5450980392156862, 0.47058823529411764, 1],
            "alpha": 1,
            "hex": "#8B78FF"
          },
          "$description": "Draft primary-action palette value."
        }
      }
    }
  }
}
```

Colors use typed sRGB objects. Dimension values use `px` or `rem`; durations use `ms`; easing uses four-number cubic Bézier arrays; typography and shadows use composites. A 70ch reading measure stays a documented CSS layout rule rather than an invented unsupported token type. [W04]

Do not hand-maintain separate CSS values. Running `python3 scripts/build.py` produces scoped CSS, a resolved JSON view, the token catalog and contrast reports. The HTML specimen is rebuilt from its template plus generated tokens. The script uses Python’s standard library; no build dependency installation or external request is required.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 12 — Semantic tokens

Semantic roles express intent so a future palette change does not require editing every component. The word “primary” is deliberately split into action, text/link, focus, selection and chart roles.

```text
primitive.color.lavender.500
          ↓
semantic.color.action.primary.background
          ↓
component.button.primary.background
```

| Namespace                                   | Responsibility                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `semantic.color.background.*`               | Canvas, surface, raised, hover and selected roles.                         |
| `semantic.color.text.*`                     | Primary, secondary, muted, inverse and links.                              |
| `semantic.color.border.*`                   | Subtle grouping vs required control boundaries.                            |
| `semantic.color.action.*`                   | Primary, destructive and inverse foreground/fill states.                   |
| `semantic.color.status.*`                   | Success, warning, danger and info; each with foreground/background/border. |
| `semantic.color.state.disabled.*`           | Opaque disabled background, foreground and border.                         |
| `semantic.color.focus.*`                    | Focus ring and separating color.                                           |
| `semantic.color.chart.*`                    | Five series, axes and decorative grid.                                     |
| `semantic.type.*`                           | The type roles in section 04.                                              |
| `semantic.space.*`, `size.*`, `radius.*`    | Reusable geometric roles.                                                  |
| `semantic.layout.*`, `motion.*`, `shadow.*` | Shared layout and behavior values.                                         |

CSS names are deterministic: replace path separators with hyphens and add `--at-`. For example, `semantic.color.text.primary` becomes `--at-semantic-color-text-primary`. Generated CSS retains alias relationships with `var(...)` rather than copying a color literal into every component.

### Scope and integration contract

All generated tokens live on `[data-atlaris-theme="dark"]`. Theme overrides must be declared on the same token-owning element so aliases resolve in the intended context. Do not attach an arbitrary dark token scope inside a light page and assume all vendor portals inherit it.

Do not bind one old global variable to two incompatible purposes. In particular, the current destructive button hardcodes white text and opacity-modified fills, while fields use destructive color for errors. New destructive action and error roles need coordinated component changes, not only an edit to `--destructive`. [R03, R04]

The repo mapping is a proposal anchored to the audited commit. No CSS is imported into the app by this package, no light tokens are overwritten, and no global Tailwind spacing value is changed.

---

_Source: Foundations v0.2. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 13 — Component tokens

Component aliases translate foundations into a small reusable contract. This chapter defines the token interface and representative previews; it does **not** complete all of sections 14–19.

### Actions

| Token family                                           | Draft contract                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `button.primary.*`                                     | Dark label; default, hover, pressed fills.                                                 |
| `button.destructive.*`                                 | Distinct destructive fill/foreground state pairs.                                          |
| `button.inverse.*`                                     | Marketing/utility light action state pairs.                                                |
| `button.secondary.*`                                   | Raised neutral default; darker contextual interaction backgrounds.                         |
| `button.outline.*`                                     | Visible control border, opaque canvas-family surfaces.                                     |
| `button.ghost.*`                                       | No required default boundary; visible label and hover/pressed feedback.                    |
| `button.disabled-*`                                    | Shared opaque unavailable colors; not an opacity multiplier.                               |
| `button.height*`, `padding-*`, `radius`, `gap`, `text` | 32/40/44/48px minimum-size roles; 8px radius/gap; label typography.                        |
| `button.soft-primary.*`, `button.success.*`            | Existing variant baseline aliases only; complete state recipes are deferred to section 14. |
| `link.*`                                               | Independent underlined inline-link colors.                                                 |

Default/hover/pressed state never suppresses keyboard focus. Loading keeps a useful label, announces status appropriately and prevents duplicate operations. In the local demo, `aria-disabled` is paired with an actual event guard; ARIA alone does not disable an action. Focus is retained while loading, and the label’s space is reserved to avoid a shifting button.

The repo has nine current variant names: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `cta`, `soft-primary`, `success`. Preserve call-site compatibility. Map `default`/`cta` to primary roles as appropriate, but do not silently remove variants or ship an `inverse` prop before its API decision is made. “Inverse” is currently a design context, not a claimed existing prop. [R03]

### Fields

| State / property | Token assignment                                                                       |
| ---------------- | -------------------------------------------------------------------------------------- |
| Default          | Opaque surface, primary foreground, control boundary.                                  |
| Placeholder      | Muted text at full opacity; never the field label.                                     |
| Hover            | Strong boundary.                                                                       |
| Focus            | Focus border/ring; actual visible keyboard treatment.                                  |
| Invalid          | Danger border + explicit error copy; preserve invalid border on hover/focus.           |
| Read-only        | Raised background; primary text; retain focus/selection.                               |
| Disabled         | Opaque disabled background/foreground; communicate reason outside the field.           |
| Geometry         | 40px default / 44px coarse minimum; 8px radius; 12px inline padding; 16px field value. |

Labels, helper text and errors are part of the field’s composed behavior. Use real labels and associate errors by ID. The specimen includes each state but is not a complete submission/validation implementation; those patterns follow in sections 15 and 22.

### Surface, navigation, overlay and progress aliases

`component.surface.*` owns background, text, grouping border, radius and padding. `component.navigation.item.*` owns default/current text, hover/current fill, current marker, radius and target height. `component.overlay.*` owns raised background, control border, shadow, radius and max-width; it does not replace the existing accessible overlay primitive. `component.progress.*` owns fill and track while labels/values preserve actual metric meaning.

Do not turn a whole surface into a clickable div because the visual card has hover styling. A navigation card needs a real link; a data selection needs the appropriate control. A lock or generating state must preserve real entitlement and deletion restrictions. [A01 §§7–9]

### Completion boundary

This stage provides token-ready foundations, representative action/field states, a scoped browser specimen and a repository migration map. The following remain next-stage work: complete component anatomy/variants, all nine button variants’ recipes, combobox/selection behavior, navigation and overlay keyboard contracts, vendor auth UI, production page compositions, and all new light-theme decisions.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 14 — Actions

### 14.1 Button anatomy and purpose

An action button contains an optional leading icon, a concise action label, and optionally a trailing directional icon. Icons are decorative when the label already names the action. A pending action may replace the leading icon with a spinner without removing the label. Labels wrap when necessary; alignment is maintained with an 8px internal gap.

Use a native button for mutations, opening overlays, changing local state and form submission. Use a link for navigation. Existing `Button asChild` supports link composition; it does not make anchors behave like disabled native buttons. Always set `type="button"` for non-submit buttons inside forms. An icon-only action must have an accessible name and the same target-size policy as a labeled action. [R02; W01]

### 14.2 Variant compatibility and visual recipes

The repository exports nine variant names. Keep all nine call-site contracts. The draft’s names describe appearance; they do not authorize incompatible prop renaming. The PDF and HTML show the recipes, including all six main interaction states. [R02]

| Existing `variant` | Draft visual role      | Default / hover / pressed background | Foreground                 | Use                                                                                           |
| ------------------ | ---------------------- | ------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| `default`          | Primary                | `#8B78FF` / `#A08FFF` / `#7C68EB`    | `#070B10`                  | Main action in a decision area.                                                               |
| `cta`              | Prominent primary      | Same primary state colors            | `#070B10`                  | Existing marketing call sites; prominence comes from placement/size, not mandatory lift/glow. |
| `secondary`        | Neutral                | `#111A25` / `#1B2838` / `#1B2838`    | `#F8FAFC`                  | Supporting actions.                                                                           |
| `outline`          | Bounded secondary      | `#0B1118` / `#111A25` / `#1B2838`    | `#F8FAFC`                  | Supporting action needing a visible boundary.                                                 |
| `ghost`            | Quiet                  | Canvas-context base / raised / hover | `#F8FAFC`                  | Toolbars and low-emphasis actions.                                                            |
| `link`             | Text action/link style | No required fill                     | `#AE9CFF`; hover `#B3A2FF` | Underlined inline navigation or a genuine text action with correct element semantics.         |
| `destructive`      | Destructive commit     | `#C7344F` / `#CE3954` / `#BA2C46`    | `#F8FAFC`                  | Final irreversible action, not routine navigation.                                            |
| `soft-primary`     | Restrained accent      | `#1C1933` / `#111A25` / `#1B2838`    | `#AE9CFF`                  | Supporting accent; link-colored boundary.                                                     |
| `success`          | Positive action        | `#65D7AF` / `#87E4C5` / `#49BC95`    | `#070B10`                  | Existing positive-action contexts; not an automatic replacement for every completed state.    |

**Inverse context:** v0.2’s light action (`#F8FAFC` / `#E2E8F0` / `#B8C5D6`, dark label) remains a documented marketing/utility context. `inverse` is not an existing Button variant. Do not ship that prop by assumption; adopt through a reviewed alias/API change only when a real call site needs it. [A01]

A ghost control may inherit a quiet host surface instead of painting a conspicuous canvas rectangle, provided its text/focus pairs are tested on that host. The provided forced-state matrix uses the canvas context. This is a composition rule, not a silent replacement of the inherited background token.

### 14.3 Dimensions

| API size                       | Minimum height | Inline padding |   Icon artwork | Target rule                               |
| ------------------------------ | -------------: | -------------: | -------------: | ----------------------------------------- |
| `sm`                           |           32px |           12px |           16px | At least 44px for coarse-pointer layouts. |
| `default`                      |           40px |           16px |           20px | At least 44px for coarse-pointer layouts. |
| `lg`                           |           48px |           24px |        20–24px | Already exceeds the touch policy minimum. |
| `icon-sm` / `icon` / `icon-lg` | 32 / 40 / 48px |       Centered | 16 / 20 / 24px | Grow hit area independently of glyph.     |

Use `min-height`, not a hard clipping height. Use the inherited label type role: nominal 14px / 20px, weight 500. Keep 8px radius and gap. Narrow forms may use full-width primary actions; adjacent actions stack only when they no longer fit. Avoid CSS ordering that differs from keyboard/reading order. These values are draft geometry, not measurements recovered from PNGs. [A01]

### 14.4 State contract

| State          | Appearance and behavior                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Default        | Semantic variant tokens. One clearly dominant action per local decision.                                                                        |
| Hover          | Variant hover background; do not add movement to routine working controls.                                                                      |
| Pressed        | Pressed background while pointer/key activation is held; focus remains visible.                                                                 |
| Keyboard focus | 2px opaque lavender outline with 2px separation; dark separator for bright fills.                                                               |
| Disabled       | Opaque disabled surface/text/border; native `disabled` where appropriate, with a visible nearby reason when needed. No hover/activation.        |
| Loading        | Retain a useful action label plus a busy cue, maintain width, prevent duplicate action, provide a concise status message. Do not invent an ETA. |

Loading is not identical to unavailable. Where retaining focus during an ongoing action matters, use `aria-disabled="true"` **and an actual click/submit guard**, plus `aria-busy` and an appropriate external status region. Native disabled is valid for genuinely unavailable controls; do not depend on it to preserve focus during all async flows. The existing Button does not have a dedicated `loading` prop, so this is a composed contract until an API change is deliberately introduced. [A01; R02]

Do not infer a server-side cancellation guarantee from changing a label or dismissing a dialog. On failure restore the action only when safe to retry; preserve user input and show a local error. On unknown mutation outcome, reconcile before repeating the mutation. [R16, R17]

### 14.5 Link and icon-only rules

Inline links remain visibly underlined; color alone is not the sole affordance. A link-like button still uses button semantics. Do not use `href="#"` as a production substitute for an action. Disabled navigation is better rendered as explanatory non-navigation content than as an anchor that still follows an `href`.

For icon buttons use an action-specific name: “Actions for React fundamentals”, not “More”. A tooltip can supplement but cannot supply the only accessible name. Keep focus outlines outside clipping containers. Do not put an interactive link or button inside another button.

**Acceptance:** each of the nine variant recipes has default/hover/pressed/focus/disabled/pending coverage; real keyboard activation causes one operation; disabled controls cause none; busy actions reject duplicates; enlarged labels fit; native link behaviors remain intact. All production acceptance remains to be tested in the app.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 15 — Forms

### 15.1 Field composition

A field is a **composition**, not an asserted new shared component export:

`Label → required/optional indicator → control → help text → validation message`

Use a real label linked by `htmlFor`/`id`, or the matching supported labeling mechanism of the existing primitive. The field value uses the inherited 16px / 24px input role. Help and errors use body text; essential instructions never become tiny metadata. Separate label/control/help relationships by 8px and fields by 24px. Reuse Input, Textarea, Label, Select and Switch rather than introducing a competing form system. [A01; R01, R03, R04]

Use `required` when it is a real validation requirement, and visible “Required” or clear form-level explanation. The placeholder is an example, not the label. Prefix/suffix icons are decorative unless they perform a distinct, named action. Reserve their space rather than drawing them on top of text. Do not store secrets or real user content in design specimens.

### 15.2 Input and textarea states

| State              | Background / border                                         | Content and semantics                                                              |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Empty              | Surface / control boundary                                  | Persistent label; optional example placeholder.                                    |
| Filled             | Surface / control boundary                                  | Actual value, not faded placeholder styling.                                       |
| Hover              | Surface / strong boundary                                   | Do not override invalid state.                                                     |
| Focus              | Surface / focus border + separate outline                   | Keyboard-visible outline; associated help retained.                                |
| Invalid            | Surface / danger foreground                                 | `aria-invalid`, associated corrective message and non-color indication.            |
| Invalid + focus    | Danger boundary + focus outline                             | Both error identity and keyboard location remain visible.                          |
| Read-only          | Raised / control boundary                                   | `readOnly`; selectable value, focus allowed. No implication of editability.        |
| Disabled           | Disabled surface/text/border                                | Native disabled; explain availability separately.                                  |
| Pending validation | Keep the field usable unless the operation requires locking | Announce meaningful completion, not every keystroke. No fabricated “valid” result. |

Inputs use a 40px default minimum, 44px on coarse pointers, 12px inline padding and 8px radius. Textareas begin at a proposed 96px minimum and allow vertical resizing/content growth. Do not use fixed heights that crop multi-line localized text. The existing Input uses opacity and `dark:bg-input/30`; migrating it requires recipe changes as well as token substitution. [R03; A01]

### 15.3 Select versus menu versus combobox

The current `Select` is Radix-based and exposes a composed Root, Trigger, Value, Content and Item API. Trigger `size` is `sm | default`; content defaults to popper positioning. Preserve value/name/disabled/required handling and the primitive’s keyboard selection and focus behavior. A Select chooses a field value; a DropdownMenu invokes commands. [R04; W07]

The native select in the specimen is explicitly a **standalone behavior proxy**, not a visual or keyboard-parity test of Radix Select. Production retains Radix, with opaque field and popup surfaces, visible selected checkmark, highlighted-option treatment and a viewport-constrained list. Document long option wrapping and label names; never rely on a clipped display value as the only available full label.

Do not claim search-as-you-type or multi-selection from this select. A searchable combobox, multi-select and slider are deferred unless an actual screen requires one. No new dependency is requested by this specification. [R01]

### 15.4 Checkbox and switch

The plan library already uses native checkbox inputs. Retain their native checked/disabled behavior. A proposed 20px visual box sits in a target area of at least 32px for fine pointers or 44px for coarse pointers. Use a visible border when unchecked and a dark checkmark on lavender when checked. An indeterminate parent represents some—not all—eligible rows selected; assign the native `indeterminate` property. Never count generating, ineligible rows as selectable. [R15; W04]

The existing `Switch` is Radix-based. Its draft visual track is 44 × 24px with a 20px thumb and a larger target wrapper. Off uses raised fill/light thumb; on uses lavender/dark thumb. The visible label remains unchanged as the state changes. The switch supports only on/off, not indeterminate. Use it for an immediate preference only when that behavior is actually supported; do not replace an explicit Save flow with auto-save merely because the control looks like a switch. [R05; W05]

Read-only is not a native switch/checkbox state. For non-editable settings show a clearly labeled value; do not fake read-only by leaving a switch clickable while discarding its changes. On a remote-save failure restore the confirmed value and explain failure. These are draft error-handling requirements, not claims that the existing Switch wrapper implements persistence.

### 15.5 Validation and submission

Validate at a deliberate point: submit, or blur after user interaction where helpful. Do not mark an untouched empty field as an error on first render. After a failed submission, preserve values, show errors adjacent to their fields, and move focus to the first invalid field for a small form or to a linked error summary for a longer one. Choose one announcement strategy to avoid repeating the same error from multiple live regions. [W02]

The specimen demonstrates a required topic field, a select, a textarea, retained values, busy submit, and a local error/success response. Its single “required topic” rule is illustrative; real plan-generation validation, quotas and eligibility still come from the application. It does not redefine the generation schema or allocate credits.

**Existing API illustration:**

```tsx
<Label htmlFor="topic">Learning goal</Label>
<Input
  id="topic"
  name="topic"
  aria-invalid={Boolean(error)}
  aria-describedby={error ? 'topic-help topic-error' : 'topic-help'}
/>
<p id="topic-help">Describe what you want to learn.</p>
{error && <p id="topic-error">{error}</p>}
```

`Label` presence is directory-verified; this example uses its normal label-composition intent, not a new custom form API. Do not add `role="alert"` to every static field error in addition to a focused summary.

**Acceptance:** persistent labels, associated help/errors, invalid border surviving hover/focus, values retained after error, keyboard choice operation, mixed selection correct, touch targets independent of glyphs, 200% text and narrow-layout reflow. Native-select tests are not Radix tests.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 16 — Navigation

### 16.1 Real destinations and app shell

The route source contains `/`, `/landing`, `/dashboard`, `/plans`, `/plans/new`, `/analytics`, `/analytics/usage`, `/analytics/achievements`, `/settings`, `/pricing`, `/about`, plus auth and a plan-detail helper. Route existence is not a mandate to put everything in the sidebar. No Projects, Resources, Notes, Community, global search or notifications feature is inferred from a mockup. [R14]

The proposed primary application navigation is Dashboard, Your plans, Analytics and Settings, with New plan as an action. Retain auth, entitlement and account controls in the real shell. Achievements remains a separate existing route with its previously documented Coming Soon status, not an invented badge dashboard. The existing shell’s SiteHeader-to-sidebar migration belongs to the integration and page-pattern phase. [A02]

Navigation uses links and an appropriately named `<nav>`. Mark the current destination with `aria-current="page"`, a persistent marker and the selected-surface token. Use 44px minimum item height, 8px radius and 8px icon/text gap. A current item can still show hover and keyboard focus. Do not give ordinary site navigation `role="menu"`; it is not a desktop command menu. [A01; W08]

### 16.2 Responsive navigation

At the inherited 64rem threshold, desktop navigation may become a 224px sidebar. Below it, expose a clearly named Menu button and reuse the existing modal Sheet composition. Opening moves focus into the panel, background is inert, Escape/Close dismiss it and focus returns to the trigger. If a navigation click changes route, close the sheet and focus the destination’s main heading through the app’s route-focus policy—not a disappearing mobile trigger. [A01; R07; W09]

The specimen’s sheet links navigate to document sections, not actual account routes. It demonstrates dismissal/focus using native dialog mechanics; production preserves the Radix Sheet foundation.

### 16.3 Local tabs are not route filters

Use tabs only for layered **local panels**. Provide tablist/tab/tabpanel relationships, selected state and a single entry in the tab order. Arrow keys move among tabs; Home/End move to the edges. Activate automatically only when switching is immediate; use manual Enter/Space activation when loading would create delay. The specimen demonstrates automatic local tabs. There is no shared `Tabs` export at the inspected baseline: this is a proposed composition contract, not a request to add another page or install a tab package. [R01; W03]

Plan status filters and sorting are URL/query operations in the existing library. Keep those as links or form controls, preserving search/status/sort and resetting page when appropriate. Do not add tab roles just because the filters are drawn as a segmented row. [R15]

### 16.4 Breadcrumb, pagination and disclosure

Breadcrumbs are a named navigation region containing a list of ancestor links and the current item. Let long paths wrap or collapse intermediate entries through an explicit disclosure; keep the immediate parent available. Separators are decorative. A link to a module must use the existing real route, not a path invented from an English label.

Pagination uses existing query semantics. Include a current page indicator; do not render disabled previous/next anchors that still navigate. Preserve filters and sort when moving between pages. Keep keyboard/reading order aligned with visual order. The shared UI directory does not contain a pagination wrapper; the library already composes Buttons and Links. [R01, R15]

Disclosure is a button/summary that reveals local content, not a route or tab. Use the existing Accordion family where that composition is appropriate. Expanded state must be programmatic. Native `<details>` is used for supporting specimen documentation; its inclusion does not replace the production Accordion implementation.

**Acceptance:** only real destinations, current marker independent from focus, no fake menu roles on navigation, tabs and URL filters distinguished, narrow sheet dismissible, long labels wrap, focus returns or moves intentionally after navigation, no essential control hidden behind a decorative hero.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 17 — Data display

### 17.1 Surface and card

Surface is a presentational wrapper around a div, with existing variants `default`, `muted`, `interactive`, `inset` and padding `none`, `comfortable`, `compact`. Preserve those APIs. Map comfortable padding to the draft 24px role and compact to 16px through a reviewed recipe change; do not expect a global spacing change alone to match the target. Cards can continue composing the existing Card parts rather than acquiring a second framework. [R08; A01]

| Role                | Draft treatment                                                               | Interaction rule                                                        |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Default surface     | Opaque surface, subtle border, 12px radius                                    | No hover affordance unless a real action exists.                        |
| Muted surface       | Raised fill, restrained boundary                                              | Supplemental content, not disabled content.                             |
| Inset               | Canvas-family fill, subtle border                                             | Nested detail, code or supporting values.                               |
| Interactive surface | Surface → raised hover; control-strength boundary when it identifies a target | Real link/button semantics; do not make a div clickable by style alone. |

A card with a primary link and an actions menu must not become one giant link containing a nested button. Keep title link, selection control and action menu independently reachable. Whole-card link overlays must not intercept those controls. No hover-only reveal for critical actions on touch.

### 17.2 Badge and state labels

The existing Badge variants are `default`, `secondary`, `destructive`, `outline`, `product`; its default is `outline`. These are visual variants, not business status enums. Compose status-specific colors using the semantic status families without claiming a new `status` prop exists. [R09]

The draft badge uses metadata typography, pill radius, 8px inline/2px block padding. A status label is not an interactive target unless it is intentionally a filter or link. Use icon/word plus color for Active, Completed, Generating, Failed, Not started and Inactive. Locked is an **access condition**, not automatically another lifecycle status. Generating is ongoing, not necessarily a warning. Avoid showing all states as equally positive lavender pills.

Demo statuses and counts are specimen data. A green completed label alone must not imply a task was persisted. Render authoritative server state after reconciliation.

### 17.3 Plan table and selection

Preserve the existing plan-library contract: selection; Plan, Progress, Tasks, Status and Updated columns; actions; sortable columns; search and status query; pagination. Generating plans cannot be bulk selected/deleted. Locked entries do not expose hidden completion values. The new visual language is not a reason to remove these behaviors. [R15; PlanRow source contract carried forward]

Use native table semantics. Table currently wraps an overflow container and forwards table props, but that wrapper itself has no named keyboard-scroll API. A new focusable/named scroll-region contract must be deliberately introduced or composed; do not assume passing an attribute to Table will attach it to the wrapper. Place sort state on the relevant header (`aria-sort`) and put an actual button/link inside it. Do not add grid roles unless the full grid keyboard model is implemented. [R10]

The specimen table supports local sorting and eligible-row selection; it intentionally scrolls inside a named region on narrow screens. It is not a new production card/list toggle, server pagination or server-search implementation. The select-all control reflects only eligible rows shown in the current view; mixed state remains visible. The bulk toolbar is shown only when something is selected, with an explicit count and Clear action.

### 17.4 Progress

Use the actual completed/total task values and existing rounding rules. Zero is a real value; absent total is not zero completion. Unknown job progress uses indeterminate status, not an arbitrary 37% bar. Keep a visible label, units and the numeric relationship. Do not use completion events as if they were unique completed tasks. [A02; R18]

**Explicit refinement from v0.2:** its lavender fill against a fully painted `#62738A` track has inadequate 3:1 contrast for distinguishing those adjacent quantities. The old `component.progress.track` token remains unchanged for compatibility. The new recipe uses `component.progress.track-background` (surface) for the remaining rail and `component.progress.track-border` (control boundary) for its outline; fill remains lavender. This is a disclosed component-recipe change, not an unannounced foundation replacement. Exact ratios and rejected legacy pair are in the contrast report. [T01]

The existing Progress wrapper maps `(value || 0)` to its indicator transform. A correct indeterminate visual must therefore be deliberately added at integration; an omitted value does not currently create a new spinner/indeterminate animation by magic. Preserve the underlying primitive semantics and clamp/validate known values. [R11]

### 17.5 Analytics and charts

Keep the existing **Eight-week pulse**, showing progress changes per plan by week, and exactly these seven metric families. Do not substitute the uploaded mockup’s invented analytics. [A02; R18]

| Metric           | Required meaning                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Tasks            | Current completed / total tasks and completion percentage.                                |
| Modules          | Current completed / total modules and completion percentage.                              |
| Completed time   | Sum of estimates for currently completed tasks, not tracked elapsed study time.           |
| Progress changes | Current-week status-change count; comparison with previous week.                          |
| Completed events | Current-week completed-status events; can differ from unique tasks; estimated time added. |
| Active days      | Days with activity this week, out of seven.                                               |
| Streak           | Current streak and longest streak from the existing timezone-aware model.                 |

Do not add time-by-plan distribution, live study timers, a recent-activity feed, new date filters or a monthly comparison just to fill a card. Preserve current-week/previous-week comparison semantics. Do not average plan percentages and rename that as the task-completion percentage.

Use the five chart roles, readable axes, direct labels/legend text and non-color differentiation such as line dashes. Add a textual summary or equivalent data table when adopting the new chart treatment; this is an accessibility specification, not an assertion that the existing chart already supplies a visible data-table toggle. Tooltip-only data is insufficient for keyboard/touch readers. Distinguish no plans, no history, loading and query failure; a missing dataset is not an all-zero successful query. [A01; W01]

### 17.6 Lesson content and optional identity

Use the reading measure and prose/code roles from v0.2. Tables and code may scroll within their own regions; paragraphs must reflow. A copy-code action needs a confirmed result and an announced failure path, not a fake “Copied” toast. No code runner, playground or resource library is inferred from artwork.

An avatar is supplemental identity. Keep a stable name/fallback; use an empty alt when adjacent text duplicates the identity. The shared directory has no avatar file, so account/vendor identity rendering is an integration composition rather than an asserted reusable Avatar export. Do not recreate Clerk account management from screenshot fields. [R01; A01]

**Acceptance:** table headers and sort state correct, selection survives intended local operations, generating/locked restrictions retained, counts truthful, numeric progress understandable without color, chart information available beyond hover, and no unsupported metrics or new product controls.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 18 — Feedback

### 18.1 Choose the correct feedback level

| Situation                   | Component/region                                     | Do not use                                               |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Local field problem         | Inline field error                                   | An unrelated global toast as the only explanation.       |
| Recoverable action result   | Nearby status and optional toast                     | A blocking dialog for every successful action.           |
| Important route failure     | Existing RouteErrorState                             | An empty-state panel that suggests the user has no data. |
| No items yet                | Existing RouteEmptyState/Empty composition           | An endless spinner.                                      |
| No filter matches           | Filter-specific empty result and clear-filter action | “Create your first plan” if plans already exist.         |
| Loading known structure     | Skeleton plus named busy region                      | Fake content values that look real.                      |
| Unknown generation duration | Indeterminate status with truthful message           | Invented percent, countdown or refund statement.         |
| Restricted access           | Explanation and actual eligible action               | Disabled-looking content with no reason.                 |

The inspected RouteErrorState has `role="alert"`, title/message, optional retry and alternate actions. Its default retry copy is “Try Again”; the draft sentence-case copy is “Try again”. RouteEmptyState composes Empty parts with an icon/title/description/action. Changing presentation must preserve their distinct semantics. [R12, R13]

### 18.2 Status message anatomy

A feedback region contains an optional decorative icon, short title, specific message and at most one primary recovery action. Use the inherited status foreground/background/border combinations. Padding is 16px, icon-to-content gap 12px and radius 12px. Keep necessary error text outside temporary overlays. Message length drives height.

For ordinary async completion/result messages, use a programmatically determinable status that does not move focus. Use assertive alerts only when the interruption is justified. Announce start and settled outcome, not every animation frame. Avoid duplicate announcements from a toast, inline live region and focused dialog all describing the same result. [W02]

### 18.3 Skeleton and spinner

Skeletons are decorative approximations of the expected layout, hidden from assistive technology. Put the busy state on the containing data region and provide a separate, stable “Loading plans” status. Keep the skeleton’s dimensions near the intended content to reduce jump. A spinner accompanies meaningful text and does not promise time-to-completion.

Under reduced motion, remove pulsing, spinning and spatial transitions without hiding the status text or waiting for an animation event. This extends the v0.2 contract; the existing skeleton file is directory-verified, not runtime-audited for every reduced-motion composition in this stage. [A01; R01]

### 18.4 Toast contract

The repository uses Sonner at the root and in deletion flows; reuse that delivery mechanism. The specimen’s local toast is a behavior preview, not a replacement notification library. [A01 R02; R16, R17]

Draft policy: keep actionable/error information persistent or also available inline. Routine success may dismiss after a reviewed duration, with pause on hover/focus and sufficient time for the content. This stage deliberately uses dismissible **persistent** demo toasts, so no arbitrary timeout is presented as an accessibility requirement. Never add “Undo” unless the backend genuinely supports reversal; deletion copy currently says it cannot be undone.

Toast width must fit within viewport gutters; do not cover the active field/action or trap focus. A visible Dismiss action has an accessible name and a 44px coarse target. Dismissing with keyboard returns focus to a sensible still-present control. While a modal is open, deliver its important status inside the modal rather than behind the inert background or inaccessible top-layer ordering.

### 18.5 Known failure versus unknown outcome

Known validation or authorization failure can name the supported recovery. Network timeout does not prove a destructive action failed. The existing bulk-delete flow already distinguishes an unknown outcome and refreshes/reconciles before another deletion. Retain that safety path and accurate partial-success counts. [R17]

Do not promise “No credits were used”, “Your progress is safe”, “Back in two minutes” or a refund unless the responsible source proves it. These sentences appeared in earlier mockups but are not universal component copy. Maintenance uses real status and refresh/help directions, not a new monitoring dashboard or invented uptime indicator. [A02]

**Acceptance:** loaded/loading/empty/no-results/error/restricted states differ; status messages are named and not overly chatty; reduced motion still communicates work; dismissible feedback retains a recovery path; no false success or refund claim; mutation outcome unknown is not automatically retried.

---

_Source: Components v0.3. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 19 — Overlays

### 19.1 Choose the existing primitive

| Need                            | Existing implementation                                | Draft rule                                                                                 |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Irreversible confirmation       | AlertDialog and DeletePlanDialog/BulkDeletePlansDialog | Important bounded decision; least-destructive initial focus.                               |
| Mobile navigation/side panel    | Sheet, backed by Radix Dialog                          | Modal focus/inert-background/dismissal contract.                                           |
| Contextual commands             | DropdownMenu                                           | Roving keyboard item focus; not a field selector.                                          |
| Field selection                 | SelectContent                                          | Preserve select behavior, selection and value semantics.                                   |
| Short supplementary hint        | Tooltip                                                | Focus/hover support; never essential-only content.                                         |
| Preview behind a link           | HoverCard                                              | Supplemental only; a working destination must remain available.                            |
| Generic centered dialog/popover | No separate shared file in this directory              | Proposed only when needed; reuse installed primitives rather than fabricate a current API. |

Appearance: raised opaque background, primary text, visible control border, 16px overlay radius, inherited overlay shadow, 24px padding (16px narrow) and 16px content gaps. A default centered overlay maxes at 512px while retaining at least 16px viewport inset. Longer content scrolls within an accessible layout, not behind a clipped fixed-height box. [A01; R01, R06–R07]

### 19.2 Dialog anatomy, keyboard and focus

A modal has a visible title, optional concise description, content, status/error region if needed, and a clear dismissal action. Accessible title/description relationships must point to rendered content. Opening moves focus inside; Tab/Shift+Tab remain inside; Escape closes; closing restores focus to its invoker, or a logical surviving element if that invoker disappeared. For destructive confirmation focus Cancel first, not Delete. [W09]

Avoid nesting paragraphs inside a primitive that already renders a paragraph. Current deletion compositions place paragraphs inside AlertDialogDescription; confirm the resulting DOM during integration and use `asChild` with an appropriate container or separate descriptions where necessary. This is an inspection-derived integration concern, not a runtime defect claimed as tested in the app. [R06, R16, R17]

The standalone specimen uses native `<dialog>` with a test harness; production keeps Radix focus and portal behavior. Passing the specimen’s focus tests does not validate Radix call sites or browser/assistive-technology combinations.

### 19.3 Destructive action lifecycle

| Stage                | Visible state                                                     | Permitted actions / focus                                                              |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Before confirmation  | Named object(s), irreversible consequence, accurate business copy | Cancel first; Delete is destructive.                                                   |
| Request pending      | “Deleting…” and a non-percent busy cue                            | Prevent another request. Dismissal is not cancellation; make the distinction explicit. |
| Confirmed success    | Close dialog; updated list/result                                 | Focus a surviving list heading/row or trigger as appropriate; concise success status.  |
| Known failure        | Keep context and a specific inline error                          | Retry only when the error supports it; Cancel/Close stays available.                   |
| Partial bulk success | Confirm deleted/failed counts                                     | Remove confirmed successes; preserve/report failures; refresh authoritative data.      |
| Unknown outcome      | “Could not confirm the result”                                    | Reconcile before retry; do not present failure or success as certain.                  |

**Current behavior versus draft:** single and bulk dialogs prevent duplicate requests, suppress default action auto-close and disable Cancel while deleting. Their inspected `onOpenChange` handlers do not explicitly block Escape dismissal. This package does not silently change that policy. The proposed specimen keeps an explicit “Close status” route during pending work and explains that it does not cancel the request. Adopting that policy requires controlled state, request ownership and app-level focus/reconciliation review; it is not a CSS-only improvement. [R16, R17; W10]

Do not make the modal an indefinite keyboard trap. Do not abort a fetch and claim the server rolled back. A meaningful pending state should continue to settle or expose a recovery route; the visual component cannot guarantee network/database outcomes.

The current confirmation copy names removal of modules, tasks and progress; bulk deletion additionally mentions schedules and generation history, plus the existing credit/no-refund statement. Treat that as pinned source behavior to be reconfirmed with product/billing rules before rewriting, not evergreen financial guidance. Specimen dialogs label all deletion as demo data and perform no network calls. [R16, R17]

### 19.4 Sheet and portal integration

Use a proposed 384px maximum side panel with a viewport-constrained width, safe-area-aware padding and internal scrolling. Provide a visible Close control with full target size. Preserve the title even when the visual layout resembles navigation. Existing Sheet exposes `side` values left/right/top/bottom and delegates to Radix Dialog. Its current 500ms enter/300ms exit and small close glyph need deliberate normalization to the v0.2 200ms/reduced-motion and target-size contract. [R07; A01]

Theme tokens must reach portaled content. Applying the dark theme attribute only to an inner page does not automatically theme Radix portals attached to body. Attach the theme to the portal’s owning ancestor or explicitly use a themed portal container; confirm with an actual integrated dialog/select. Do not overwrite the existing light preference. Browser top-layer elements and CSS z-index are not interchangeable, and the specimen’s native dialog is not evidence about production stacking. [A01; W10, W11]

### 19.5 Menu and tooltip

DropdownMenu preserves its existing default/destructive item variants, `onSelect` behavior, disabled items, focus movement and collision-aware positioning. The draft menu is 192px minimum / 320px maximum, constrained by available viewport width, with 8px padding and 40px minimum item height (44px coarse). The library’s actual plan menu is deletion-focused; this package does not add Rename, Duplicate, Export or Archive commands. [R15, R19]

Use menu-button semantics and a programmatic expanded state; opening focuses an item, arrows navigate, Escape returns focus and typed characters support the primitive’s typeahead where available. Preserve library behavior rather than hand-rolling it in production. A menu-to-dialog transition must restore focus to the lasting trigger or relevant surviving row, not to the now-unmounted menu item. [W06, W11]

The Tooltip provider currently uses a 300ms delay and a 4px content offset. Retain those as source baselines; any changed delay is a new decision, not extracted from a screenshot. The content must be dismissible with Escape, remain open while hovered where applicable, and remain available until focus/hover ends or it is dismissed. Essential help/error text stays inline; interactive content belongs in another pattern. Use the visible/accessible label as the name and the tooltip as additional description. [R20; W12]

**Acceptance:** title/description correct, least-destructive initial focus, forward/backward containment, Escape/Close behavior, restoration to an extant target, pending duplicate guard, known/unknown outcome distinction, portal theme inheritance, short viewport scroll, reduced motion, touch-safe close/menu targets and no tooltip-only essential instructions.

---

_Source: Patterns v0.4. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 20 — Page layouts

### 20.1 Pattern contract and evidence

A page pattern composes the existing components around one job. It does not introduce a new route, data model, entitlement, or component framework. The approved raster designs establish the visual direction; the repository establishes available functionality; v0.2 and v0.3 establish the draft visual rules. When these differ, retain the visual relationships while explicitly recording any proposed behavior change. Source-derived observations and draft decisions remain separate. [A01–A03]

Each pattern below defines purpose, regions, reading order, component composition, responsive behavior, async states, implementation destination, and acceptance conditions. The names are documentation IDs, not new React exports.

### 20.2 Four shell families

| Pattern                  | Purpose and anatomy                                                                                 | Existing integration point                                     | Draft behavior                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P20.1 Marketing shell    | Brand/navigation → page-specific introduction → explanatory sections → verified action/footer       | Existing marketing route group; carried-forward audit          | No authenticated sidebar. Optional illustration stays outside readable text or under a tested overlay. No fabricated customer logos, prices, support channels or testimonials. |
| P20.2 Application shell  | Skip link → navigation → page title/context/actions → main content → account/eligibility context    | App layout, SiteHeader, PageShell and app-shell-width.ts       | 224px navigation from 64rem; content-first mobile Sheet below it. One main landmark and one page h1 in the real route.                                                         |
| P20.3 Learning reader    | Parent plan/module context → task title → compact contents/progress → lesson content → task actions | ModuleDetailContent → ModuleDetailClient → ModuleLessonsClient | Long-form reading measure stays 70ch. The optional local outline yields before the reading column is compressed.                                                               |
| P20.4 Standalone utility | Brand → clear service/access state → explanation → valid recovery action                            | `/maintenance` or route-state composition as appropriate       | No signed-in sidebar, newsletter, sales footer, endless spinner or unverified recovery estimate.                                                                               |

The existing shell still uses a header-aware top offset of `calc(4rem + env(safe-area-inset-top,0px))`, a centered `max-w-7xl` column and shared gutters. A sidebar is therefore an integration proposal, not a current implementation discovered in code. Do not leave the old main offset and add a second full header offset. Header growth, sticky positioning and focus clearance must be considered together. [R01; A01 §9]

**Geometry inherited without token changes:** sidebar `semantic.layout.sidebar` = 14rem; header minimum = 4rem; main maximum = 80rem, excluding sidebar and gutters; form maximum = 40rem. Use the semantic narrow/medium/wide gutters, not page-specific padding copies. Main children need `min-width: 0`; constrain grids with `minmax(0, 1fr)`. These are recipe choices, not measurements of the PNG export. [A02 §06]

### 20.3 Application page header

Compose PageHeader with a title, short factual description, and at most one visually dominant action per decision region. Breadcrumbs precede the title when hierarchy matters; filters belong with the data they control. Async quotas/counts may stream separately without blocking the title or inventing a zero. Preserve space for loading content only where it prevents movement; never reserve a fixed page-header height that clips enlarged text.

A decorative planetary horizon is optional and not a dependency of the layout. Do not recreate it by cropping a screenshot that contains interface text. Until independent production illustrations exist, the specimen uses plain opaque surfaces and layout labels. Brand assets remain the supplied mark/lockup; the canonical full vector lockup and exact screenshot-font identification are still unresolved. [A01–A03]

### 20.4 Page recipe map

| Approved screen / real destination             | First useful content                            | Supporting regions                                             | Preserve / exclude                                                                   |
| ---------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Landing `/` or existing `/landing`             | Product purpose and one next action             | Explanations, real examples, footer                            | Preserve approved visual direction, not every promotional claim.                     |
| Pricing `/pricing`                             | Current purchasable plans                       | Entitlements and questions                                     | Read live billing configuration at implementation; no price or quota is frozen here. |
| About `/about`                                 | Purpose and product story                       | Illustrations and contextual sections                          | No inferred team, customer or performance claims.                                    |
| Dashboard `/dashboard`                         | Existing actionable learning summary            | Existing progress/context                                      | Recompose current data; no new tracking metric to fill a grid.                       |
| Your plans `/plans`                            | Search/filter controls and library items        | Sorting, selection, pagination and usage                       | Preserve query and access contracts; no template browser.                            |
| Generation `/plans/new`                        | Goal plus four preferences                      | Conditional date and valid submission status                   | One form, not the mockup's four-step wizard.                                         |
| Learning plan `/plans/[id]`                    | Current plan position and available next action | Ordered modules, tasks and existing resource context           | Do not unlock prerequisite-restricted learning by changing the layout.               |
| Module/lesson `/plans/[id]/modules/[moduleId]` | Actual task/lesson content                      | Parent context, progress and existing adjacent-module controls | No separate invented lesson URL, runner or playground.                               |
| Usage `/analytics/usage`                       | Eight-week pulse and current metric summary     | Seven existing metric families                                 | No elapsed-time tracking, monthly selector, recent feed or new plan KPI.             |
| Settings `/settings` and profile catch-all     | Account sections on one page                    | Section-level loading and saves                                | Preserve Clerk/vendor ownership and anchor targets.                                  |
| Maintenance `/maintenance`                     | Service state and safe next action              | Short explanatory copy                                         | Do not offer a home link that immediately redirects back to maintenance.             |

The read module route validates parameters and renders data inside Suspense. Its content distinguishes unauthenticated, not found, forbidden, entitlement-required, free-plan-selection-required and internal-error outcomes. Authentication retains a return path to the requested module. Treat these as separate conditions; do not expose protected titles or content in an error template. [R11–R12]

### 20.5 Roadmap and lesson reader

Keep plan, module and task identities separate. The ModuleDetail wrapper derives lesson status from `module.tasks`; ModuleDetailClient delegates task progress through the existing optimistic update hook. Current/previous/next module metadata and prerequisite-completion context already pass through that composition. The proposed reading pattern does not define a new task route or a new section-completion persistence model. [R13–R14]

For a roadmap, use an ordered module list with a named current item, explicit status text and the existing completion values. The active module can expand in place; color alone cannot communicate its status. Only show a Continue action when the application can resolve a valid destination. Future/unavailable items explain why they cannot be started. On narrow screens, collapse noncurrent overview detail before burying the current task below an entire roadmap.

For a reader, keep the task title and essential context above the prose. A compact contents disclosure may precede prose on narrow screens; on a sufficiently wide content region it may sit beside the reading column. Navigation, prose and footer actions retain one logical DOM sequence. Inline code wraps when sensible; formatted code and genuine tables may use a named local scroll region. No global page overflow suppression. [A02 §06; W01]

The specimen demonstrates an outline and sample prose, not actual persisted per-section progress. It does not add a code-execution action. Production status indicators must use the existing task update model. A confirmed save with failed revalidation is **saved but possibly stale**, not a failed save: ModuleDetailClient already presents that distinction. [R14]

### 20.6 Settings and analytics composition

Settings remains a unified ledger: Profile, Plan & billing, Usage, AI model, Integrations, Notifications. Preserve the real section IDs, profile catch-all, checkout synchronization host and independent Suspense boundaries. A local contents list is an anchor index into that page, not six newly created routes or locally reimplemented account management. One section waiting for data must not turn every other section into a skeleton. [R08]

Analytics retains the Eight-week pulse and Tasks, Modules, Completed time, Progress changes, Completed events, Active days, Streak. Layout can regroup the first three as current completion and the remaining four as activity/streak context, provided the time scope is explicit. A task-completion percent is not an average of plan percentages; completed time is estimated, not a timer. A week still in progress should be visibly identified. The companion v0.3 specification remains the detailed metric contract. [A03 §17.5]

**Acceptance:** correct real routes; intact access checks; one page h1/main; optional imagery; one offset owner; stable shell while data loads; no new billing or analytics behavior; no duplicate interactive mobile/desktop trees; task content reachable without traversing a marketing hero.

---

_Source: Patterns v0.4. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 21 — Cards & content groups

### 21.1 Choose the group for the task

| Pattern                      | Use                                                        | Composition and limits                                                                     |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P21.1 Plan library           | Find, compare, resume or manage plans                      | Header/usage → query controls → optional bulk toolbar → results → pagination.              |
| P21.2 Plan item              | Show the same item in a row or compact card                | Selection → title link → progress/tasks → lifecycle/access label → last update → actions.  |
| P21.3 Metric group           | Explain a number in its actual scope                       | Label → value → denominator/units → scope/comparison → chart or textual context.           |
| P21.4 Settings/content group | Relate a label, description and editable/read-only content | Section title/anchor → short description → owner-specific controls → local result/actions. |

Use Surface and Card as existing presentation primitives. A card is not automatically a clickable target. Apply hover affordance to real actions, not static containers; keep a title link separate from selection and deletion controls. An image is optional and must not be necessary to identify the plan. The specimen omits card photography because standalone page-illustration files were not supplied. [A01–A03]

### 21.2 Plan-library contract

The existing library is query-driven, with search/status/sort/page, status counts, quota-aware creation and a free-plan selection gate. The current implementation uses a table with selection, Plan, Progress, Tasks, Status, Updated and actions. The v0.4 **responsive card treatment is a proposal** for that same contract, not a removal of fields. Existing server access and generation restrictions remain authoritative. [A03 §17.3 and source R15]

| Element       | Required behavior                                          | Draft presentation                                                    |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Search        | Retain status/sort; reset page on a new query              | Labeled field and explicit submit; no new search API.                 |
| Status filter | Accept existing statuses; preserve search/sort             | Links or a labeled select, not ARIA tabs.                             |
| Sort          | Preserve supported keys/directions; reset page             | Labeled control or sortable column heading.                           |
| Selection     | Count eligible items on the current page                   | Checkbox with full hit area; indeterminate select-all when partial.   |
| Creation      | Follow `canCreatePlan` / entitlement result                | Existing New plan or Upgrade action, not an always-enabled CTA.       |
| Bulk actions  | Show only with selection; retain deletion restrictions     | Count, Clear and Delete selected.                                     |
| Pagination    | Preserve search/status/sort; previous/next only when valid | Result/page text plus links, reflowing outside a table scroll region. |

The source key for PlansList includes search, status, sort and page. Accordingly, query/sort/page changes reset local selection in the current application. The earlier v0.3 demo's selection-preserving **local** sort was a component demonstration, not a claim about this remounted route. The v0.4 pattern and specimen explicitly reset selection for query changes. Resizing alone must not reset it. [A03; carried-forward PlansContent/PlansList source]

Filter counts must retain the API's scope; the design must not relabel search-scoped counts as account-wide totals. The specimen uses a small fixed dataset and displays its own result count. Its four-item page size is a testing choice, not a new production limit.

### 21.3 One plan, two layouts

The item needs a complete title, normalized visual status, a distinct access condition, task completed/total values when authorized, percentage using existing calculation rules, and a timestamp with a readable relative label. Do not replace task counts with module counts simply because the screenshot did so. Generating or failed items with no valid total show a descriptive nonnumeric state, not `0%` fabricated from missing data. A genuine not-started plan with an authorized denominator can show zero. [A03 §17]

Desktop can retain the native table; a narrow layout can use an article/list with a definition list for Progress, Tasks and Updated. Both draw from one view model. The specimen uses one rendered result representation at a time and restores focus by item/action identity when switching layout. It does not leave two copies of controls in the accessibility tree. In production, prefer CSS-only reflow when semantics remain correct; otherwise deliberately manage focus when changing structure.

**Do not nest a button inside a link.** The card title is the open-plan link; the checkbox and Delete button/menu are siblings. Do not make the whole card a link overlay that intercepts them. For locked items, omit unauthorized completion data from the DOM, accessibility tree and tooltip; show an Upgrade to unlock action only when that is the actual resolution. Locked and Active can coexist because access and lifecycle are separate dimensions.

Deletion remains the existing plan-management command. No Rename, Duplicate, Export, Archive or template action is invented. Generating plans cannot be selected/deleted; permissions must also be checked on the server because a row can change after it is rendered. Parent/child generation restrictions returned by an action must be shown as actual errors, not silently bypassed. [A03 §§17.3, 19.3]

### 21.4 Selection, query and async choreography

Entering a search keeps focus in the search control and announces the result count without moving focus to every update. A filter/sort change does the same. Pagination may move focus to a stable result heading after navigation; apply one app-level route policy rather than having nested components compete. The Clear selection button stays reachable while selection exists. On deletion, focus a surviving heading or logical neighboring item—not an unmounted checkbox.

During a background refresh, preserve confirmed results only if showing them is allowed and their freshness is explained. Disable uncertain destructive actions until reconciliation. A failed read is not a zero-result search. A free-plan selection gate replaces the normal library with the real selection flow; do not show locked data behind it as a faux blur. [A03 §§18–19]

### 21.5 Metrics and groups

Use a consistent label position, tabular numerals where supported, units next to values, and prose for scope. Current completion totals and weekly activity have different denominators. Week-over-week deltas belong to the applicable activity metrics; they should not be added to Tasks or Modules merely to make cards symmetric. Streak compares current and best rather than an invented monthly delta. [A03 §17.5]

For the Eight-week pulse, series labels must refer to real plan topics and existing weekly progress-change counts. A narrow viewport may require fewer visible series or a local scroll region; disclose omissions and retain an accessible equivalent for the represented data. A textual/data-table equivalent is a draft accessibility composition, not evidence of a current table toggle. Do not produce new totals by summing a truncated visible subset and labeling it as all plans.

Settings groups use a title/description column only while labels and controls both remain comfortable. On narrow screens, put description before controls in the same group. Saved, edited and pending states are distinct; disable only the affected controls while saving. Read-only subscription/usage information is text, not disabled inputs intended to look editable. [R08, R16]

**Acceptance:** table/card parity; long titles wrap; locked data absent; current-page-only selection; generating restrictions; no duplicate controls; query changes clear selection while resize preserves it; pagination retains query; truthful metric units and scope; absent data not coerced to zero.

---

_Source: Patterns v0.4. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 22 — Forms

### 22.1 Preserve the job, not the mockup's wizard

P22.1 is a **single goal-input composition**. The inspected route renders CreatePlanPageClient → AiPlanGenerationPanel → UnifiedPlanInput. It collects the goal and selected preferences, then delegates to useStartAiPlanGeneration. The approved image's background/preferences/review steps, optional motivation field and topical cards do not establish implemented functionality. They are excluded from this pattern. [R02–R07; A01]

| Field           | Source contract                                                      | Draft UI                                                                                        |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Learning goal   | `topic`, trimmed and nonempty                                        | Persistent visible label plus Textarea; sample placeholder is not the label.                    |
| Experience      | `skillLevel`: beginner / intermediate / advanced                     | Labeled select using the existing values.                                                       |
| Weekly time     | `weeklyHours`: 1–2, 3–5, 6–10, 11–15, 16–20, 20+ hour bands          | Preserve bands; do not replace with an arbitrary slider.                                        |
| Learning style  | `learningStyle`: reading / video / practice / mixed                  | Preserve values; Hands-on is the visible label for practice.                                    |
| Finish by       | `deadlineWeeks` from tier-derived options                            | Disabled unavailable presets retain an explanation; eligibility remains server-backed.          |
| Custom deadline | `deadlineDate`, conditional on an eligible Pro custom-date selection | Labeled date field, required while shown; use the existing payload mapping and date validation. |

The constants include 2, 4, 8, 12-week and maximum-duration presets. Their availability comes from the tier helpers, not this document. Pro enables custom dates; an invalid deadline selection is cleared when tier changes. The standalone demo intentionally uses a **Pro example with a subset of the presets** and does not copy billing limits into the design system. [R06, R09–R10]

### 22.2 Form anatomy and layout

Inside the 40rem form measure: short introduction → goal field → grouped preferences → conditional field → requirements/result message → primary action. Keep the goal prominent, but not as unlabeled text floating in a panel. Use the existing field and surface tokens, 8px label/help gaps and 24px field-group gaps. Pair preference fields at 48rem only when their content fits; use a single column below that. The submit action follows fields in DOM order.

Keep the existing Cmd/Ctrl+Enter shortcut scoped to the goal textarea. Enter alone inserts a new line. A visible shortcut hint is supplemental; the button remains the main discoverable action. Ignore composition events in any new shortcut handling so input-method editing is not mistaken for submission. That extra guard is a draft implementation requirement, not claimed as existing code. [R05]

The source disables submission until all required values exist and while submitting. This pattern retains that policy and adds an adjacent requirements explanation. The specimen's **Show field errors** control is explicitly documentation-only: it exposes the proposed error-summary treatment without adding another product action or silently changing the source's disabled-until-valid policy.

### 22.3 Validation and correction

Client checks guide the user; the real schema, payload conversion, entitlement checks and backend remain authoritative. A valid-looking local form does not mean the request is permitted. After a rejected submission, retain values and show the specific correction near the field. For multiple errors, use a stable error-summary region with links to fields, then focus that summary. For a single short form an initial-invalid-field strategy is also possible; choose one per flow rather than firing both announcements. [W03]

Do not show errors on untouched fields on first render. On correction, remove obsolete errors without moving focus. Keep `aria-describedby` relationships accurate, including the help text. Error treatment must survive focus and hover. The textarea can grow; labels and date inputs may not overflow the panel at enlarged text sizes. A proposed summary or inline server error is not a new shared `Form` component API.

### 22.4 Submission is not generation completion

| Stage                   | Existing responsibility                        | Pattern requirement                                                   |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Incomplete              | UnifiedPlanInput checks required choices       | Disable submit with visible explanation; allow completion of fields.  |
| Ready                   | Form values map to create-plan payload         | Submit one snapshot of valid input.                                   |
| Submitting              | Hook uses an in-flight ref plus visible state  | Busy action, duplicate guard, no fabricated percentage.               |
| Plan ID available       | `onPlanIdReady` routes to `planDetailPath(id)` | Transition to the created plan even while generation continues.       |
| Authentication required | Hook redirects to sign-in with return path     | Preserve routing intent; no generic retry loop.                       |
| Failure with a plan ID  | Hook routes to the failed plan for recovery    | Retry from the existing plan context, not a duplicate create request. |
| Failure without an ID   | Hook exposes an error                          | Preserve inputs; use the real error classification for any retry.     |

The panel comment mentions successful generation, but the inspected hook makes the earlier ID-ready navigation explicit. This specification follows that implementation. The specimen's accepted result says **Plan ID received; generation continues** and offers a local status example. It does not claim an entire plan was completed or created in a fixed number of seconds. [R04, R07]

**Pending field edits:** the current textarea is disabled during submission, while PreferenceControls is not passed a pending flag. The proposed composition locks the full request snapshot while submitting so visible edits cannot diverge from the sent request. This is a disclosed behavior refinement requiring a call-site change—not a property already implemented by those dropdowns. [R05–R06]

An uncertain network result is not proof that nothing was created. The specimen has a documentation-only uncertain-result preview; in production, use the existing session's identifiers and recovery contracts before offering another creation attempt. Do not introduce a cancel control unless it invokes actual supported cancellation; navigation or closing a dialog does not prove cancellation or rollback. [A03 §19; R07]

### 22.5 Explicit-save settings

P22.2 covers the real notification preferences form, not a newly invented account-editing screen. Source values are unsubscribe-all optional emails, weekly summary, daily reminder and streak reminder. The inspected form tracks edited and saved values separately, enables Save only when dirty, disables controls during saving, and updates both snapshots from the successful response. On known error, edits remain for correction/retry. [R15–R16]

| State          | Presentation                            | What must stay true                                                |
| -------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Clean          | Saved values; Save disabled             | No action is needed.                                               |
| Edited         | Uncommitted controls; Save available    | No success claim before the server responds.                       |
| Saving         | Busy action; affected controls disabled | One in-flight request, stable form context.                        |
| Confirmed save | Confirmed returned values; local result | Reset dirty state from the response, not assumed request contents. |
| Known failure  | Retain edited values; local error       | Saved baseline does not change.                                    |

Unsubscribe-all **overrides without erasing** category choices. Turning it on disables category controls but retains their checked values, and explains the override. Required account/security/billing emails remain separate from optional preferences. The specimen reuses this control relationship; labels are concise draft copy and its responses are local simulations. [R16]

This explicit-save form differs from an immediate-save switch: do not automatically roll back every failed edit as if the app had already committed it. Do not add a global Save covering Profile, Billing, AI and Notifications, because their owners and request lifecycles differ. Clerk profile and checkout behavior stay under their existing owners. [R08, R16]

**Acceptance:** exactly the existing generation fields and enums; no wizard; required summary linked; nonempty goal; tier-derived deadlines; shortcut parity; duplicate guard; request snapshot preserved; ID-ready not mislabeled as finished; settings save only when dirty; unsubscribe preserves choices; failure retains edits; no quota allocation or real writes from specimens.

---

_Source: Patterns v0.4. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 23 — Loading / empty / error

### 23.1 State names are not interchangeable

P23.1 selects the correct region-level state; P23.2 covers long-running generation; P23.3 covers destructive outcomes and reconciliation. These are presentation contracts over real application results, not a replacement backend state machine.

| Condition                    | What the user should understand                       | Available action                                                |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Initial loading              | The requested data has not arrived                    | Wait; retain shell and helpful context.                         |
| Loaded                       | Confirmed data is present                             | Normal permitted interactions.                                  |
| First-use empty              | Successful read, no plans yet                         | Create a plan only if eligible.                                 |
| No results                   | Plans exist, but this query matches none              | Clear/change filters without losing the surrounding library.    |
| Read failure                 | The read failed; contents are unknown                 | Retry the read or return to a safe route.                       |
| Restricted                   | The requested content needs an entitlement/permission | Actual supported upgrade, selection, sign-in or back action.    |
| Free-plan selection required | The account needs to choose an accessible plan        | Existing FreeAccessPlanSelector, not a generic paywall.         |
| Generating                   | A real job is accepted/in progress                    | Actual supported status/recovery/cancellation actions only.     |
| Saved, display stale         | Mutation confirmed, follow-up refresh failed          | Refresh display; do not repeat the successful mutation.         |
| Outcome unknown              | A mutation may have committed                         | Reconcile first; do not claim failure or enable duplicate work. |
| Maintenance                  | Service temporarily unavailable                       | Accurate recheck guidance; no unsupported ETA/status URL.       |

The inspected module content directly distinguishes unauthorized, not found, forbidden, entitlement required, free selection required and internal error. Do not turn all of these into “No lessons yet.” Likewise, an authentication redirect should preserve its requested return path rather than show an Upgrade prompt. [R12]

### 23.2 Initial load versus refresh

Keep navigation/title available while known data regions load. The existing module page uses Suspense around data-dependent content; settings has separate loading boundaries for billing, usage and model selection. Use skeletons shaped like those regions with a concise accessible loading message. Skeleton shapes are decorative and hidden from assistive technology; a single named region owns `aria-busy`. No animation is needed to communicate waiting, and reduced motion must not remove the text. [R08, R11; A03 §18]

A refresh is different from the first load. If previously confirmed data can remain visible, label freshness and avoid replacing the whole page with a skeleton. Do not mix stale numbers with fresh labels silently. If the prior authorization no longer permits access, remove restricted content rather than keeping it on screen for visual stability. Empty content appears only after a successful read has established it.

Place result announcements outside a busy subtree where necessary so the busy state does not defer the only useful status. Announce milestones, not every polling response or visual animation frame. Use a concise polite status for ordinary results and an assertive error only when it warrants interruption. A static label does not need a live region simply because it is a status label. [W04]

### 23.3 Empty, no-results and blocked states

Empty first-use copy explains what the collection is and offers the existing next action. It should not invent sample results that look like account data. A no-results state names the active search/filter and offers Clear filters; keep the controls visible so the user can recover without navigation. Never replace a filtered result with an onboarding flow.

For a restricted plan, show only information authorized by the read model. Not-found responses should not confirm another user's private plan exists. Free-plan selection is its own server-authorized flow; candidate titles/IDs come from that result, not all hidden plans. Locked status in the specimen is illustrative; no real account data is loaded. [R12; A03 §17]

Maintenance remains outside the application shell. The illustrative recovery copy is “Try again in a few minutes.” Do not show a countdown, return-time promise, “all data is safe,” or a support link that has not been provided. A Refresh action should re-evaluate the actual service/route state; refreshing a static `/maintenance` page without such logic is not evidence that access will be restored. Avoid a Back to home loop if the same guard redirects home back to maintenance. [A01; draft recovery requirement]

### 23.4 Long-running generation

The generation form's request phase and the plan page's long-running generation phase are different states. Once a plan ID exists, the existing hook routes to that plan, where generation can continue. Keep the topic and real generation status visible; use a spinner plus text or a nonanimated waiting indicator when the duration is unknown. A percentage is allowed only when the backend supplies a meaningful measured denominator. [R07]

On failure with an ID, the source sends the user to the existing plan page for retry. Preserve that context. Reconnect/status recovery is a read/reconciliation operation, not necessarily a new generation attempt. Cancellation language must reflect the real session outcome; cancelling a browser fetch alone cannot prove a server job stopped. No maximum wait duration, automatic credit refund or “1–2 minutes” guarantee is established by the approved image. [R07; A03 §18]

### 23.5 Destructive outcome protocol

The visual confirmation rules stay in section 19. This pattern specifies how the surrounding library responds. Before sending a deletion, identify the exact eligible items and use current server rules. Do not leave a stale selection referring to a different page/query. While pending, disable repeat requests. The specimen uses its inherited proposed “Close status” policy, explicitly not a cancellation operation. [A03 §19]

| Response          | Data changes                      | UI / focus / next action                                                     |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Confirmed success | Remove only confirmed deleted IDs | Updated result count; focus a surviving result heading.                      |
| Known failure     | Do not remove items               | Preserve context and error; retry only if allowed.                           |
| Partial success   | Remove successes, keep failures   | State deleted/failed counts; select or identify remaining eligible failures. |
| Unknown outcome   | Do not assert removal or rollback | Block another deletion; reconcile authoritative records first.               |
| Reconciled        | Apply confirmed results from read | Restore actions only after the uncertainty is resolved.                      |

The bulk-delete implementation inspected in v0.3 already has an `onOutcomeUnknown` path and instructs the parent to refresh before another deletion. Retain that contract rather than simplifying it to a red toast plus Retry. The specimen's reconciliation button is a local simulation and not an assertion that a new production endpoint exists. [A03 §19 and R17 in its source register]

The lesson progress client separately recognizes a successful save with failed revalidation. In that case the next action is Refresh display. Do not set the task back to incomplete simply because the visible route was not revalidated. This is a source-supported distinction, not a generic rollback rule. [R14]

### 23.6 Focus and retained context

Background state changes usually leave focus where the user put it. Actions that remove their own invoking element must move focus to a surviving logical target. An error-summary link moves to its field; a completed pagination transition can move to the results heading; closing a modal returns to its trigger unless that trigger no longer exists. Avoid focusing both a toast and a route heading.

Use persistent IDs/keys for items and controls. When results re-render, restore focus only if the formerly focused control belonged to that replaced region and has an equivalent survivor. Do not steal focus from another region just because data finished loading. Busy guards need both semantic presentation and event-handler enforcement; styling alone does not prevent duplicate operations. [A03 §§14, 19]

**Acceptance:** no false-empty on error; no fabricated zero/percent/ETA; one announcement owner; distinct access states; known failure and unknown outcome separate; partial results retained accurately; saved-but-stale never retried as a mutation; recovery actions remain visible at narrow and short viewports.

---

_Source: Patterns v0.4. Chapter text retained from its source stage; reference IDs are scoped to that stage._

## 24 — Responsive behavior

### 24.1 Available width, not image dimensions

P24.1 defines the breakpoint contracts; P24.2 defines responsive focus, scrolling and verification. Keep the v0.2 thresholds and geometry. Raster export sizes are not CSS viewport measurements, and this draft does not claim that mobile artboards were supplied. The responsive behavior is newly specified and tested only within the standalone specimen. [A01–A03]

| Threshold   | Inherited geometry              | Composed behavior                                                                               |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| Below 40rem | 16px page gutter                | Single-column controls/groups; full-width actions where helpful; reader contents in disclosure. |
| 40rem / sm  | Same base scale                 | Action rows may share a line only when labels fit; no forced fixed width.                       |
| 48rem / md  | 24px gutter                     | Eligible form/content groups can use two columns.                                               |
| 64rem / lg  | 224px sidebar becomes available | Mobile Sheet yields to desktop navigation; main keeps remaining width.                          |
| 80rem / xl  | 32px gutter                     | Reader outline can sit beside prose only if actual content width permits.                       |
| 96rem / 2xl | 1280px content maximum retained | More outer space, not wider paragraphs or arbitrarily denser data.                              |

A sidebar and a local outline consume space. Do not choose three cards just because the full viewport is large. Compute the usable content region, then allow rows/cards/columns to fit. The specimen uses a **container-width threshold of 48rem** for its table/card switch; that is a local draft recipe, not a sixth global breakpoint or a new token. The same threshold can be reconsidered against actual production content without changing the theme.

### 24.2 Page-by-page transformations

| Pattern           | Wide view                               | Narrow view                                            | Invariant                                                                                        |
| ----------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Application shell | Persistent sidebar and main rail        | Menu trigger + modal navigation Sheet                  | Same permitted destinations and account access.                                                  |
| Library           | Native table when region is wide enough | Full-field plan cards                                  | Search, sort, status, selection, progress/tasks, updated, actions and pagination stay available. |
| Generation        | Paired preferences when they fit        | Goal then stacked labeled controls                     | Same values, requirements, tier rules and submission contract.                                   |
| Reader            | Prose + optional local outline          | Compact disclosure then prose                          | Current task first; no second independent outline state.                                         |
| Settings          | Section description beside controls     | Description above controls                             | Section IDs, save scope and owner unchanged.                                                     |
| Analytics         | Pulse plus grouped metrics              | One/two-column metrics; locally constrained chart/data | Same seven metrics, scopes and represented data.                                                 |
| Marketing         | Hero/image can share a row              | Message/action before optional illustration            | No text baked into an image.                                                                     |
| Maintenance       | Centered, restrained utility content    | Same content in a readable flow                        | No header/footer consuming most of the short viewport.                                           |

The reader may prioritize the current task and a collapsed route summary, but must not reverse actual task order or hide an existing required action. Changing a grid's visual order is not sufficient if the DOM reading/focus order becomes illogical.

### 24.3 Resize is an interaction

Changing viewport width must not clear form values, active query, selection, pending request, confirmation state or the current reading location. Use one data/state owner for alternative presentations. Native focus should remain on the same element when CSS is enough; when a table/card renderer swaps DOM, preserve item/action identity and focus its counterpart. If the item is removed, choose a stable heading.

On mobile-to-desktop transition with the navigation Sheet open, close the modal, remove its background lock and focus the equivalent visible desktop item. Do not return focus to a now-hidden Menu button. On desktop-to-mobile transition when focus was inside disappearing navigation, move it to the visible Menu trigger rather than leaving it in hidden content. The specimen exercises both transitions. Its native dialog is a behavior proxy, not a test of the production Radix Sheet. [A03 §16]

For a responsive contents disclosure, change its initial openness only at a meaningful breakpoint transition. Do not reopen it on every resize event and override the user's choice. A completed background request must not change the active reading position merely because it updates a side panel.

### 24.4 Reflow and local scrolling

The WCAG 2.2 AA reflow criterion uses a width equivalent to 320 CSS pixels for ordinary vertically scrolling content; intrinsically two-dimensional content can have a scoped exception. Do not extend that exception to the surrounding search controls, headings or pagination. This specimen keeps overflow local for tabular/chart/code data where needed, rather than hiding it at the page level. [W01]

Use `min-width: 0`, wrapping labels and viewport-constrained controls. Long titles, links and error messages should fit; do not truncate the only available explanation. A local scroll region needs a name, keyboard access when necessary and a visible focus boundary. Its scrollbars are not an excuse to shrink text until it becomes unreadable. The production Table wrapper needs an intentional API/composition change for a named scroll region; its existing forwarding applies to the table, not its wrapper. [A03 §17.3]

Text enlargement, browser zoom and viewport narrowing are different tests. The included 200% root-font test is a stress test, **not** a claim that real browser zoom was verified. CSS media-query rem units and root-font mutation also need not change together; check the actual rendered geometry. Inherited type, min-height and wrap rules should tolerate the larger text without relying on an assumed breakpoint change.

### 24.5 Safe areas, sticky content and short viewports

Header and sheet padding must include safe-area insets where relevant. Prefer a growing minimum height over a fixed height. Keep bottom controls in document flow by default; sticky learning actions are optional only after proving content/focus clearance. Avoid simultaneous fixed top header, fixed bottom CTA and fixed help widget on a small landscape screen.

WCAG 2.2 AA requires that author-created content not entirely obscure a focused component. This draft aims for stronger practical clearance: keep the whole control and its outline visible where feasible, use scroll margins for anchors/focus, and disable optional stickiness on short viewports. A nominal `z-index` is not a focus strategy. [W02]

In the specimen the local outline is sticky only at wide width and sufficient height; it returns to normal flow in short viewports. The Sheet scrolls internally and keeps an explicit close action. Production must additionally test the actual software keyboard and safe-area devices; emulated CSS dimensions do not establish those outcomes.

### 24.6 Input modality and preferences

Retain the 44px coarse-pointer target policy from v0.2/v0.3 without shrinking fine-pointer targets to glyph size. Pointer type and width are separate: a tablet-sized display can still need touch targets. No critical action is hover-only. Current status, field errors, focus and selection remain recognizable without relying only on color. [A02–A03]

Respect reduced motion for chart entry, loading visuals and disclosures while retaining status text. Under forced colors, system outlines/borders and native control semantics matter more than decorative backgrounds. The specimen checks a few computed styles in those modes; this is not a comprehensive forced-color or assistive-technology audit.

### 24.7 Acceptance matrix and production handoff

| Test                                        | Specimen coverage                                        | Production follow-up                                             |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| 320 / 390 / 768 / 1024 / 1440px             | Scripted page overflow and layout checks                 | Repeat with actual route data and compiled CSS.                  |
| Long text / 200% root text / spacing stress | Scripted reflow checks                                   | Real browser zoom, browser font settings and translations.       |
| Width transition                            | Selection, query, fields and focus checks                | React keys, hydration and route navigation.                      |
| Keyboard                                    | Sheet focus, error links, result actions and dialog flow | Screen-reader combinations and real Radix calls.                 |
| Async states                                | Local failure/success/partial/unknown simulations        | Real response schemas, revalidation, timeouts and eligibility.   |
| Coarse pointer / reduced motion             | Computed target and animation checks                     | Touch devices, software keyboard and safe areas.                 |
| Fonts / themes                              | System fallback and dark specimen                        | Named-font comparison; existing light/system preference support. |

No new tokens are required by these patterns. The 379 inherited token records remain byte-for-byte unchanged. Recipe dimensions reuse the token source or are explicit layout constraints (such as 70ch reading measure), not a second unexplained palette. The library/card adaptation, error summary, complete pending-form lock and responsive focus choreography remain **draft integration changes**.

**Completion gate:** validate a real library, generation form and module reader first; then settings and analytics; then optional marketing/utility treatments. Keep authorization, quota, generation/session and vendor-owned account behavior untouched. This release does not complete sections 25–27 or 00–01, resolve the font/lockup, certify accessibility or deploy anything.

---

_Source: Final-stage draft synthesis. New final-stage requirements and synthesis; proposals and source contracts remain distinguished._

## 25 — Accessibility

### 25.1 Target, policy and evidence

The product target is **WCAG 2.2 Level AA for complete pages and processes**, not a claim of conformance already achieved. The normative standard defines conformance; WAI Understanding documents explain it; APG patterns guide interaction design. This chapter adds an operational test policy to the inherited specifications. Its matrix is a focused implementation checklist, not an exhaustive substitute for every applicable A/AA criterion. [S01, S14]

| Layer              | Requirement                                                                                                      | Interpretation                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Standards baseline | All applicable A/AA criteria in the declared product scope                                                       | Review complete processes, including authentication and third-party controls.   |
| Atlaris policy     | 44px minimum coarse-pointer targets; opaque 2px focus outline with 2px separation; content-driven control growth | Inherited design choices. These are not all universal AA requirements.          |
| Evidence           | Exact build, route, state, browser, viewport, input and assistive-technology result                              | A sampled component or standalone script cannot certify the integrated product. |

Keep the earlier distinction: 24×24 CSS px is the WCAG 2.2 AA target-size baseline with defined exceptions; 44px is this project's coarse-pointer policy. The two-pixel perimeter/change-of-contrast test belongs to **AAA Focus Appearance**; it is a useful stronger design target, not a statement that an outline alone establishes AAA conformance. [S05, S06]

### 25.2 Visual and interaction requirements

| Concern                       | Operational requirement                                                                                                                                                        | Basis                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Normal text                   | At least 4.5:1 against its actual background; check helper text, placeholders, links and every enabled state.                                                                  | SC 1.4.3; S02                               |
| Large text                    | At least 3:1; the large-text definition is 18pt regular or 14pt bold, or equivalent. Do not treat every heading as large by name.                                              | SC 1.4.3; S02                               |
| Required non-text information | Necessary control/state indicators and meaningful graphics need 3:1 against adjacent colors. Decorative separators are not automatically subject to the same role.             | SC 1.4.11; S03                              |
| Color                         | Include labels/markers/patterns where color communicates status, selection or chart identity.                                                                                  | SC 1.4.1; F03 §§16–17                       |
| Keyboard                      | Complete the task without a pointer; retain visible focus, logical order and a usable exit from modal content.                                                                 | SC 2.1.1, 2.1.2, 2.4.3, 2.4.7; F03 §19      |
| Focus visibility              | AA prohibits the focused control being entirely obscured by author-created content. Atlaris aims to keep the control and ring unobstructed.                                    | SC 2.4.11; S07                              |
| Names and relationships       | Use semantic controls, persistent associated labels, state properties and meaningful heading/landmark relationships. Visible labels should be represented in accessible names. | SC 1.3.1, 2.5.3, 4.1.2; F03 common contract |
| Pointer targets               | Check actual interactive boxes, spacing and applicable exceptions; do not measure only the icon artwork.                                                                       | SC 2.5.8; S05                               |
| Pointer alternatives          | Do not introduce drag-only interactions. Where dragging is nonessential, provide a single-pointer alternative without dragging.                                                | SC 2.5.7; S01                               |
| Supplemental content          | Hover/focus content must meet applicable dismissible, hoverable and persistent requirements. Essential help stays available without hover.                                     | SC 1.4.13; S08                              |

Contrast is evaluated on the colors actually composed in the interface, not anti-aliased edge pixels from a screenshot. Compare unrounded ratios against thresholds. Inactive controls and logotypes have contrast exceptions, but those exceptions do not justify unreadable instructions or inaccessible links. Read-only content is not automatically inactive. [S02]

Keep all 77 inherited pair expectations, including the three deliberate rejections. They are regression tests for specific token pairs, not 77 accessibility findings. The lavender primary/dark-label pair and the progress rail's separate dark interior/visible boundary remain the specified recipes. Do not add opacity to a whole component or reinterpret a decorative divider as a required field border. [F02 §03; F03 §17]

### 25.3 Focus and keyboard ownership

Reuse the existing Radix foundations for production overlays and choices. The owner of a composite interaction is responsible for its initial focus, keyboard navigation, dismissal, final focus and async result. A component's styling does not establish those outcomes. [F03 §§16, 19]

For a modal, focus enters appropriate content, Tab stays within the active modal, and dismissal returns to the invoker or a logical survivor. Destructive confirmations begin on the safer choice where appropriate. Long structured descriptions should remain navigable as structure rather than being forced into one giant spoken description. [S09]

In Atlaris, test menu → delete dialog → confirmed result as one workflow. The original menu item may no longer exist on close. If a selected table row becomes a card, move focus only when its previous representation disappears; do not steal focus from another region during a background refresh. Preserve the independent invalid border and focus outline. Use the pending-dismissal proposal from §19 only after request ownership is reviewed; closing a surface is not server cancellation. [F03 §19; F04 §§21, 23–24]

### 25.4 Reflow, enlargement and preferences

Ordinary content must reflow at 320 CSS px width without loss or page-wide two-dimensional scrolling; genuinely two-dimensional content can retain a bounded local scroll region when the exception applies. Test actual browser zoom as well as narrow viewports. The inherited 200% root-size stress test is useful but not a substitute for browser text enlargement or zoom testing. [S10, S11]

For supported text-spacing overrides, retain content and operation with line height 1.5 times font size, paragraph spacing 2 times font size, letter spacing 0.12 times font size and word spacing 0.16 times font size. These are override-tolerance tests, not a requirement to use those values as the default typography. [S12]

Use minimum heights, wrapping and intrinsic sizing. Keep code/tables in named, keyboard-reachable scroll regions; keep their captions and recovery controls visible. Test short viewports, safe areas, real mobile software keyboards and a resized sticky header. Do not disable zoom or pin orientation merely to preserve a composition. [F02 §§05–07; F04 §24; S10–S12]

Reduced-motion and forced-color behavior are project requirements. Remove nonessential motion without hiding status or waiting for animation-end callbacks that no longer fire. In forced colors, inspect actual visible borders, focus and selected/checked markers rather than assuming brand colors survive. Preserve the application's light/system preference; the dark specimen does not validate those themes. [F02 §10; F04 §24; G04]

### 25.5 Forms, authentication and recovery

A label, control, help text and error are one accessible relationship. Required fields explain their requirements. A rejected submission preserves the user's entries and focuses one appropriate error summary or field, not several competing targets. Client checks do not replace server validation or eligibility decisions. [F03 §15; F04 §22]

Do not make the user re-enter information already supplied in the same process when the redundant-entry criterion requires it to be populated or selectable; its necessity/security/invalid-information exceptions require a concrete justification. This is not permission to retain sensitive drafts indefinitely in browser storage. [S13]

Evaluate the complete sign-in/sign-up/recovery experience, including the embedded provider. Permit password-manager assistance and paste; do not add an unsupported memory/puzzle barrier. Accessible Authentication (Minimum) has specified alternatives and exceptions; adding an arbitrary “accessible” label to a CAPTCHA is not evidence. Authentication security policy stays with the existing auth implementation. [S15; F04 §20]

For destructive, account and billing actions, identify consequences and preserve the existing confirmation/error-prevention flow. Never turn an uncertain server result into an automatic second mutation. Do not announce a saved state until the relevant owner confirms it. Error messages must not expose another account's protected titles, stack traces or sensitive inputs. [F03 §19; F04 §23]

### 25.6 Nonvisual content and announcements

Give meaningful images an appropriate text alternative and decorative images an empty alternative or equivalent exclusion. The brand link needs an understandable destination/name; the decorative star beside visible Atlaris text does not need a duplicate announcement. Present important instructional diagrams with a nearby explanation, not just an atmospheric caption. If the product embeds or publishes instructional media, assess the applicable captions, alternatives and audio-description requirements rather than assume a linked resource is accessible. [S01; F02 §§08–09]

The eight-week pulse needs programmatically associated title/description, clear series names and equivalent data access that preserves the same values. Such a presentation improvement does not authorize new analytics. Accessible tables retain header relationships, meaningful sort state and a labeled local scroll region. [F03 §17; F04 §§20–21]

Use concise status announcements for meaningful results without unnecessary focus changes. Mount the relevant live-region container before updating its text where needed, avoid competing inline/toast announcements and keep required recovery in the current interaction context. A busy subtree must not defer the only useful result message; do not announce every polling response. [S16; F04 §23.2]

### 25.7 Minimum release journey matrix

The CSV and HTML worksheet are **review templates, initially Not tested**. Marking an item Pass requires recorded evidence. Not applicable requires a reason. A completed worksheet is not a mathematical accessibility score.

| Journey                  | Required checkpoints                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Authentication           | Keyboard/paste/password manager, names/errors, provider overlays and return destination.                                           |
| Plan library             | Search, sort, pagination, mixed selection, generating restrictions, authorized locked state, keyboard scrolling/card equivalence.  |
| Plan generation          | Existing fields, conditional date, explanation of disabled submit, one request snapshot, ID-ready transition and failure recovery. |
| Learning reader          | Heading/content sequence, code/resource access, task completion, optimistic failure and confirmed-save/stale-display distinction.  |
| Settings                 | Section navigation, explicit saves, override preserving preference choices, provider-owned account/billing controls.               |
| Analytics                | Seven metrics, eight-week values, labels and non-color series distinction, unavailable versus zero.                                |
| Deletion                 | Menu-to-dialog focus, consequences, pending, known failure, partial success, unknown reconciliation and final focus.               |
| Responsive shell         | Sheet entry/exit, sidebar transition, safe area, short viewport and no state loss on resize.                                       |
| Utility and empty states | Loading versus empty versus read failure versus restricted state; accurate maintenance guidance.                                   |

Run relevant journeys with keyboard-only interaction, Safari with VoiceOver on macOS, a Chromium-based browser, Firefox, and an appropriate Windows screen-reader combination such as NVDA with Firefox or Chrome. Test mobile touch and a mobile screen reader for the primary learning flow. This is the proposed support/test matrix; versions must be recorded at execution. No result for these combinations is claimed here. Automated checks supplement rather than replace human evaluation. [Project test policy; S14]

### 25.8 Sign-off and exceptions

No known failure of an applicable A/AA criterion can be waived while still claiming AA conformance for the affected scope. If a limited release proceeds with unresolved failures, record the exact limitation and do not present it as conformant. A narrower documented scope must not exclude steps from a process merely to avoid testing them. Project-policy exceptions, unlike standards exceptions, require an owner, reason, impact and review date. [S01; project release policy]

The PDF is a visual reference; PDF accessibility/tagging conformance has not been certified. The semantic HTML and Markdown supply alternate access to the specifications. None of those documents substitutes for testing the actual application with real fonts, data, async behavior, themes and third-party widgets.

---

_Source: Final-stage draft synthesis. New final-stage requirements and synthesis; proposals and source contracts remain distinguished._

## 26 — Content & copy

### 26.1 Voice follows the user's task

Use direct, specific and calm product language. Marketing can express the route/learning metaphor, but instructions, errors, settings and recovery must explain the literal action. Avoid motivational filler in working views and blame in errors. These are proposed copy rules derived from the system's content-first direction, not a claim that every current label already follows them. [F01 p. 4; F03 §§14–19; F04 §§20–23]

Write interface labels in sentence case except proper names, initialisms and code. Prefer a verb plus object for actions: “Create plan”, “Save preferences”, “Delete plan”. The visible label and accessible name must remain aligned. Do not trade clear meaning for a short label merely to keep a button on one line. [Project copy policy; F03 §§14–15; §25]

### 26.2 Product vocabulary

| Term                                                              | Meaning and use                                                                                                                                          | Avoid                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Learning plan / plan                                              | Goal-level learning structure; use “learning plan” when first introducing it, “plan” in established context.                                             | Interchanging it with subscription plan without qualification.                           |
| Your plans                                                        | Collection at `/plans`.                                                                                                                                  | “Learning plan” as a second generic top-level destination.                               |
| Module                                                            | Ordered group inside a learning plan.                                                                                                                    | Calling every task a module.                                                             |
| Lesson / task                                                     | The current module UI derives lessons from `module.tasks`. Use “lesson” for the learning content context; retain “task” in analytics and data contracts. | A new lesson entity, per-section completion record or separate route inferred from copy. |
| Progress                                                          | The applicable task/module completion relationship.                                                                                                      | Unexplained average scores or elapsed effort.                                            |
| Active / completed / generating / failed / not started / inactive | Distinct lifecycle labels, mapped to existing values.                                                                                                    | Renaming a persisted enum as part of visual work.                                        |
| Locked / restricted                                               | Access condition, separate from lifecycle status.                                                                                                        | Implying that payment fixes every authorization failure.                                 |
| Plan & billing                                                    | Subscription/payment context in Settings.                                                                                                                | “Your plans” for both learning and billing navigation.                                   |
| Learning style: Hands-on                                          | Draft UI label for existing `practice` value in the goal form.                                                                                           | Changing the payload to `hands-on`.                                                      |

“Hands-on” is already used in the generation options, while the shared formatter currently returns “Practice”. This inconsistency is recorded rather than hidden. Normalize display copy at the actual call sites after verifying context; do not modify the enum or claim the shared formatter already agrees. [F04 §22; G05]

### 26.3 Canonical action labels and existing differences

| Context                              | Current source/example wording | Proposed canonical label    | Change status                                                  |
| ------------------------------------ | ------------------------------ | --------------------------- | -------------------------------------------------------------- |
| Library creation                     | New Plan                       | Create plan                 | Copy proposal; route and eligibility unchanged.                |
| Goal submission                      | Chart this course              | Create plan                 | Literal action label; metaphor may remain in the introduction. |
| Preference save                      | Save Preferences               | Save preferences            | Capitalization change only; keep explicit save.                |
| Read retry                           | Try Again                      | Try again                   | Same safe read/retry operation.                                |
| Destructive commit                   | Delete plan / Delete N plans   | Retain the object and count | Preserve real consequences and guards.                         |
| Task completion                      | Existing task-status action    | Mark as complete            | Contextual copy; no new persistence model.                     |
| Status panel dismissal               | Proposal from §19              | Close status                | Only after its non-cancellation policy is implemented.         |
| A stale display after confirmed save | Existing refresh guidance      | Refresh display             | Do not repeat the mutation.                                    |

These are target labels, not new props, routes or proof of existing behavior. Labels that imply a different operation need a behavior review rather than a string replacement. [F03 §§14, 18–19; F04 §§22–23]

### 26.4 Metrics must keep their definitions

| Display label    | Required interpretation / companion copy                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tasks            | Current completed tasks divided by total tasks; include the count relationship.                                                   |
| Modules          | Current completed modules divided by total modules.                                                                               |
| Completed time   | Estimated duration associated with currently completed tasks, not a timer. Prefer the nearby qualifier “Based on task estimates.” |
| Progress changes | Current-week count of recorded status-change events, across active days.                                                          |
| Completed events | Current-week events with completed status; not necessarily a count of unique tasks.                                               |
| Active days      | Days with recorded activity in the relevant week, out of seven.                                                                   |
| Streak           | Current consecutive active-day count, with the best recorded streak.                                                              |
| Eight-week pulse | Progress changes by week and plan over the existing eight-week window.                                                            |

The headline Completed time total and the week-over-week “time added” comparison are related but different quantities. The comparison is the current week's estimated completion-added minutes minus the previous week's, not a comparison of cumulative totals. Event totals can differ from unique completed tasks when status changes repeat. Keep source-provided values; do not derive a new metric in copy or the component. [F03 §17; F04 §20.6; carried usage-model contract]

### 26.5 Numbers, dates and units

**Retain current formatting until a deliberate formatter change.** The inspected `formatMinutes` returns `—` for invalid/negative/nonfinite input, minutes below 60, whole hours as `1 hr` / `2 hrs`, and fractional hours to one decimal. For example, 90 minutes currently renders **1.5 hrs**, not **1h 30m**. Earlier specimen strings such as `12h` are illustrative values, not evidence of the runtime formatter. [G05]

| Value category          | Rule                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero / unavailable      | Zero is a real value. Use `—` plus an explanation when a value is unavailable; a failed load is a state, not zero.                                                |
| Percentages             | Keep the existing feature's calculation and rounding. Do not infer percentage from a decorative bar.                                                              |
| Ratios                  | State the denominator and noun: “12 / 20 tasks complete”. Preserve the exact underlying counts.                                                                   |
| Weekly comparisons      | Say “vs last week” for the current model; use a signed count/duration and appropriate singular/plural. Do not add a monthly filter.                               |
| Dates / time zones      | Reuse the relevant locale/time-zone formatter. Show an unambiguous full date when relative text would be unclear; retain machine-readable datetime when suitable. |
| Date-only input         | Preserve the existing local-date/deadline mapping; do not reinterpret it as UTC to make display formatting convenient.                                            |
| Money / quota           | Render current billing/entitlement data; show currency, billing period and limits when relevant. No fixed amount is established here.                             |
| Long text / identifiers | Wrap readable text. Truncate only where the full authorized value remains accessible; never truncate an essential consequence or error correction.                |

Library completion and analytics completion may use different source rounding rules. This release does not silently unify them; any normalization needs comparison against the actual data model and tests. Shared formatters should be the implementation owner of repeated formatting, not copy fragments maintained in multiple components. [F03 §17; G05; project implementation policy]

### 26.6 State-conditioned message catalog

Every message needs a condition. A polished sentence is wrong if the condition is wrong. The machine-readable catalog in `docs/registries/content-catalog.json` is an editorial reference, not a new runtime localization framework.

| Condition                            | Proposed message                                                                              | Action / guard                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| First successful read, no plans      | No plans yet. Create a learning plan to get started.                                          | Create plan only when eligible.                                 |
| Successful read, no query match      | No plans match your search. Change your search or clear the filters.                          | Preserve query controls.                                        |
| Read failure                         | Could not load your plans. Try again.                                                         | Safe read retry; do not show onboarding.                        |
| Accepted generation / ID ready       | Your plan is being generated.                                                                 | Continue in the existing plan context; do not claim completion. |
| Generation failure with ID           | Generation failed. Open the plan to review the available next step.                           | Existing retry/recovery policy; no promised refund.             |
| Save confirmed                       | Preferences saved.                                                                            | Use returned values as the saved baseline.                      |
| Known save failure                   | Could not save your preferences. Your changes are still here.                                 | Only say entries remain when they do.                           |
| Save confirmed, view stale           | Progress saved. Refresh the display to see the latest state.                                  | Refresh, not another update.                                    |
| Deletion outcome uncertain           | Could not confirm whether the plans were deleted. Check the latest state before trying again. | Reconciliation before repeat mutation.                          |
| Confirmed partial deletion           | Deleted {deletedCount} plans. {failedCount} could not be deleted.                             | Correct pluralization; preserve/report failures.                |
| Access result deliberately ambiguous | This plan is unavailable or you do not have access to it.                                     | Do not disclose another user's private object.                  |
| Maintenance confirmed                | Atlaris is temporarily unavailable while maintenance is in progress.                          | Valid recheck guidance; no unsupported ETA.                     |

For a known field error, name the field and correction. For an unknown mutation outcome, admit the uncertainty and state the safe next action. Avoid “Something went wrong” when a useful safe explanation exists, but do not expose raw technical errors in pursuit of specificity. Essential recovery stays inline rather than disappearing with a toast. [F03 §18; F04 §23; project wording proposals]

### 26.7 Destructive, billing and notification copy

A destructive confirmation identifies the actual plan(s), the effect, whether it is reversible, and any verified billing consequence already required by the product. The specimen's demo-only message must never replace the production deletion warning. Confirmed success uses confirmed counts; closing/aborting the browser request does not justify “Cancelled” or “Nothing was deleted.” [F03 §19; F04 §23]

Optional-email copy must explain that unsubscribe-all overrides category choices without erasing them. Required account, security and billing emails remain separate. A switch in an explicit-save form represents an edit until the save succeeds; do not label every toggle “Saved.” [F04 §22.5]

Do not freeze pricing, trial terms, quota allocations, recovery time, credit settlement or refund promises from generated examples. Those claims require the authoritative implementation/configuration and an explicit content decision at release. No new support address, status page, Discord or contact link is established by this system. [F01 pp. 8–10]

### 26.8 Editorial acceptance

Review visible labels, tooltips, accessible names, validation, loading text and announcements together. Use the same noun for the same object across navigation and state messages. Keep intentional distinctions such as lesson/task and learning plan/subscription. Test pluralization, long topics, narrow layouts and the actual formats returned by the feature.

A copy change that alters certainty, identity, entitlement, data meaning or the promised next action is a behavior change and must be reviewed with its owner. Do not log full user goals, account details or generated lesson text merely to diagnose wording. Use synthetic or redacted examples in review artifacts. [Project copy/review policy]

---

_Source: Final-stage draft synthesis. New final-stage requirements and synthesis; proposals and source contracts remain distinguished._

## 27 — Implementation mapping

### 27.1 Baseline and integration boundary

The final-stage connector read confirmed `develop` at `f8994dc7144ca8ce64354771c8fd95082cdd52a6`. New direct reads cover `package.json`, the first 240 lines of `DESIGN.md`, `ThemeProvider.tsx`, `formatters.ts` and the first 200 lines of the screenshot-baseline script. Other code mappings carry forward the scopes recorded in v0.1–v0.4; they are not a new exhaustive source or runtime audit. [G01–G06; F01–F04]

This package is documentation and local reference tooling, not a repository patch. The scoped token CSS does not install itself. Existing React, Radix, Clerk, Sonner, server boundaries and feature owners remain in place. Native HTML demonstrations and their fake timers/data are not implementation replacements.

### 27.2 Ownership and proposed destinations

| Responsibility           | Current or supplied owner                                                                         | Proposed adoption action                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Target tokens            | Package `tokens/atlaris.tokens.json`                                                              | Commit one canonical authoring file, for example `design-system/tokens/atlaris.tokens.json`. This destination does not yet exist by assertion. |
| Generated CSS / catalog  | Package compiler and `dist/`                                                                      | Choose a generated destination such as `src/styles/generated/atlaris-tokens.css`; never hand-edit its values.                                  |
| Runtime theme            | `src/app/globals.css`                                                                             | Import output and add an explicit, reviewed semantic bridge. Retain existing light/system behavior.                                            |
| Agent design entry point | `DESIGN.md`                                                                                       | Update its old direction and source-precedence statement in the same adoption change; preserve its tooling-valid front matter.                 |
| Older brand guidance     | Paths linked from DESIGN.md: `docs/styles/after-hours-direction.md`, `docs/styles/style-guide.md` | Inspect at implementation, then supersede/archive explicitly with a pointer to the new authority. These files were not re-read in this stage.  |
| Detailed docs            | This package's sections and registries                                                            | Adopt a single documented location, for example `docs/design-system/`; do not keep competing editable mirrors.                                 |
| Existing font loaders    | `src/app/layout.tsx`                                                                              | Compare Work Sans/Sora in the actual app; bind token family roles without guessing the wordmark face.                                          |
| Theme state              | `src/app/ThemeProvider.tsx`                                                                       | Keep class-based dark mode, default system preference and provider behavior.                                                                   |
| Brand / metadata         | Supplied assets and root metadata                                                                 | Resolve one vector lockup; reconcile actual OG dimensions/format/path with metadata.                                                           |

The current `DESIGN.md` explicitly describes copper/plum and tells agents to edit runtime CSS first. Leaving it unchanged after adopting this target would cause conflicting instructions. Change the authority model in a deliberate migration record; do not quietly declare the new package live while old instructions still control agent work. The supplied compiler is an Atlaris-specific DTCG-type subset implementation, not a universal design-tool importer. [G03; F02 §§11–13; S17]

### 27.3 Component and feature map

Paths beginning `ui/` below are relative to `src/components/`; feature paths beginning `plans/`, `settings/` or `analytics/` are relative to `src/app/(app)/`. Braced groups are documentation shorthand, not literal filenames.

| Area              | Existing source                                                                                                            | Preserve / change deliberately                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Actions           | `ui/button.tsx`                                                                                                            | Keep nine variants and size/asChild vocabulary; explicit state recipes; loading composition, not an assumed prop.               |
| Fields            | `ui/input.tsx`, `textarea.tsx`, `select.tsx`, `switch.tsx`, `label.tsx`                                                    | Names, associations, conditional errors and true value ownership; min-size and focus recipes.                                   |
| Surfaces          | `ui/surface.tsx`, `card.tsx`                                                                                               | Existing variants/padding API; no clickable-div semantics.                                                                      |
| Status / progress | `ui/badge.tsx`, `progress.tsx`                                                                                             | Lifecycle versus access; refined progress rail; distinguish zero from unknown.                                                  |
| Tables            | `ui/table.tsx`                                                                                                             | Native table semantics; deliberately compose a named overflow region because wrapper props are not currently the table's props. |
| Overlays          | `ui/alert-dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`                                                     | Radix interaction/focus; viewport constraints, reduced motion and portal token inheritance.                                     |
| Feedback          | `ui/route-empty-state.tsx`, `route-error-state.tsx`, `empty.tsx`, `skeleton.tsx`; root Toaster                             | Distinct read/access/mutation states; one appropriate announcement owner.                                                       |
| Shell             | `src/components/shared/SiteHeader.tsx`, `ui/page-shell.tsx`, `page-header.tsx`, `src/components/layout/app-shell-width.ts` | Auth/account/eligibility, safe area and current offsets; sidebar migration is proposed.                                         |
| Routes            | `src/features/navigation/routes.ts`                                                                                        | Actual destinations and dynamic path helpers; no mockup-only navigation.                                                        |
| Library           | `plans/components/PlansContent.tsx`, `PlansList.tsx`, `PlanRow.tsx`                                                        | Query, search, sort, pagination, selection and locked/generating restrictions.                                                  |
| Deletion          | `plans/components/DeletePlanDialog.tsx`, `BulkDeletePlansDialog.tsx`                                                       | Request ownership, confirmed/partial/unknown results and reconciliation before repeat.                                          |
| Goal form         | `plans/new/components/plan-form/UnifiedPlanInput.tsx`, `PreferenceControls.tsx`                                            | Existing fields/enums/tier options; disclosed full pending lock and error-summary changes.                                      |
| Generation        | `plans/new/hooks/useStartAiPlanGeneration.ts` and existing session/payload helpers                                         | In-flight guard, ID-ready navigation, failure with/without ID and auth return path.                                             |
| Reader            | `plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx`, `ModuleDetailClient.tsx`, `ModuleLessonsClient.tsx`    | Access/prerequisites, real task identity, optimistic status and saved-but-stale state.                                          |
| Settings          | `settings/layout.tsx` plus per-section pages; notification form                                                            | Independent owner/saving boundaries; override preserves choices; no global Save across vendor flows.                            |
| Analytics         | `analytics/usage/usage-analytics-content.tsx`, `usage-analytics-model.ts`, `usage-analytics-charts.tsx`                    | Eight weeks/seven metric meanings; accessible presentation only, not extra tracking.                                            |
| Shared text       | `src/features/plans/formatters.ts`                                                                                         | Current duration/label output; coordinate any terminology or formatting normalization.                                          |

No shared Tabs, Checkbox, RadioGroup, ordinary Dialog, Popover, Combobox or Slider export is inferred from the reference. The earlier audit's absence statement is limited to the inspected shared UI directory. Use existing native/local compositions before adding a new abstraction. [F03 source map]

### 27.4 Token-to-runtime bridge

The generated selector remains `[data-atlaris-theme="dark"]`. Decide how the existing theme provider applies that scope in an isolated preview and then in the adopted app. Put the owning token scope where actual portals can inherit it, or provide a deliberate portal container; a token attribute on only the main content will not theme a menu portaled outside that subtree. Test actual light, dark and system transitions with vendor widgets. [F02 §12; F03 §19; G04]

| Current runtime role            | Target token family                                                | Constraint                                                                                               |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `--background` / `--foreground` | `semantic.color.background.canvas` / `semantic.color.text.primary` | New dark theme only until light values are reviewed.                                                     |
| `--panel`, `--card`             | `semantic.color.background.surface`                                | Keep matching foreground and readable nested surfaces.                                                   |
| `--popover`                     | `semantic.color.background.raised`                                 | Verify portal ownership, layering and viewport constraints.                                              |
| `--primary`, `--primary-dark`   | Primary-action family at applicable call sites                     | Current primary also colors text/icons; use the link/text role where needed rather than blanket mapping. |
| `--primary-foreground`          | Primary action foreground                                          | Dark label on lavender; do not carry white labels into normal primary buttons.                           |
| `--destructive`                 | Split action and status families                                   | White-label red button fill is not the same color as error text/border.                                  |
| `--input` / `--border`          | Control boundary / decorative or grouping boundary                 | Choose by information role, not one global border value.                                                 |
| `--ring`                        | Focus family                                                       | Opaque outline with separation; preserve simultaneous invalid/selected state.                            |
| `--chart-*`                     | Chart family and existing series mapping                           | Check actual plotted adjacency, labels and backgrounds.                                                  |
| Spacing / radii / type          | Semantic/component dimensions and recipes                          | No blind global multiplier change or assumed font match.                                                 |

Changing `--spacing` from 0.2rem to 0.25rem grows affected utility dimensions by 25%; it does not make existing `h-9` a 40px control. Preserve the explicit 4rem header contract until the new shell is tested. Change semantic bridges, component recipes and compiled-layout checks together. Tailwind's utility-generating theme namespace and ordinary CSS variables are related but not interchangeable; verify the actual generated styles. [F02 §§05–07; S18]

No drop-in global bridge is shipped here because role splits and theme scope require call-site decisions. This prevents an attractive but unsafe global substitution from being mistaken for completed integration.

### 27.5 Bounded adoption sequence

| Gate                      | Change                                                                                                                                         | Evidence before expanding                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Baseline              | Re-read current branch; preserve screenshots and sources; record unresolved brand/theme decisions.                                             | Source pin, current screens, no ambiguous authoring authority.                                                                   |
| 1 — Values and primitives | Add canonical tokens/generator/output without changing production by default; update Button, fields, Surface, Badge and Progress in a preview. | Compiled dimensions, real named fonts, state colors, focus, enlargement and portal theme.                                        |
| 2 — One end-to-end slice  | Your plans → generation → existing plan/module reader, with real contracts and controlled test data.                                           | Query/selection, ID-ready navigation, task persistence and failure/unknown recovery.                                             |
| 3 — Remaining owners      | Settings, analytics, auth/provider overlays, shell, then marketing/utility.                                                                    | Independent saves, correct metrics, real eligibility and all supported theme/mode checks.                                        |
| 4 — Release               | Resolve blocking decisions and approve scoped product behavior.                                                                                | Accessibility/copy reviews, real browser matrix, reproducible output, no known applicable conformance failure hidden by a claim. |

Prefer a small coherent pull request over a whole-app replacement. A token import does not authorize database, auth, billing, session, deployment or route changes. Keep UI behavior changes explicitly listed apart from visual changes. Roll back using the normal repository process; do not rely on restoring a screenshot or a second hand-maintained CSS file.

### 27.6 Commands and execution scope

**In this extracted reference package:**

```bash
python3 scripts/validate.py
```

This checks token identity/integrity, inherited contrast expectations, chapter coverage and local reference structure; it changes only package validation output. The browser handbook check is separate and requires Playwright plus installed Chromium:

```bash
python3 scripts/check-handbook.py
```

**In the application repository, after an implementation change:** the following existing script names were verified, not executed here. Use the project's setup and required environment. [G02]

```bash
pnpm check:lint
pnpm check:type
pnpm design:lint
pnpm test:unit
```

Run relevant integration/workflow/security tests when the changed composition touches those contracts; their existing scripts are `test:integration`, `test:workflow`, `test:security`. Build and smoke checks are existing `build` and `test:smoke` scripts. Do not treat `test:e2e` as a synonym for Playwright: at this baseline it invokes Vitest. The local-first sequence should catch obvious failures before a CI push; no new CI job or cloud deployment is part of this package.

The existing `pnpm ui:capture-baseline` script supports supplied anonymous/authenticated server bases or its default disposable-Postgres and local-server setup. Its inspected default routes omit dynamic plan/module pages, About and Maintenance; its three viewport presets do not replace the full accessibility stress matrix. Extend a real review deliberately rather than assume the script already covers every state. The default setup starts infrastructure and seeds a disposable database; do not point test tooling at production. [G06, inspected lines 1–200]

### 27.7 Acceptance record

Every integration review records commit/build, routes, actual data fixtures, themes, viewport/input/browser versions, assistive technology, test command/results, screenshots, unresolved decisions and owner approval. Attach focused evidence to the changed behavior; inherited report counts remain historical and are not re-labeled as fresh application test results.

A “Pass” in a checklist without supporting evidence is incomplete. A “Not applicable” row needs scope and reason. Tokens are stable in this candidate, but a later value change still needs contrast and visual/interaction regression checks. Component APIs, copied prose and generated outputs must be updated together; a green token check alone does not approve a release. [§25; project release policy]

### 27.8 Lightweight governance and remaining decisions

The owner of Atlaris can approve design changes; the implementer records evidence. Experimental, reviewed and production-verified are separate statuses. Breaking token/API/behavior changes require a migration note and intentional version change; additive documentation does not make an untested component stable. Changes to canonical values regenerate derived CSS/catalogs and must not leave stale agent instructions.

| Decision / gate                               | Current status             | Required closure                                                                              |
| --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| 00–27 chapter coverage                        | Complete in this candidate | Review and accept the documentation; do not equate this with implementation.                  |
| Canonical full vector lockup                  | Open                       | One master geometry and derived colorways with real-size review.                              |
| Named UI/display fonts                        | Comparison candidates      | Review in the compiled app; font loading and text wrapping evidence.                          |
| Independent production imagery / OG           | Open asset tasks           | Prepare only used assets and align actual file metadata. Imagery-free components can proceed. |
| Light/system support                          | Existing behavior retained | Explicit migration policy and integrated validation; no silent dark-only switch.              |
| Success states / refined progress rail        | Proposed in v0.3           | Approve in context; preserve the rejected legacy pair as evidence.                            |
| Sidebar/cards/error summary/full pending lock | Draft compositions         | Call-site implementation and workflow checks, not just styling.                               |
| Pending “Close status” policy                 | Draft interaction proposal | Request ownership, dismissal, uncertain outcomes and focus reviewed together.                 |
| Integrated accessibility and vendor behavior  | Not certified              | Actual routes/processes, theme/browser/assistive-technology evidence.                         |
| App build/tests/deployment                    | Not performed here         | Normal implementation and release process, separately authorized.                             |

The design-system writing phase is complete. Use this candidate to make the remaining bounded decisions and integrate one real slice; another round of mockups will not prove those implementation contracts.

### 27.9 JCS-96 launch adoption map

JCS-96 records how the supplied launch screenshots map to actual Atlaris product behavior. Static artwork is visual evidence only; a label, metric, avatar, icon or price is adopted only when current route, data, auth and billing contracts support it. This issue owns launch copy and information-architecture decisions. It does not add product features, data sources or billing terms.

| Reference signal | Status | Repository adoption |
| ---------------- | ------ | ------------------- |
| Marketing hero and calls to action | Keep / adapt | Keep the current landing, pricing and About copy. Landing `Begin tonight` goes to `/plans/new`; an anonymous request is returned to `/auth/sign-in?redirect_url=%2Fplans%2Fnew`. `See pricing` goes to `/pricing`. The marketing-header visitor CTA goes to `/auth/sign-in`; an authenticated visitor gets `/dashboard`. |
| Public information architecture | Keep | `/` redirects signed-in users to `/dashboard` and everyone else to `/landing`. Public navigation and the marketing footer expose only Home, Pricing and About. |
| Authenticated navigation | Adapt | Keep Dashboard (`/dashboard`), Plans (`/plans`), Analytics (`/analytics` with Usage and Achievements), and Settings (`/settings`). The mobile menu remains the responsive composition. |
| Sidebar-only mockup destinations | Omit | Do not add Projects, Resources, Notes, Community, a global search, a notifications inbox or other destinations inferred only from decorative mockup labels/icons. |
| Plan creation and entitlement actions | Keep / adapt | Authenticated `New Plan` uses `/plans/new` when `canCreatePlan` is true; after the free allowance it becomes `Upgrade` to `/pricing`. Free, Starter and Pro limits come from `TIER_LIMITS` and the billing architecture. |
| Pricing cards and checkout | Adapt | `/pricing` uses live Clerk plan names, descriptions, fees and non-export features when Clerk UI is enabled; local preview prices are explicitly representative and checkout is disabled. Use the actual Free/Starter/Pro caps. Do not publish screenshot-only prices, annual savings, exports, founding benefits, discounts, refunds or support promises without an authoritative owner and source. |
| Dashboard and usage analytics | Keep / adapt | Preserve personalized plan summaries, activity and the existing eight-week usage contract. Do not replace them with global learner counts, synthetic activity or invented dashboard metrics. |
| Achievements | Defer | `/analytics/achievements` is an explicit “Coming soon” surface; the mockup does not authorize a working achievement system. |
| About and builder copy | Defer pending owner confirmation | The current About page has builder copy and the existing support address. Default to deferring publication of the attribution and response promise; retain the text in the branch only as an unapproved candidate until the owner confirms it for launch. |
| Social proof and aggregate statistics | Omit | Do not add the mockup-only `4.9`, `500+`, `10,000+`, `50+`, `1,500+`, `120+`, testimonial, rating, founder-avatar or learner-avatar claims without a verified source. |
| Account and settings | Keep / adapt | Use the existing settings ledger (Profile, Plan & billing, Usage, AI model, Integrations and Notifications) and Clerk account controls/fallback. Mockup-only account actions are not new routes or product contracts. |
| Brand imagery and metadata | Defer | Keep independent imagery, the canonical full vector lockup and Open Graph decisions with JCS-6 and the asset owner; never crop a screenshot into a production asset. |

Ownership remains explicit: JCS-96 owns this launch copy and information-architecture map; JCS-87 owns the authenticated sidebar composition; JCS-94 owns controls and action recipes; JCS-95 owns feedback and overlay compositions; JCS-6 owns brand assets and metadata. Clerk billing architecture owns plan and entitlement semantics, and the usage analytics metric contract owns analytics meanings. A future destination or claim change updates its owning issue and this record together.

Evidence paths are `src/features/navigation/items.ts`, `src/features/navigation/routes.ts`, `src/components/shared/SiteHeader.tsx`, `src/components/shared/nav/DesktopHeader.tsx`, `src/components/shared/nav/MobileHeader.tsx`, the landing/About/pricing sources under `src/app/(landing)/`, `src/shared/constants/tier-limits.ts`, `src/app/(app)/analytics/usage/`, `src/app/(app)/analytics/achievements/page.tsx`, `src/app/(app)/settings/layout.tsx`, `docs/architecture/clerk-billing-architecture.md` and `docs/architecture/usage-analytics-metric-contract.md`. Static review references are retained at `/Users/juansaldana/Downloads/Atlaris Redesign/` (`landing.png`, `pricing.png`, `about.png`, `dashboard.png`, `generation.png` and `settings.png`).

The unresolved owner decision is whether the current About attribution — “Juan Saldana designs, builds, and runs Atlaris” — and response promise — “Juan reads every message” — are approved public launch copy. The recorded default is to defer publication and omit those claims from a launch surface if the owner does not approve them. No avatar, testimonial, rating or aggregate metric is approved by this map.

---

## Final-stage sources

### S01 — WCAG 2.2 normative requirements

primary external reference. Conformance scope and referenced success criteria; no application conformance inferred.

[Primary source](https://www.w3.org/TR/WCAG22/)

### S02 — Contrast (Minimum)

primary external reference. Normal/large text, exceptions, actual colors and unrounded thresholds.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### S03 — Non-text Contrast

primary external reference. Required control/state and meaningful graphical information.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

### S05 — Target Size (Minimum)

primary external reference. 24px baseline and exceptions; not Atlaris 44px policy.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### S06 — Focus Appearance

primary external reference. AAA focus area and change-of-contrast, not an AA two-pixel mandate.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

### S07 — Focus Not Obscured (Minimum)

primary external reference. AA not entirely hidden; stronger unobstructed goal is project policy.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)

### S08 — Content on Hover or Focus

primary external reference. Dismissible, hoverable and persistent supplemental content.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)

### S09 — APG Modal Dialog Pattern

primary external reference. Informative focus, keyboard and semantic guidance.

[Primary source](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

### S10 — Reflow

primary external reference. 320 CSS px, two-dimensional exceptions and zoom context.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

### S11 — Resize Text

primary external reference. Text enlargement; specimen root-size checks are not full evaluation.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)

### S12 — Text Spacing

primary external reference. Override tolerance, not default design values.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)

### S13 — Redundant Entry

primary external reference. Re-use within a process and applicable exceptions.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)

### S14 — Evaluating Web Accessibility

primary external reference. Combined human/tool evaluation; no automated certification.

[Primary source](https://www.w3.org/WAI/test-evaluate/)

### S15 — Accessible Authentication (Minimum)

primary external reference. Assistance, alternatives and exceptions across authentication steps.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)

### S16 — Status Messages

primary external reference. Appropriate non-focus announcements; context matters.

[Primary source](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

### S17 — DTCG 2025.10 Format Module

primary external reference. Community Group format, distinct from the local subset compiler.

[Primary source](https://www.designtokens.org/tr/2025.10/format/)

### S18 — Tailwind Theme Variables

primary external reference. Theme namespace and utility relationships; compiled verification still required.

[Primary source](https://tailwindcss.com/docs/theme)

### G01 — develop branch

direct connector read. Branch read; returned f8994dc7144ca8ce64354771c8fd95082cdd52a6

[Primary source](https://api.github.com/repos/saldanaj97/atlaris/branches/develop)

### G02 — package.json

direct connector read. Full file; script definitions, not executions.

[Primary source](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/package.json)

### G03 — DESIGN.md

direct connector read. Lines 1–240; old brand, authority and front matter.

[Primary source](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/DESIGN.md)

### G04 — ThemeProvider.tsx

direct connector read. Full file; class dark mode, default system, provider behavior.

[Primary source](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/ThemeProvider.tsx)

### G05 — formatters.ts

direct connector read. Full file; current duration and learning-style labels.

[Primary source](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/features/plans/formatters.ts)

### G06 — capture-baseline.ts

direct connector read. Lines 1–200 only; route/viewport/setup definitions, not full runtime review.

[Primary source](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/scripts/ui/capture-baseline.ts)

### F01 — Atlaris-Design-Inventory-v0.1

supplied prior artifact. Source text and applicable packaged registries; historical results remain historical.

Package path: `reference/Atlaris-Design-Inventory-v0.1.md`

### F02 — Atlaris-Foundations-and-Tokens-v0.2

supplied prior artifact. Source text and applicable packaged registries; historical results remain historical.

Package path: `reference/Atlaris-Foundations-and-Tokens-v0.2.md`

### F03 — Atlaris-Components-v0.3

supplied prior artifact. Source text and applicable packaged registries; historical results remain historical.

Package path: `reference/Atlaris-Components-v0.3.md`

### F04 — Atlaris-Patterns-v0.4

supplied prior artifact. Source text and applicable packaged registries; historical results remain historical.

Package path: `reference/Atlaris-Patterns-v0.4.md`

## Inherited reference scopes

The complete originating Markdown documents and source registers are retained under `reference/`. IDs in sections 02–13 refer to Foundations v0.2; IDs in 14–19 refer to Components v0.3; IDs in 20–24 refer to Patterns v0.4. They must not be merged by ID alone.

### Register: Atlaris-Foundations-and-Tokens-v0.2

### Supplied project materials

**A01** — `Atlaris-Design-Inventory-v0.1.md` and its 11-page PDF, especially sections 2–9 and the decisions/readiness chapters. The alias `Atlaris-style-guide.pdf` has the same file hash.\
**A02** — `brand.zip`, original brand files; audit `asset-analysis.json` and `asset-manifest.json`.\
**A03** — `Atlaris Redesign.zip`, 11 page mockups and the asset infographic. Export dimensions are not CSS viewport dimensions.\
**A04** — `Atlaris-Design-Audit-v0.1.zip`, especially `normalization-candidates.json` and `source-register.json`.

### Pinned repository sources re-read for this stage

- **R01** — [src/app/globals.css](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/globals.css), lines 1–310: themes, spacing, radius aliases and font-role declarations.
- **R02** — [src/app/layout.tsx](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/layout.tsx): Work Sans/Sora loading, Clerk appearance and image metadata.
- **R03** — [src/components/ui/button.tsx](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/components/ui/button.tsx): existing variants, sizes and state classes.
- **R04** — [src/components/ui/input.tsx](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/components/ui/input.tsx): field sizes, invalid/focus classes and opacity treatments.

Other repo mappings are carried forward with their scope explicitly identified from A01, not presented as a new exhaustive repository review.

### Primary standards / framework references checked September 5, 2026

- **W01** — [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- **W02** — [Tailwind theme variables](https://tailwindcss.com/docs/theme).
- **W03** — [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design).
- **W04** — [DTCG 2025.10 Format Module](https://www.designtokens.org/tr/2025.10/format/) and [Color Module](https://www.designtokens.org/tr/2025.10/color/).
- **W05** — [WCAG 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **W06** — [WCAG 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- **W07** — [WCAG 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- **W08** — [WCAG 2.4.7: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).
- **W09** — [WCAG 1.4.10: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- **W10** — [WCAG 1.4.12: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), a remaining production stress-test reference.

Generated values and test reports are original artifacts of this draft. Standards references do not certify the application or endorse the proposed brand choices.

### Register: Atlaris-Components-v0.3

### Supplied materials

**A01** — `Atlaris-Foundations-and-Tokens-v0.2.md`, PDF, HTML and ZIP: foundations, token authoring source, limitations and next-stage scope.\
**A02** — `Atlaris-Design-Inventory-v0.1.md` / PDF: approved visual language, source/feature discrepancies, code mapping and asset tasks.\
**T01** — This package’s original token diff, computed contrast pairs and browser validation reports. These are generated checks, not third-party certification.

### Repository register

All paths are relative to `saldanaj97/atlaris` at the pinned commit. `docs/source-register.json` provides clickable source URLs and whether a source was re-read, directory-verified or carried from v0.2. A directory entry proves a file exists, not its runtime behavior.

R01 shared UI tree; R02 Button; R03 Input; R04 Select; R05 Switch; R06 AlertDialog; R07 Sheet; R08 Surface; R09 Badge; R10 Table; R11 Progress; R12 RouteErrorState; R13 RouteEmptyState; R14 routes; R15 PlansList / PlanRow; R16 DeletePlanDialog; R17 BulkDeletePlansDialog; R18 usage content/model; R19 DropdownMenu; R20 Tooltip.

### Primary outside references

The following sources support interaction/accessibility constraints, **not** the proposed brand choices or a claim of app conformance. Checked September 5, 2026.

- W01 — WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W02 — Status messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- W03 — APG Tabs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- W04 — APG Checkbox: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
- W05 — APG Switch: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
- W06 — APG Menu button: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- W07 — Radix Select: https://www.radix-ui.com/primitives/docs/components/select
- W08 — APG patterns / breadcrumb: https://www.w3.org/WAI/ARIA/apg/patterns/
- W09 — APG Modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W10 — Radix Alert Dialog: https://www.radix-ui.com/primitives/docs/components/alert-dialog
- W11 — Radix Dropdown Menu: https://www.radix-ui.com/primitives/docs/components/dropdown-menu
- W12 — Content on hover/focus: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- W13 — Target size minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

The 44px coarse-pointer target is inherited Atlaris policy; WCAG 2.2 AA’s 24px criterion includes exceptions and is not a universal 44px requirement. [A01; W13]

### Register: Atlaris-Patterns-v0.4

Source register `docs/source-register.json` contains canonical links, read scopes and source-derived facts. Repository references are pinned to `f8994dc7144ca8ce64354771c8fd95082cdd52a6`. Source links and readable titles are listed below.

- **A01** — `Atlaris-Design-Inventory-v0.1.md`. Read supplied Markdown; reviewed accompanying visuals where relevant. Inherited repository observations retain their original read scopes.
- **A02** — `Atlaris-Foundations-and-Tokens-v0.2.md`. Read supplied Markdown; reviewed accompanying visuals where relevant. Inherited repository observations retain their original read scopes.
- **A03** — `Atlaris-Components-v0.3.md`. Read supplied Markdown; reviewed accompanying visuals where relevant. Inherited repository observations retain their original read scopes.
- **R01** — [src/components/layout/app-shell-width.ts](https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/components/layout/app-shell-width.ts). Header offset, gutters and max-width definitions.
- **R02** — [src/app/(app)/plans/new/page.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/page.tsx>). Authenticated generation route and client composition.
- **R03** — [src/app/(app)/plans/new/components/CreatePlanPageClient.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/CreatePlanPageClient.tsx>). PageHeader and panel.
- **R04** — [src/app/(app)/plans/new/components/AiPlanGenerationPanel.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/AiPlanGenerationPanel.tsx>). Unified input and generation hook.
- **R05** — [src/app/(app)/plans/new/components/plan-form/UnifiedPlanInput.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/plan-form/UnifiedPlanInput.tsx>). Required goal/preferences, disabled submit, topic shortcut, pending textarea.
- **R06** — [src/app/(app)/plans/new/components/plan-form/PreferenceControls.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/plan-form/PreferenceControls.tsx>). Source preference fields, conditional date and tier-derived deadline options.
- **R07** — [src/app/(app)/plans/new/hooks/useStartAiPlanGeneration.ts](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/hooks/useStartAiPlanGeneration.ts>). Duplicate guard, ID-ready navigation, auth and failed-plan routing.
- **R08** — [src/app/(app)/settings/components/SettingsLedgerPage.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/settings/components/SettingsLedgerPage.tsx>). Six settings sections, owners, separate Suspense boundaries.
- **R09** — [src/app/(app)/plans/new/components/plan-form/constants.ts](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/plan-form/constants.ts>). Experience/hour/style enums and duration presets.
- **R10** — [src/app/(app)/plans/new/components/plan-form/deadline-tier.ts](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/new/components/plan-form/deadline-tier.ts>). Tier-based choices, Pro custom date, invalid selection helper.
- **R11** — [src/app/(app)/plans/[id]/modules/[moduleId]/page.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/[id]/modules/[moduleId]/page.tsx>). Validated params and Suspense wrapper.
- **R12** — [src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx>). Auth, not-found, forbidden, entitlement, free selection and internal-error cases.
- **R13** — [src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetail.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetail.tsx>). Module tasks mapped to lesson status values.
- **R14** — [src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx>). Optimistic task status composition and saved-but-stale message.
- **R15** — [src/app/(app)/settings/notifications/components/NotificationsSection.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/settings/notifications/components/NotificationsSection.tsx>). Authorized preference loading and return path.
- **R16** — [src/app/(app)/settings/notifications/components/NotificationPreferencesForm.tsx](<https://github.com/saldanaj97/atlaris/blob/f8994dc7144ca8ce64354771c8fd95082cdd52a6/src/app/(app)/settings/notifications/components/NotificationPreferencesForm.tsx>). Dirty/saved snapshots, explicit save, override without erasing categories.
- **W01** — [WCAG 2.2 Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Reflow threshold and scoped two-dimensional exceptions.
- **W02** — [WCAG 2.2 Understanding Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Focused controls not entirely obscured by author content.
- **W03** — [WAI Forms Tutorial: User Notifications](https://www.w3.org/WAI/tutorials/forms/notifications/). Error summary, linked correction and user notification.
- **W04** — [WCAG 2.2 Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Programmatic status announcement without routine focus moves.
