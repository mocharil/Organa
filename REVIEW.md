# Four-floor office review

## Evening building overview (30 Sep 2026)

The dusk-toned full-building reference was approved by the user. Design read: an interactive office building with warm interiors, navy panels and blue selection; ENERGY 2 / RHYTHM 2 / MOTION 2. The overview camera is enlarged and centered between the panels. Ambient light is reduced, and warm per-floor sources plus fence lamps separate the interior from the city. Light fog calms the distant environment. Single-floor mode keeps the daytime interior.

Thumbnails are captured from the real floor models at startup. People counts come from the roster on each floor, excluding anyone on the stairs and barber visitors. The dark panel is used only in the overview, for legibility over the scenery; there are no fake menus or statistics. On phones, compact numbers and labels replace the thumbnails.

Change gates:
- R-23/R-37 PASS: the reference and visual direction were approved; previews come from the app's own scene.
- R-17/C-5 PASS: the numbers are not online status; they are computed from simulation state, and the test checks 13 members on the work floors at start.
- R-26/R-35 PASS: the member-commands test passes for commands, meetings, fixed camera and tasks; building-view checks thumbnails, floor clicks and theme switching with no JS errors.
- R-03/R-32 PASS: layouts at 375/768/1440 were tested without overflow; navigation uses native buttons with aria-pressed, and people counts have accessible labels.
- R-31 PASS: panel position, light, thumbnails and color each have a recorded purpose above. No expensive blur or bloom is used to imitate a rendered image.


## Warm studio and chibi avatars (30 Sep 2026)

The direction was chosen from user-provided references: the interior from the second image and the avatar from the last image, then approved for implementation. Rooms still follow the original four-floor functions. Figures remain illustrative; the mapping of six female and seven male members, initials and task identity is preserved.

Design read: an interactive office for 13 members, warm interior with light wood and chibi characters; ENERGY 2 / RHYTHM 2 / MOTION 2. Standard matte materials replace toon shading on solid objects; ACES controls bright surfaces. Outlines are reduced so that shape and light become the main differentiators. Oval heads, voluminous hair, simple-eyed faces, and rounded cheeks and hands use the existing jointed rig. Chairs have cushions, soft backs and wheeled legs; sofas use sage/cream cushions. Leafy plants, desk books and parquet add detail close to the reference. Ivory panels and dark green accents tie the controls to the interior.

Change gates:
- R-23/R-37 PASS: direction and form were approved by the user; all geometry is built directly in Three.js, with no static image replacing the interactive room.
- R-31/C-1 PASS: material, furniture and UI decisions are explained above and follow the reference.
- R-17/C-5 PASS: figures are not portraits of real people, and member and task data still come from the roster and existing storage.
- R-26/R-35 PASS: the soft-avatar test passes for rendering, eye/rear camera, stairs, pause and all 13 members arriving at the dining table; no JavaScript errors.
- R-32 PASS: native controls and keyboard focus are preserved. White text on the dark green accent keeps high contrast.
- R-03/R-35 PASS: tests/member-commands.cjs passes after the final material change: individual/division/custom controls, meeting capacity, fixed camera, active tasks and 375/768/1440px. Desktop and mobile screenshots were reviewed. An old black artifact is still visible in one headless mobile screenshot; it is not claimed as fixed.


## Soft-block avatars (30 Sep 2026)

Following the user's approval of soft-block avatars: head, body, hair, hand, leg and shoe geometry is rounded with proportional radii and uses a geometry cache. Body width and shoulder spacing are slightly reduced so the silhouette is less rigid. Figures remain illustrative, with the same initials and gender split.

Jointed poses are now interpolated by time delta; walking, sitting and activities no longer switch joint angles instantly. Added breathing motion, small weight shifts, a different typing/mouse phase for each member, and heads that follow the turning direction. Speed is reduced near the final destination. The barber character uses the new shape and pose transitions too.

Design read: the same interactive office model; ENERGY 2 / RHYTHM 2 / MOTION 2. Small motions signal living characters without changing the model's identity or adding UI elements.

