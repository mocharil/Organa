# Organa Live Organization Digital Twin

Organa's 3D Office is a visualization of verified application state. It is not an LLM-controlled game layer.

## Control boundary

```text
Human Founder
    ↓
Mission Control
    ↓
Deterministic Orchestrator
    ↓
Persisted Tasks / Meetings / Approvals / Events
    ↓
3D Digital-Twin Mapper
    ↓
Office movement + status visuals
```

Gemini or another configured model may generate bounded plans and work content. It does not directly move a Three.js character, choose a room, bypass dependencies, or resolve an approval. Those behaviors come from persisted server state.

## State-to-space mapping

| Verified state | 3D representation |
| --- | --- |
| `task.queued` | Coworker stays available at their department desk with a subtle ready state. |
| `task.started` | Coworker returns to their desk. A cyan status orbit appears and a light pulse travels from the shared goal node to the coworker. |
| `waiting_dependency` | Coworker remains at their desk with an amber waiting state. |
| `task.blocked` | Coworker moves to the Review Hub and waits for human input. |
| `task.needs_review` | Coworker moves to the Review Hub with an indigo review state. |
| `meeting.started` | Persisted meeting participants move to the Meeting Room with a violet collaboration orbit. |
| `meeting.completed` | Participants return to their work context. The moderator carries the meeting synthesis to the Review Hub. |
| meeting approval | The Review Hub state resolves only after the human approval event. |
| `task.completed` | The responsible coworker receives a short green completion pulse before becoming available. |
| `task.failed` | Coworker remains visible with a blocked/error state. |

## Event bridge

The browser polls `/api/events` and deduplicates events by event ID. The event feed is used for live transitions and human-readable activity. Current task state remains the source of truth when reconstructing the office after a reload.

This means a page reload does not depend on replaying every historical animation. Organa reconstructs the current task and meeting state first, then listens for new events.

## Ambient behavior

Ambient movement is deliberately separated from work state.

Idle coworkers may still use the lounge, pantry, rooftop, lunch area, task board, phone booth, or prayer room where appropriate. A coworker with verified work, dependency waiting, human review, or collaboration state cannot be moved away by ambient routines or simulation controls.

This preserves the visual value of the office without allowing decorative motion to misrepresent real AI execution.
