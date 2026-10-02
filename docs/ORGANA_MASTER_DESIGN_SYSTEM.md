# ORGANA MASTER DESIGN SYSTEM

> **Canonical source of truth for all Organa visual design and UI implementation.**
>
> Use this file as the primary design reference for every landing page, application screen, component, state, animation, 3D-office treatment, and future UI refactor. When an older style conflicts with this document, this document wins.

Design and implement the entire Organa product using one consistent visual language derived from the Organa brand identity.

Organa is an AI-native workplace where humans build, manage, coordinate, and improve teams of specialized AI employees.

The interface must communicate:

**Intelligence. Coordination. Progress. Trust. Human control.**

The product must feel like a premium technology platform, not a chatbot, gaming interface, or generic enterprise dashboard.

## 1. BRAND PERSONALITY

Organa should feel:

- **Premium** — Clean, intentional, polished, and sophisticated.
- **Futuristic** — Clearly AI-native, but believable and usable today.
- **Human** — AI employees should feel approachable and collaborative instead of robotic or intimidating.
- **Optimistic** — Bright environments, positive colors, spacious layouts.
- **Intelligent** — Information hierarchy should be extremely clear.
- **Organized** — Even complex multi-agent workflows should feel simple and understandable.

Avoid visual styles associated with:

- cyberpunk
- hacker dashboards
- dark sci-fi
- crypto products
- gaming HUDs
- neon overload
- cartoon robots
- excessive gradients
- dense enterprise software
- generic chatbot interfaces

## 2. CORE BRAND CONCEPT

The main visual metaphor is:

**ORBIT + NODES + CONNECTION**

The Organa logo represents multiple intelligent entities coordinated around a shared center.

Use this concept throughout the product.

Examples:

- AI agents = nodes
- company goal = center
- collaboration = connecting orbit
- active work = moving light
- orchestration = multiple nodes aligned around one objective
- company organization = connected system

Do not simply use the logo as decoration.
Translate its visual concept into UI behavior.

## 3. PRIMARY COLOR SYSTEM

Main brand colors:

```css
:root {
  --organa-navy-950: #020817;
  --organa-navy-900: #010C2C;
  --organa-navy-800: #101B3D;

  --organa-blue-700: #123AD6;
  --organa-blue-600: #1267F8;
  --organa-blue-500: #2188FF;

  --organa-cyan-500: #21BFFC;
  --organa-cyan-400: #5BD8FF;
  --organa-cyan-300: #8EE7FF;

  --organa-indigo-600: #4240F6;
  --organa-indigo-500: #6366F1;

  --organa-violet-500: #8B5CF6;
  --organa-violet-400: #A978FA;

  --organa-magenta-500: #EC4899;
  --organa-magenta-400: #F472B6;

  --organa-white: #FFFFFF;
  --organa-bg: #F8FAFF;
  --organa-bg-secondary: #F2F5FF;

  --organa-gray-50: #F8FAFC;
  --organa-gray-100: #F1F5F9;
  --organa-gray-200: #E2E8F0;
  --organa-gray-400: #94A3B8;
  --organa-gray-500: #64748B;
  --organa-gray-700: #334155;
}
```

Primary text:

```css
#010C2C
```

Secondary text:

```css
#64748B
```

Main page background:

```css
#F8FAFF
```

Primary interactive blue:

```css
#1267F8
```

## 4. BRAND GRADIENTS

Main Organa gradient:

```css
linear-gradient(
  135deg,
  #1267F8 0%,
  #4240F6 38%,
  #8B5CF6 68%,
  #21BFFC 100%
)
```

Cyan intelligence gradient:

```css
linear-gradient(
  135deg,
  #1267F8,
  #21BFFC
)
```

Collaboration gradient:

```css
linear-gradient(
  135deg,
  #4240F6,
  #8B5CF6,
  #EC4899
)
```

Soft surface gradient:

```css
linear-gradient(
  135deg,
  rgba(18,103,248,0.06),
  rgba(139,92,246,0.04),
  rgba(33,191,252,0.05)
)
```

Gradients should be used for:

- primary CTA
- active AI states
- selected navigation
- important headlines
- visual connectors
- hero visuals
- orchestration states

Do **not** use gradients on every card.

## 5. TYPOGRAPHY

Primary font:

```text
Plus Jakarta Sans
```

Fallback:

```css
"Plus Jakarta Sans",
Inter,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif
```

Typography scale:

```css
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;
--text-4xl: 36px;
--text-5xl: 48px;
--text-6xl: 60px;
```

Desktop marketing hero:

- 56–72px
- weight 700–800
- line-height 1.02–1.08
- letter-spacing -0.03em

Application page title:

- 30–36px
- weight 700

Section title:

- 20–24px
- weight 650–700

Card title:

- 15–18px
- weight 600–700

Body:

- 14–16px
- weight 400–500
- line-height 1.5–1.65

Metadata:

- 12–13px
- weight 500–600

Never use more than approximately three visibly different font sizes inside one card.

## 6. SPACING SYSTEM

Use an 8px-based spacing system.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
```

Application page horizontal padding:

- Desktop: 32px
- Tablet: 24px
- Mobile: 16px

Main dashboard card gaps:

- 16–20px

Marketing section spacing:

- 80–120px vertical

Keep layouts airy.
Do not fill every empty area.
White space is part of the Organa identity.

## 7. BORDER RADIUS

Use rounded geometry reflecting the circular Organa logo.

```css
--radius-xs: 6px;
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-2xl: 24px;
--radius-full: 9999px;
```

Recommended:

- buttons: 10–12px
- inputs: 10–12px
- cards: 16–20px
- large dashboard panels: 20–24px
- modals: 24px
- avatar: circular

Avoid sharp rectangular components.

## 8. SHADOW SYSTEM

Shadows should be soft and slightly blue.

```css
--shadow-xs:
0 1px 2px rgba(1,12,44,0.04);

--shadow-sm:
0 4px 12px rgba(29,46,120,0.06);

--shadow-md:
0 10px 30px rgba(29,46,120,0.08);

--shadow-lg:
0 20px 60px rgba(29,46,120,0.12);

--shadow-glow:
0 0 30px rgba(66,64,246,0.20);
```

Avoid strong black shadows.

## 9. GLASSMORPHISM

Glass surfaces may be used for floating AI panels and special overlays.

```css
background: rgba(255,255,255,0.78);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.65);
box-shadow: 0 12px 40px rgba(42,52,120,0.08);
```

Glass should be an accent.
Normal content cards should remain highly readable.

## 10. APPLICATION LAYOUT

Desktop application shell:

```text
Sidebar: 240–260px

Top header:
64–72px