Change validation:
- R-23/R-37 PASS: the avatar shape and visual direction were requested and approved by the user; geometry is built in code, with no downloaded assets.
- R-03/R-35 PASS: tests/member-commands.cjs passes at 375/768/1440px, including commands, meeting capacity, camera, active tasks and task completion.
- R-26/R-32 PASS: existing controls are preserved; tests/soft-avatar.cjs verifies the eye/rear camera, camera exit, stairs, pause and all 13 members arriving at the dining table.
- R-19/R-31 PASS: poses are smoothed to explain movement; the pause button still stops the simulation. Color, typography and layout still follow the previous model.
- The syntax check passes; both tests finish without JavaScript errors. Close-up avatar and dining table screenshots were reviewed.

A previously recorded visual note still appears in one headless screenshot: a black square beside the navigation after switching floors. The cause of that artifact is unverified and this avatar change does not claim to resolve it.


## Member commands and active tasks (30 Sep 2026)

The member panel now shows the active task (title and instruction), a choice of command recipients (individual, division, or custom list), and meeting/lunch/rooftop/back-to-work actions. The camera does not move because of a command. A manual meeting lasts until the next command; seat capacity is checked for all invitees before anyone is moved. Dining/rooftop seats already targeted by someone else are not reallocated.

Design read: an office management panel for the same team, paper model; ENERGY 2 / RHYTHM 2 / MOTION 2. The task is placed before the activities so work stays visible while characters move. Controls are grouped in the member panel so the global footer stays compact. Initials with an active task get a brick-red underline, with the work title in the tooltip and accessible label. The desktop panel starts below the status message; the log is hidden while details are open. No new visual assets.

Delivery gate:
- R-03/R-35 PASS: tests/member-commands.cjs checks 375/768/1440px widths with no horizontal panel overflow; screenshots were reviewed, and the panel scrolls vertically.
- R-26/C-2 PASS: individual, division, custom group, meeting, lunch, rooftop and back-to-work commands all have handlers; the test checks that only the selected participants receive the new destination.
- R-27 PASS: empty selections and full rooms produce messages; a failed invitation does not move some of the participants. An empty task shows No active task.
- R-32 PASS: select, labeled checkbox, fieldset/legend, native buttons and focus inherited from earlier styles; task titles use textContent, not HTML.
- R-17/C-5 PASS: the task title and marker come from the stored task with active status; completing the task removes the marker. Activities do not complete tasks automatically.
- R-31/R-37 PASS: color, typography, line motif and layout follow the chosen model direction; the placement rationale is recorded above.
- R-35 PASS: the browser test covers meeting participants arriving, a fixed camera, the task staying visible when the destination changes, task completion, and no JavaScript errors. The syntax check passes.


## Block avatars and connected stairs (29 Sep 2026)

Following the latest brief: block-style avatars with box heads and jointed limbs. Six female avatars (Mira, Tari, Rani, Dewi, Laras, Sinta) use long hair/bangs/ponytail variations; seven male avatars use short hair. The shapes are illustrative, not reconstructions of real people's appearance. Desk-group colors and the paper-model style are preserved.

Labels, member choices, log, details and task owners use unique initials. The full name remains the internal identity so tasks and saved prayer-room choices stay compatible. Laras = KL and Sinta = KS to avoid collisions.

Three switchback stairs connect all four floors on the left side. Avatars follow the same world path as the stairs, stay visible during the trip, and can change destination without jumping. Activity buttons preserve the floor and camera; floor selection stays under user control. The animation delta cap was raised from 50 to 150 ms to reduce slowdown on low-frame-rate renderers, with a cap on the jump after a tab becomes active again.

A 72 BPM synthesized instrumental is generated through Web Audio with no external audio files. The Music button starts/stops audio; volume is saved, and playback is not automatic. The extra controls are keyboard accessible and follow the responsive layout.

Initial validation: the JavaScript syntax check and the visual/camera-control regression `tests/office.cjs --visual` pass. Listening on the user's device has not been done; the automated audio test checks AudioContext, note scheduling, volume and stopping.


## Paper model version (29 Sep 2026)

Design read: an interactive office visualization for a 13-person team, in the visual language of an architect's cardboard model, dials ENERGY 2 / RHYTHM 2 / MOTION 2. The direction was chosen by the user (paper model). The avatar shape changed three times at the user's choice: paper standees, proportional 3D figures, then block avatars (the version in use).

