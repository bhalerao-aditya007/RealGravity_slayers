import { useStore } from '@/state/store';
import { director } from '@/sim/director';

export interface ChatMessage {
  role: 'user' | 'manager';
  text: string;
  ts: string;
}

class ManagerMemoryAgent {
  public reset(): void {
    const mgr = director.rt('M0');
    if (mgr) mgr.bubble = undefined;
  }
  private history: ChatMessage[] = [];

  public getHistory(): ChatMessage[] {
    return [...this.history];
  }

  public async processDirective(userText: string): Promise<string> {
    const s = useStore.getState();
    const now = s.simClock || '10:00';
    const goal = s.goal || 'Build a real-time crypto price tracker in React with the name of project as "CRYPTracker"';
    const isCrypto = /crypto|btc|eth|tracker|coin/i.test(goal);
    const projectName = isCrypto ? 'CRYPTracker' : goal.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'GravityProject';
    const localDir = `D:\\GravityDesk\\output\\${projectName}`;

    this.history.push({ role: 'user', text: userText, ts: now });

    const lower = userText.toLowerCase().trim();
    let reply = '';
    let blackboardNote = '';

    // 1. Where are output files / download / zip / code inquiry
    if (
      lower.includes('output') ||
      lower.includes('download') ||
      lower.includes('where') ||
      lower.includes('code') ||
      lower.includes('zip') ||
      lower.includes('file') ||
      lower.includes('collect')
    ) {
      reply = `All deliverables for ${projectName} are ready! You can download the complete source code as a .ZIP archive or Markdown report directly from the Final Report modal. In addition, the entire codebase has been saved to your local disk at ${localDir}.`;
      blackboardNote = `Delivered full ${projectName} source bundle & zip export to user.`;

      setTimeout(() => {
        useStore.setState({ reportOpen: true });
      }, 400);
    }
    // 2. Continue / Next Phase
    else if (
      lower.includes('continue') ||
      lower.includes('next') ||
      lower.includes('proceed') ||
      lower.includes('more') ||
      lower.includes('extend')
    ) {
      reply = `Understood! Launching Phase 2 expansion for ${projectName}. Scheduling: T9 (Portfolio & PnL Tracker ? Rohan), T10 (Price Alert Web Notifications ? Vikram), and T11 (Local Storage Offline Cache ? Isha). Team is mobilizing.`;
      blackboardNote = `Phase 2 roadmap activated for ${projectName}.`;

      const currentTaskCount = Object.keys(s.tasks).length;
      const nextId1 = `T${currentTaskCount + 1}`;
      const nextId2 = `T${currentTaskCount + 2}`;
      const nextId3 = `T${currentTaskCount + 3}`;
      const workerList = Object.values(s.agents).filter((a) => a.role === 'worker');
      const w1 = workerList[0]?.id ?? 'W_backend_0';
      const w2 = workerList[1]?.id ?? 'W_frontend_0';
      const w3 = workerList[2]?.id ?? 'W_qa_0';

      const newTasks = {
        ...s.tasks,
        [nextId1]: {
          id: nextId1,
          parent_id: 'M0',
          description: `Portfolio balance & profit/loss tracker`,
          owner_role: 'backend',
          assigned_agent: w1,
          status: 'running' as const,
          priority: 2,
          depends_on: [],
          attempts: 0,
          progress_pct: 30,
          est_effort_s: 1400,
        },
        [nextId2]: {
          id: nextId2,
          parent_id: 'M0',
          description: `Price alert threshold engine & web notifications`,
          owner_role: 'frontend',
          assigned_agent: w2,
          status: 'pending' as const,
          priority: 2,
          depends_on: [nextId1],
          attempts: 0,
          progress_pct: 0,
          est_effort_s: 1100,
        },
        [nextId3]: {
          id: nextId3,
          parent_id: 'M0',
          description: `Offline local storage persistence & caching`,
          owner_role: 'content',
          assigned_agent: w3,
          status: 'pending' as const,
          priority: 2,
          depends_on: [nextId2],
          attempts: 0,
          progress_pct: 0,
          est_effort_s: 900,
        },
      };

      const newEdges = [
        ...s.edges,
        { from: `T${currentTaskCount}`, to: nextId1 },
        { from: nextId1, to: nextId2 },
        { from: nextId2, to: nextId3 },
      ];

      useStore.setState({ tasks: newTasks, edges: newEdges });
    }
    // 3. Stop / Cancel / Pause
    else if (lower.includes('stop') || lower.includes('halt') || lower.includes('cancel') || lower.includes('pause')) {
      reply = `Emergency Stop acknowledged. Halting entire system across all workers, tasks, manager loops, and processes.`;
      blackboardNote = `Entire system halted by operator directive.`;

      import('@/state/engine').then(({ haltEntireSystem }) => {
        haltEntireSystem();
      });
    }
    // 4. Real LLM Reasoning & Technical Conversation Engine
    else {
      try {
        const systemPrompt = `You are Diya, the Lead Engineering Manager of the GravityDesk autonomous software development swarm.
Current project: "${goal}" (Target: ${projectName}).
Team members under your direction:
- Aanya: Architecture & Lead Systems Engineer
- Kabir: Lead Frontend Architect (React, TypeScript, WebSocket streaming, Tailwind)
- Nisha: QA & Verification Lead (Vitest, assertions, boundary checks)
- Tara: Technical Research & Documentation Lead
- Rohan: Senior Backend Engineer (APIs, WebSockets, rate limiters)
- Isha & Vikram: Frontend Core Developers
Deliverables are stored at: ${localDir}
Answer the user's question with exceptional technical depth, crisp operational clarity, and professional leadership. Keep your response concise (2-4 sentences max).`;

        const resp = await fetch('http://localhost:8000/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userText, system: systemPrompt })
        });
        const data = await resp.json();
        reply = data.reply || `Understood. Reviewing "${userText}" with team leads.`;
      } catch {
        if (lower.includes('insight') || lower.includes('summary')) {
          reply = `Key team insights for ${projectName}: 1) We implemented an RAF batch buffer to clamp WebSocket ticker state re-renders to 60 FPS, eliminating main-thread lockups. 2) Fallback to CoinGecko REST was added for connection dropouts. 3) Component trees were segmented to isolate card state updates.`;
        } else {
          reply = `Directive received: "${userText}". Reviewing current ${projectName} progress with team leads.`;
        }
      }
      blackboardNote = `Diya responded to user inquiry: "${userText.slice(0, 35)}..."`;
    }

    this.history.push({ role: 'manager', text: reply, ts: now });

    // 3D Office visual feedback: Speech bubble over Diya
    const mgr = director.rt('M0');
    if (mgr) {
      mgr.bubble = { text: reply.length > 90 ? reply.slice(0, 87) + '...' : reply, until: director.time + 6 };
    }

    // Update store log and blackboard
    setTimeout(() => {
      const st = useStore.getState();
      useStore.setState({
        log: [
          ...st.log,
          { id: Date.now() + 1, ts_sim: st.simClock, type: 'manager.response', text: `Diya ? You: "${reply}"` },
        ],
        notes: [
          ...st.notes,
          {
            id: `note_${Date.now()}`,
            author_agent_id: 'M0',
            topic: 'DIRECTIVE',
            note: blackboardNote || `Diya: ${reply}`,
            ts: st.simClock,
          },
        ],
        notePulse: Date.now(),
      });
    }, 250);

    return reply;
  }
}

export const managerAgent = new ManagerMemoryAgent();