Main content:
remaining width
```

Maximum comfortable content width:

```text
1440–1600px
```

Sidebar collapsed:

```text
72px
```

Recommended navigation:

- Overview
- Office
- Missions
- Team
- Meetings
- Knowledge
- Goals
- Performance
- Settings

Active navigation:

- soft blue-violet surface with small gradient indicator

## 11. CARDS

Default card:

```css
background: rgba(255,255,255,0.92);
border: 1px solid rgba(66,64,246,0.08);
border-radius: 18px;
box-shadow: 0 8px 30px rgba(31,48,120,0.05);
padding: 20px;
```

Hover:

```css
transform: translateY(-2px);
box-shadow: 0 14px 40px rgba(31,48,120,0.09);
transition: 180ms ease;
```

Do not animate every card automatically.

## 12. BUTTONS

Standard button height:

- Small: 32px
- Medium: 40px
- Large: 48px
- Hero CTA: 52–56px

Primary:

```css
background:
linear-gradient(135deg,#1267F8,#4240F6,#8B5CF6);

color: white;
border-radius: 12px;
```

Hover:

- subtle brightness increase
- 1px upward movement

Secondary:

```css
background: rgba(18,103,248,0.07);
color: #1267F8;
border: 1px solid rgba(18,103,248,0.14);
```

Ghost:

- transparent background

Destructive:

- standard red palette
- never Organa gradient

## 13. INPUTS

Standard input:

- Height: 44px
- Border radius: 10–12px
- Horizontal padding: 14px

Default:

```css
background: #FFFFFF;
border: 1px solid #E2E8F0;
```

Focus:

```css
border-color: #1267F8;
box-shadow: 0 0 0 3px rgba(18,103,248,0.10);
```

Large AI prompt field may be 56–72px high.

## 14. AI AGENT VISUAL SYSTEM

AI employees should look like members of an organization.

Do **not** make every agent a robot.
Use professional human or stylized human avatars.

Agent avatar:

- List: 32–36px
- Card: 48px
- Profile: 72–96px

Agent status ring:

- Active: blue/cyan
- Thinking: violet pulse
- Collaborating: violet → cyan animated orbit
- Waiting: amber
- Review: indigo
- Blocked: red
- Completed: green
- Idle: muted slate

## 15. ORBIT ANIMATION

This is Organa's signature animation.

Three small nodes move around a circular path.

Recommended duration:

```text
2.4–4 seconds
```

Motion should be smooth and subtle.

Use for:

- loading
- agent thinking
- team creation
- orchestration
- meeting processing

Example:

```text
       ●
     ╱   ╲
   ●       ●
     ╲   ╱
      Goal
```

Avoid generic spinning loaders when possible.

## 16. LOADING STATES

Primary loader:

- Organa orbit animation

Example text:

```text
Understanding your goal...
Designing your organization...
Selecting AI specialists...
Preparing your team...
```

This should communicate progress instead of showing an indefinite spinner.

## 17. DATA VISUALIZATION

Charts must remain simple and readable.

Preferred chart colors:

- primary blue
- cyan
- indigo
- violet
- green for success
- amber for warning
- red only for problems

Chart backgrounds:

- transparent or white

Grid lines:

- extremely subtle

Avoid rainbow dashboards.

## 18. ICONOGRAPHY

Use:

- Lucide Icons
- or Material Symbols Rounded

Recommended size:

- 16px compact
- 18px default
- 20px navigation
- 24px feature cards

Icon containers:

- 36–44px
- soft tinted backgrounds

Avoid mixing multiple unrelated icon libraries.

## 19. STATUS BADGES

Badge height:

```text
22–28px
```

Radius:

```text
999px
```

Use tinted background + darker text.

Example:

```text
● Working
● Thinking
● Review
● Completed
```

Always use text/icon in addition to color.

## 20. COMPANY NORTH STAR

Company vision and goals should visually feel like the center of Organa.

Preferred structure:

```text
COMPANY NORTH STAR

Mission
Vision

Current Objectives

KPIs

Company Principles

Strategic Constraints
```

Use an orbit or central-node visual sparingly around the primary goal.
Agents should visibly reference these goals.

## 21. CHIEF OF STAFF VISUAL IDENTITY

The human user is always above the Chief of Staff.

Hierarchy:

```text
Human Founder
      ↓
AI Chief of Staff
      ↓
Departments
      ↓
Specialist Agents
```

Chief of Staff may have a stronger violet-blue orbit indicator.
It must visually represent orchestration, not authority over the human.

## 22. MEETING ROOM

The shared objective should be visually centered.
Agents surround the goal.

Example:

```text
       Marketing
          │

Research ─ GOAL ─ Finance

          │
      Operations
```

Use thin curved orbit connectors.
Agent statements appear as lightweight contextual cards.
Final synthesis should visually converge into the central goal.

## 23. TASK AND MISSION VISUALIZATION

Avoid turning Organa into another Jira clone.

Mental model:

```text
Company Goal
     ↓
Mission
     ↓
Workstream
     ↓
Tasks
     ↓
Agents
     ↓
Deliverables
```

Use dependency graphs where helpful.
Use Kanban only as one optional view.

Mission overview should prioritize:

- progress
- dependencies
- responsible agents
- approvals
- blockers
- outcomes

## 24. HUMAN APPROVAL

Human control is an important part of the brand.
Approval cards should be clearly distinguishable.
Use soft amber accents.

Example:

```text
Marketing Campaign

Maya recommends launching
the campaign tomorrow.

Impact:
4,200 customers

[Request Changes]
[Approve]
```

Approval must feel intentional but not alarming.

## 25. 3D OFFICE VISUAL LANGUAGE

Environment:

- bright premium futuristic workplace

Main colors:

- white
- warm white
- pale blue
- light lavender
- glass
- natural greens from plants

Lighting:

- soft daylight + subtle blue/violet ambient illumination

Materials:

- glass
- white matte surfaces
- polished metal
- translucent acrylic

Avoid:

- black environments
- neon corridors
- spaceship interiors

Functional rooms:

- CEO Office
- Strategy Room
- Meeting Room
- Library
- Review Room
- Marketing
- Finance
- Operations
- Research
- Lounge

Rooms must represent actual product functionality.

## 26. MOTION DESIGN

Standard UI:

```text
150–220ms
```

Page transitions:

```text
250–350ms
```

Large orchestration animations:

```text
400–800ms
```

Easing:

```css
cubic-bezier(0.22,1,0.36,1)
```

Examples:

- agent receives task → small light travels from mission node to agent
- task completed → subtle pulse + check
- meeting begins → nodes gradually connect
- collaboration → light moves between agents

Never animate simply because animation is possible.
Motion must explain state.

## 27. RESPONSIVE DESIGN

Breakpoints:

```text
mobile: < 640px
tablet: 640–1024px
desktop: 1024–1440px
wide: >1440px
```

Desktop is Organa's primary experience.

On mobile:

- sidebar → drawer or bottom navigation
- dashboards → stacked cards
- organization graph → zoomable horizontal canvas
- tables → card/list view where necessary
- 3D office → simplified interactive scene

## 28. DARK MODE

Dark mode may exist but should not define the product identity.

Suggested:

```css
background: #071020;
surface: #0E1830;
surface-secondary: #121F3B;
text: #F8FAFC;
muted: #94A3B8;
```

Keep the same blue/cyan/violet brand.
Avoid pure black.

## 29. ACCESSIBILITY

- Minimum WCAG AA contrast.
- Interactive target: minimum 44x44px on touch devices.
- Always provide visible keyboard focus.
- Do not use color alone for status.
- Respect `prefers-reduced-motion`.
- All critical AI-generated decisions must remain readable without animation.

## 30. DESIGN COMPONENTS

Build reusable design-system components rather than one-off page styles.

Create:

```text
OrganaButton
OrganaCard
OrganaGlassPanel
OrganaInput
OrganaTextarea
OrganaBadge
OrganaTooltip
OrganaModal
OrganaDrawer
OrganaTabs

AgentAvatar
AgentCard
AgentStatus
AgentProfile
AgentActivity

MissionCard
MissionProgress
TaskGraph
DeliverableCard

ApprovalCard
MeetingCard
KnowledgeCard
KPIWidget
NorthStarCard

OrbitLoader
OrbitConnector
OrganaEmptyState
```

All visual properties must come from shared design tokens.
Do not hardcode visual styling separately on every page.

## 31. EMPTY STATES

Empty states should help users take action.

Instead of:

```text
No agents found.
```

Use:

```text
Your AI team is waiting to be built.

Tell Organa who you need or let us
recommend a team based on your goals.

[Build My Team]
```

Use subtle orbit illustration.

## 32. INFORMATION DENSITY

Default to moderate information density.
Users should understand the state of their organization within approximately five seconds.

Prioritize:

- what is happening
- why it is happening
- who is responsible
- what needs attention
- what happens next

Avoid vanity metrics unless they help decisions.

## 33. COPY STYLE

UI copy should feel professional, short, confident, and human.

Instead of:

```text
Execute agent orchestration workflow
```

use:

```text
Start Mission
```

Instead of:

```text
Instantiate a new agent
```

use:

```text
Hire AI Employee
```

Instead of:

```text
LLM processing...
```

use:

```text
Maya is analyzing the market...
```

Organa should feel like managing a team, not managing infrastructure.

## 34. CORE PRODUCT EXPERIENCE

Every major screen should reinforce this journey:

```text
DEFINE GOAL
     ↓
BUILD TEAM
     ↓
PLAN
     ↓
DELEGATE
     ↓
COLLABORATE
     ↓
EXECUTE
     ↓
HUMAN REVIEW
     ↓
LEARN
     ↓
IMPROVE
```

This is the visual and interaction backbone of Organa.

## 35. FINAL QUALITY CHECK

Before considering any screen finished, verify:

1. Does it visually belong to the Organa brand?
2. Does it feel like an AI organization rather than a chatbot?
3. Can users understand what their AI team is doing quickly?
4. Is the human visibly in control?
5. Does the screen use the orbit/node concept appropriately?
6. Are gradients restrained?
7. Is typography hierarchy clear?
8. Is spacing generous?
9. Are components reusable?
10. Does the design feel premium without becoming decorative?
11. Would this still look professional in an enterprise environment?

If not, simplify it.

# FINAL VISUAL TARGET

Imagine:

- Google Workspace clarity
- Linear precision
- Apple-like restraint
- a bright futuristic AI workplace
- Organa's unique orbital collaboration identity

The final result should immediately feel recognizable as Organa, even if the logo is temporarily removed.