Decisions and reasons:
- Color: paper cream #ebe5d8, sheet #faf7f0, ink #2a2622, and a single brick-red accent #b83a24 for primary actions, the active floor and the selected character. Real models are made of cardboard; the earlier navy made the office feel like another AI product.
- Four shirt colors still encode the desk groups (data), also used on the carpet (16% tint) and the small boxes in the log.
- Typography: Archivo for headings and UI, because a firm grotesque resembles lettering on drawing sheets. Small IBM Plex Mono (11-12px) is used only for floor numbers, sheet numbers and log times, like captions on technical drawings. No large monospace headings.
- Identity motif: the drawing-sheet title block (floor caption), navigation as a building cross-section with thick slabs between floors, and an ink line on every edge of 3D objects.
- 2px radius on controls and 4px on panels; no UI shadows. Panels are separated by a 1px ink line, like stacked paper.
- Avatars: paper standees were replaced by jointed proportional 3D figures, then replaced again by block avatars (see "Block avatars and connected stairs" above). The user chose the block version; the uniform-figure decision here no longer applies.
- Floor 3: depth is created without full walls (carpet, idea board, low shelf, glass, pendant lights, beams) so the open-space brief still holds.
- The city, clouds and birds returned at the user's request, but only in the whole-building view; the single-floor view stays clean. Buildings within radius 65 are kept low so the office remains visible from the default camera, and clouds are placed in a ring outside the city edge so they do not cover the screen when the camera rotates.
- The city around the building and the mass of the lower floors were removed at the user's request. The single-floor view shows only that floor, like one sheet of a model; the outer stairs and door landings appear only in the whole-building view, because without the other floors the stairs would look like they float.
- Prayer room: nothing is sent automatically. Participation is chosen per person by the user, because the religion of real team members must not be assumed.
- The office log is labeled "Simulated activity" so it is not read as an AI message.

Contrast (anti-slop script): ink on sheet 14.03:1, ink on paper 11.96:1, secondary text on sheet 6.87:1 and on paper 5.86:1, white on accent 5.72:1, accent on paper 4.56:1 (also the focus ring), placeholder 5.75:1, small text on the active floor 9.98:1.

Validation: `tests/office.cjs` passes in headless Chromium. Covered: 13 members, 4 floors, floor click from the building view, orbit drag, Shift + drag pan, scroll zoom (including over name labels), routines and chatting, the four-person limit, a populated log, Prayer time with no selection showing a hint, only checked members going to the prayer room, selection saved after reload, tasks, lunch/rooftop/back, 375/768/1440px with no overflow, the Log button on phones, and no JavaScript errors. Screenshots were reviewed at 375, 768 and 1440px.

Not verified: in one test sequence (task dialog opened, then the team goes down to lunch), a headless Chromium screenshot shows a transparent area beside the floor navigation. Raycast and elementFromPoint at that point find only the canvas and the city buildings, and the pattern is not yet explained. It has not been checked in a regular browser.

Anti-slop gate for this version: R-02 no em dash in UI text; R-03 three widths tested; R-17 numbers only from data (13 people, 4 floors, task count); R-23 avatar shape confirmed by the user, still illustrative; R-25 contrast above; R-26/R-35 every control tested automatically; R-27 loading, CDN/WebGL failure, empty log, empty/failed task messages; R-32 3px brick-red focus, Escape closes dialogs, arrows/WASD move the camera; R-37 direction chosen by the user. PASS.


The latest version follows the user's brief: 13 names and titles, four floors, one open workspace without partitions, and desk groups decided during implementation. Avatars, sizes, furniture and stair locations are interpretations labeled on screen.

## Latest visual decisions

ENERGY 1 / RHYTHM 2 / MOTION 2 for the office scene. The task panel keeps MOTION 1. The 3D scene is the main focus; floor controls are stacked vertically following the building levels and move to the top on tablet/phone. Navy separates the controls from the bright floors; blue shows the active floor. Different shirt colors mark the four desk groups, rather than guessing at the team's clothing or personal traits. Wood, concrete and plants distinguish room functions. System fonts, solid surfaces and action labels follow the earlier task system. Animation explains travel and activity, with a pause button.

## Latest version validation

Chromium tests pass: 13 team members, Frontend/Backend titles, 13 owner choices, all four floors and the building view, character details, task creation/completion, pause/resume, zoom/rotate/reset, all 13 characters arriving at the dining table, the rooftop, and returning to their own desks. An old task owned by Sari was moved to Kak Rani, started, and kept after reload. No JavaScript errors. The JavaScript syntax check also passes.

Screenshots were reviewed at 375, 768 and 1440px. The camera adapts to the screen ratio so the floor fits; labels are condensed when zoomed far out on phones. The dropdown always offers the whole team. The building view hides name labels so they do not overlap the upper floors. Mobile testing used a Chromium viewport, not a physical device.

## Latest version anti-slop gate

- R-01 PASS: no gradients or glow in the UI; 3D lighting shows the room's form.
- R-02 PASS: new copy has no em dash.
- R-03 PASS: 375/768/1440px tested; top navigation and camera adapt on small screens.
- R-04 PASS: controls use text labels, no generic icons.
- R-05 PASS: navigation is arranged by the four floors the user gave.
- R-06 PASS: system fonts follow the task controls; size distinguishes headings, names and captions.
- R-07 PASS: no decorative UI background pattern.
- R-08 PASS: no repeated decorative arrows.
- R-09 PASS: floor and task numbers come from the app's real structure and data.
- R-10 PASS: control surfaces are solid, with no blur.
- R-11 PASS: small radius on controls, larger on panels.
- R-12 PASS: 3D shadows show furniture contact with the floor.
- R-13 PASS: no glow.
- R-14 PASS: no feature cards added.
- R-15 PASS: specific controls: Go to lunch, To rooftop, Back to work.
- R-16 PASS: copy does not promise AI execution.
- R-17 PASS: 13 members match the user's data; task counts are computed from storage.
- R-18 PASS: no testimonials.
- R-19 PASS: animation shows travel/activity and can be paused.
- R-20 PASS: team names, floor functions and four desk groups come from the brief.
- R-21 PASS: the navy theme keeps the earlier 3D office context.
- R-22 PASS: all geometry is the requested office, not generic decorative illustration.
- R-23 PASS: team members come from the user; character shape and floor plan are marked as interpretation.
- R-24 PASS: every floor button and team choice has a tested purpose.
- R-25 PASS: secondary text on the active floor control changed to white, 5.85:1; other UI pairs follow the already-computed panel.
- R-26 PASS: floor, camera, team, simulation and task controls tested.
- R-27 PASS: loading messages, CDN/WebGL failure, and task empty/error states are provided.
- R-28 PASS: no FAQ.
- R-29 PASS: UI is navy/neutral/blue; four shirt colors encode desk groups.
- R-30 PASS: visuals follow the user's office description.
- R-31 PASS: decision rationale is recorded above.
- R-32 PASS: name labels are buttons; the dropdown gives access to every member, camera and floor controls can be focused, and dialogs support Escape.
- R-33 PASS: geometry, UI and logic are written directly in source.
- R-34 PASS: one consistent theme, with no non-functional toggle.
- R-35 PASS: local server, Chromium, interactive flows and screenshots were used.
- R-36 PASS: no performance or security claims added.
- R-37 PASS: explicit direction came from the user's screenshots and four-floor description.
- R-38 PASS: floor-plan interpretation, illustrative characters and simulated activity are stated in the UI.
- Liveliness PASS: the office scene is the main focus, navigation follows floor order, there is one active accent, and empty space separates the model from the controls.
- C-1 PASS: key decisions have written reasons.
- C-2 PASS: all control groups tested in a browser.
- C-3 PASS: each floor comes from a function the user named.
- C-4 PASS: three screen widths, floor changes, old tasks and reload tested.
- C-5 PASS: names/titles come from the user; avatar appearance is not a claim of real likeness.

## Archive: review of the original task system

Scope: the new task panel and its link to the characters. This is not an audit of the whole built-in 3D interface.

## Display decisions

Following the user's 3D office reference. ENERGY 1 / RHYTHM 2 / MOTION 1 for the task panel.

- The dark color follows the existing workspace and separates the form from the bright 3D scene.
- Blue marks the primary action; status is written as text.
- Two columns connect the form with the work list; a single column on phones preserves reading space.
- 32px spacing separates the form from the list; smaller spacing groups labels and inputs.
- Divider lines order the tasks; there are no decorative cards or extra icons.
- A native dialog provides modal focus and closing with Escape.

## Test evidence

Automated Chromium test: creating a task, HTML text treated as text, assignment, the one-active-task limit, completion with a result, filter, JSON export, persistence after reload, navigation to a character, tasks continuing after prayer, Tab/Shift+Tab/Escape, and camera shortcuts while typing. Failed-save and corrupt-JSON scenarios do not overwrite data. No JavaScript errors across the test run.

The display was checked via screenshots at 375, 768 and 1440px widths. The dialog has no horizontal overflow. Panel buttons are at least 44px; controls inside the panel are also at least 44px.

Contrast was computed with the WCAG formula and the anti-slop script: primary text 14.45:1, secondary text 9.16:1, placeholder 7.42:1, primary button 5.85:1, regular button 10.86:1, hover 8.01:1, pressed 5.78:1, input focus 8.34:1. Input border 3.53:1 against the input fill.

## Anti-slop gate

- R-01 PASS: no gradients or glow added.
- R-02 PASS: panel copy has no em dash.
- R-03 PASS: three widths tested without horizontal overflow.
- R-04 PASS: new controls use text labels with no generic icons.
- R-05 PASS: the form and list follow the flow of assigning work.
- R-06 PASS: system fonts follow the app's existing controls.
- R-07 PASS: no background pattern added.
- R-08 PASS: no decorative arrows added.
- R-09 PASS: status is text taken from task data.
- R-10 PASS: the new panel uses solid surfaces with no blur.
- R-11 PASS: 12px dialog radius and 6px input/button radius.
- R-12 PASS: no decorative shadows added.
- R-13 PASS: no glow added.
- R-14 PASS: tasks are a list, not uniform feature cards.
- R-15 PASS: buttons name concrete actions, such as Add task.
- R-16 PASS: copy explains function without AI marketing claims.
- R-17 PASS: task counts are computed from user data.
- R-18 PASS: no testimonials added.
- R-19 PASS: the panel adds no decorative animation.
- R-20 PASS: tasks connect to the existing office characters.
- R-21 PASS: the theme follows the reference and the existing 3D environment.
- R-22 PASS: no illustrations added.
- R-23 PASS: no new fictional identity or character added.
- R-24 PASS: View character opens the related character.
- R-25 PASS: panel text color pairs computed, minimum 5.78:1.
- R-26 PASS: new buttons tested through browser flows.
- R-27 PASS: empty and failed-save states are readable; synchronous localStorage operations need no network loading.
- R-28 PASS: no FAQ added.
- R-29 PASS: the panel uses navy, neutrals and a single blue accent.
- R-30 PASS: follows the user's prototype, not a copy of another product.
- R-31 PASS: display decision rationale recorded above.
- R-32 PASS: native controls, visible focus, Tab/Shift+Tab/Escape tested.
- R-33 PASS: changes were written directly via source patches.
- R-34 PASS: no theme toggle introduced.
- R-35 PASS: the app ran on a local server and the task flow was tested in Chromium.
- R-36 PASS: no security or performance claims added.
- R-37 PASS: direction came from the user's reference and the dials were stated before implementation.
- R-38 PASS: manual status and simulation limits are explained in the panel.
- Liveliness PASS: the task title is the dialog's focus; spacing separates groups; the blue accent marks actions; characters link the panel to the office.
- C-1 PASS: design reasons recorded.
- C-2 PASS: new controls have tested behavior.
- C-3 PASS: each part supports creating, finding or completing tasks.
- C-4 PASS: empty/error states, keyboard and three widths tested.
- C-5 PASS: the counter uses user data; results are not generated automatically.

## Limits of this version

No AI execution, cross-device/tab sync, or JSON import. Mobile testing used a Chromium viewport, not a physical device. Three.js is still loaded through the prototype's CDN.
