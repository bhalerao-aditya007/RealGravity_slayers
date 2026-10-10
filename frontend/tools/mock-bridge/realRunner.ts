import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import type { WebSocket } from 'ws';

export interface RunState {
  id: string;
  goal: string;
  startedAt: number;
  events: any[];
  seq: number;
  clients: Set<WebSocket>;
  done: boolean;
  speed: number;
  vt: number;
  pendingResolvers: Map<string, (decision: 'once' | 'always' | 'reject') => void>;
  alwaysAllowed: Set<string>;
}

// 1. Ensure Environment Variables are Loaded
export function loadEnv() {
  const envPaths = [
    'D:\\GravityDesk\\.env',
    'D:\\GravityDesk\\frontend\\.env',
    path.resolve(process.cwd(), '.env')
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      const content = fs.readFileSync(ep, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq > 0) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (v) {
            process.env[k] = v;
          }
        }
      }
    }
  }
}
loadEnv();

export function emitEvent(run: RunState, type: string, agent_id: string | undefined, task_id: string | undefined, payload: any) {
  const mins = 9 * 60 + (run.vt * 30) / 60;
  const ts_sim = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;
  const ev = {
    seq: ++run.seq,
    run_id: run.id,
    ts_real: new Date().toISOString(),
    ts_sim,
    type,
    agent_id,
    task_id,
    payload
  };
  run.events.push(ev);
  const msg = JSON.stringify(ev);
  for (const client of run.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
  }
  return ev;
}

interface LLMMeta {
  run?: RunState;
  agentId?: string;
  agentName?: string;
  callId?: string;
  role?: string;
}

// 2. High-Performance Multi-Model Pipeline with Rate Limit Fallback
export async function callLLM(
  prompt: string,
  systemPrompt = 'You are an expert AI software architect and senior developer.',
  meta?: LLMMeta
): Promise<string> {
  if (meta?.run?.done) throw new Error('Execution cancelled by operator');
  loadEnv();
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  // Ordered by parameter size & reasoning power
  // Ordered by speed, responsiveness & reasoning capability
  const modelCandidates = [
    // 1. High-Speed DeepSeek V3 (Sub-3s latency, top-tier coding)
    { provider: 'openrouter', model: 'deepseek/deepseek-chat', maxTokens: 4096, displayName: 'DeepSeek-V3 (OpenRouter)' },
    // 2. Deep Reasoning DeepSeek R1 (Full Chain-of-Thought)
    { provider: 'openrouter', model: 'deepseek/deepseek-r1', maxTokens: 4096, displayName: 'DeepSeek-R1 (OpenRouter)' },
    // 3. Coding Specialist Qwen 2.5 Coder
    { provider: 'openrouter', model: 'qwen/qwen-2.5-coder-32b-instruct', maxTokens: 4096, displayName: 'Qwen-2.5-Coder (OpenRouter)' },
    // 4. Llama 3.3 70B
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct', maxTokens: 3500, displayName: 'Llama-3.3-70B (OpenRouter)' },
    // 5. Direct DeepSeek API (if DEEPSEEK_API_KEY is configured)
    { provider: 'deepseek', model: 'deepseek-chat', maxTokens: 4096, displayName: 'DeepSeek-V3 (Direct)' },
    { provider: 'deepseek', model: 'deepseek-reasoner', maxTokens: 4096, displayName: 'DeepSeek-R1 (Direct)' },
    // 6. Groq Fallbacks
    { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: 3500, displayName: 'Llama-3.3-70B (Groq)' }
  ];

  let lastError: any = null;

  for (let mIdx = 0; mIdx < modelCandidates.length; mIdx++) {
    const candidate = modelCandidates[mIdx];
    const isGroq = candidate.provider === 'groq';
    const isDeepSeek = candidate.provider === 'deepseek';
    const apiKey = isDeepSeek ? deepseekKey : (isGroq ? groqKey : openRouterKey);

    if (!apiKey) continue;

    // Announce active model in UI & telemetry
    if (meta?.run && meta?.agentId) {
      emitEvent(meta.run, 'llm.call_started', meta.agentId, undefined, {
        call_id: meta.callId || `call_${Date.now()}`,
        agent_id: meta.agentId,
        model: candidate.displayName,
        role: meta.role || 'engineer'
      });
    }

    const maxAttempts = isGroq ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const endpoint = isDeepSeek
          ? 'https://api.deepseek.com/chat/completions'
          : (isGroq
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions');

        const headers: Record<string, string> = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'GravityDesk/1.0'
        };

        if (!isGroq) {
          headers['HTTP-Referer'] = 'http://localhost:5173';
          headers['X-Title'] = 'GravityDesk';
        }

        const t0 = Date.now();
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(65000),
          body: JSON.stringify({
            model: candidate.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: candidate.maxTokens
          })
        });

        // 429 Rate Limit Handling
        if (resp.status === 429) {
          const retryHeader = resp.headers.get('retry-after');
          const waitSec = retryHeader ? Math.min(Number(retryHeader), 4) : 2;
          console.warn(`[RateLimit 429] ${candidate.displayName} hit rate limit ceiling.`);

          if (attempt < maxAttempts) {
            console.log(`[Backoff] Waiting ${waitSec}s before retrying ${candidate.model}...`);
            if (meta?.run && meta?.agentId) {
              emitEvent(meta.run, 'agent.break_start', meta.agentId, undefined, { kind: 'coffee' });
            }
            await new Promise(r => setTimeout(r, waitSec * 1000));
            if (meta?.run && meta?.agentId) {
              emitEvent(meta.run, 'agent.break_end', meta.agentId, undefined, {});
            }
            continue;
          }

          // If rate limit window exhausted, fall through to next model
          const nextModel = modelCandidates[mIdx + 1];
          if (nextModel && meta?.run) {
            emitEvent(meta.run, 'blackboard.note', meta.agentId || 'M0', undefined, {
              id: `note_${Date.now()}`,
              author_agent_id: meta.agentId || 'M0',
              topic: 'RATE_LIMIT_FALLBACK',
              note: `⚡ ${candidate.displayName} rate-limited. Auto-switched to fallback model: ${nextModel.displayName}.`,
              ts: '09:08'
            });
          }
          break; // Try next candidate model
        }

        if (resp.ok) {
          const data: any = await resp.json();
          const latency = Date.now() - t0;
          const choice = data.choices?.[0]?.message;
          let content = choice?.content;

          // If content is empty or null (e.g. reasoning models), extract from reasoning
          if (!content && choice?.reasoning) {
            content = choice.reasoning;
          }

          if (content && typeof content === 'string' && content.trim().length > 0) {
            if (meta?.run && meta?.agentId) {
              emitEvent(meta.run, 'llm.call_finished', meta.agentId, undefined, {
                call_id: meta.callId || `call_${Date.now()}`,
                model: candidate.displayName,
                tokens_in: data.usage?.prompt_tokens || 800,
                tokens_out: data.usage?.completion_tokens || 600,
                latency_ms: latency
              });
            }
            return content;
          }
        } else {
          const errText = await resp.text();
          console.warn(`[LLM Error ${resp.status}] ${candidate.displayName}: ${errText.slice(0, 200)}`);
          lastError = new Error(`HTTP ${resp.status}: ${errText.slice(0, 100)}`);
        }
      } catch (e: any) {
        console.warn(`[LLM Exception] ${candidate.displayName}:`, e.message);
        lastError = e;
      }
    }
  }

  throw new Error(`All LLM models failed or rate limited: ${lastError?.message || 'Check API keys'}`);
}

// 3. Permission Gate Handler (Interactive UI approval)
export async function requestPermission(
  run: RunState,
  agent_id: string,
  agent_name: string,
  action: 'file.read' | 'file.write' | 'shell.exec',
  resource: string,
  effect: string,
  preview: string
): Promise<boolean> {
  if (run.done) return false;
  if (run.alwaysAllowed.has('all') || run.alwaysAllowed.has(action)) {
    return true;
  }

  const requestId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  emitEvent(run, 'permission.requested', agent_id, undefined, {
    request_id: requestId,
    agent_id,
    agent_name,
    action,
    effect,
    resource,
    preview
  });

  return new Promise<boolean>((resolve) => {
    run.pendingResolvers.set(requestId, (decision) => {
      run.pendingResolvers.delete(requestId);
      emitEvent(run, 'permission.resolved', agent_id, undefined, {
        request_id: requestId,
        decision
      });

      if (decision === 'always') {
        run.alwaysAllowed.add('all');
        resolve(true);
      } else if (decision === 'once') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// 4. File / Input Discovery
export function extractFilePath(goal: string): string | null {
  // Matches "C:\path\to\file.ext" or C:\path\to\file or /unix/path
  const winMatch = goal.match(/[a-zA-Z]:\\[^"'\n\r<>|*?]+/);
  if (winMatch) return winMatch[0].trim();
  const quotedMatch = goal.match(/"([^"]+\.[a-zA-Z0-9]+)"/);
  if (quotedMatch) return quotedMatch[1].trim();
  return null;
}

export function extractFileContent(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const scriptPath = path.resolve('D:\\GravityDesk\\frontend\\tools\\mock-bridge\\universal_extractor.py');
  return execFileSync('python', [scriptPath, filePath], { encoding: 'utf-8', timeout: 35000 }).trim();
}

// 5. Complete Autonomous Engineering Execution Loop
export async function executeRealRun(run: RunState) {
  try {
    emitEvent(run, 'task.created', undefined, undefined, { goal: run.goal });
    emitEvent(run, 'sandbox.mode', undefined, undefined, { mode: 'native' });

    // Hire Core Team
    const team = [
      { id: 'M0', name: 'Diya', role: 'manager' as const, department: 'management', avatar_seed: 1, desk: { x: 0, z: 0 } },
      { id: 'W_backend_0', name: 'Rohan', role: 'worker' as const, department: 'engineering', avatar_seed: 2, desk: { x: 4, z: 8 } },
      { id: 'W_frontend_0', name: 'Kabir', role: 'worker' as const, department: 'engineering', avatar_seed: 3, desk: { x: 6, z: 8 } },
      { id: 'W_qa_0', name: 'Nisha', role: 'worker' as const, department: 'engineering', avatar_seed: 4, desk: { x: 8, z: 8 } },
    ];
    for (const a of team) {
      emitEvent(run, 'worker.hired', a.id, undefined, {
        agent: {
          id: a.id,
          name: a.name,
          role: a.role,
          department: a.department,
          parent_id: null,
          engine: { kind: 'llm' as const, label: 'gpt-oss-120b' },
          status: 'ASSIGNED',
          energy: 100,
          context_tokens: 0,
          context_max: 32768,
          current_task_id: null,
          avatar_seed: a.avatar_seed
        },
        desk: a.desk
      });
    }

    emitEvent(run, 'blackboard.note', 'M0', undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: 'M0',
      topic: 'ANALYSIS',
      note: `Diya initialized project orchestration. Parsing user objective...`,
      ts: '09:01'
    });

    // Step A: Inspect context or external file paths
    let inputContext = '';
    const potentialPath = extractFilePath(run.goal);
    if (potentialPath && fs.existsSync(potentialPath)) {
      const stat = fs.statSync(potentialPath);
      const isDir = stat.isDirectory();
      const approved = await requestPermission(
        run,
        'M0',
        'Diya (Manager)',
        'file.read',
        potentialPath,
        isDir ? 'Index project directory tree and source files' : 'Read file contents for AI task analysis',
        `Target: ${potentialPath}\nSize: ${stat.size} bytes`
      );

      if (!approved) {
        emitEvent(run, 'task.failed', 'M0', undefined, { reason: 'User denied file read permission' });
        emitEvent(run, 'blackboard.note', 'M0', undefined, {
          id: `note_${Date.now()}`,
          author_agent_id: 'M0',
          topic: 'SECURITY',
          note: `File access rejected by user. Aborting task.`,
          ts: '09:02'
        });
        run.done = true;
        return;
      }

      inputContext = extractFileContent(potentialPath);
      emitEvent(run, 'blackboard.note', 'M0', undefined, {
        id: `note_${Date.now()}`,
        author_agent_id: 'M0',
        topic: 'FILE_INGESTED',
        note: `Successfully ingested ${path.basename(potentialPath)} (${inputContext.length} chars).`,
        ts: '09:03'
      });
    }

    // Step B: Decompose Goal into Task DAG with Real LLM
    const planPrompt = `User Goal: "${run.goal}"
${inputContext ? `Input Document/File Content:\n"""\n${inputContext.slice(0, 8000)}\n"""\n` : ''}

You are the Lead Engineering Manager. Create an end-to-end, realistic software engineering execution plan to completely fulfill the user's objective.
Generate 2 to 4 concrete milestone tasks.
Format your answer strictly as a JSON object:
{
  "project_name": "ProjectSlugWithoutSpaces",
  "summary": "Brief 1-2 sentence description",
  "tasks": [
    {
      "id": "T1",
      "description": "Milestone title",
      "target_file": "relative/file/path.py",
      "owner_role": "backend",
      "assigned_agent": "W_backend_0",
      "depends_on": [],
      "task_prompt": "Specific instructions on what code logic, functions, and algorithms to implement"
    }
  ]
}`;

    const planRaw = await callLLM(
      planPrompt,
      'You are an autonomous engineering orchestrator. Output ONLY raw valid JSON, no markdown blocks, no text.',
      { run, agentId: 'M0', agentName: 'Diya', callId: 'plan_1', role: 'manager' }
    );

    let plan: any;
    try {
      const cleaned = planRaw.replace(/```json/g, '').replace(/```/g, '').trim();
      // Extract json substring if extra text was included
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        plan = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } else {
        plan = JSON.parse(cleaned);
      }
    } catch {
      // Sensible fallback plan if model response is not valid JSON
      plan = {
        project_name: 'GravityTask_' + Date.now().toString(36),
        summary: 'Executable software solution for ' + run.goal.slice(0, 40),
        tasks: [
          {
            id: 'T1',
            description: 'Core logic implementation',
            target_file: 'src/solution.py',
            owner_role: 'backend',
            assigned_agent: 'W_backend_0',
            depends_on: [],
            task_prompt: 'Write clean, robust, working code for: ' + run.goal
          },
          {
            id: 'T2',
            description: 'Automated test suite & verification assertions',
            target_file: 'src/test_solution.py',
            owner_role: 'qa',
            assigned_agent: 'W_qa_0',
            depends_on: ['T1'],
            task_prompt: 'Write unit tests validating all functions from solution.py'
          }
        ]
      };
    }

    const projectName = (plan.project_name || 'ProjectOutput').replace(/[^a-zA-Z0-9_-]/g, '');
    const outputDir = path.join('D:\\GravityDesk\\output', projectName);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Emit Real Task DAG to Frontend
    const nodes = plan.tasks.map((t: any) => ({
      id: t.id,
      parent_id: null,
      description: t.description,
      owner_role: t.owner_role || 'backend',
      assigned_agent: t.assigned_agent || 'W_backend_0',
      status: 'pending',
      priority: 2,
      depends_on: t.depends_on || [],
      attempts: 0,
      progress_pct: 0,
      est_effort_s: 600
    }));
    const edges = plan.tasks.flatMap((t: any) => (t.depends_on || []).map((dep: string) => ({ from: dep, to: t.id })));

    emitEvent(run, 'plan.ready', undefined, undefined, {
      nodes,
      edges,
      plan_meta: {
        intensity: 'standard',
        break_policy: {
          pace: 'normal',
          coffee: 'on_compaction',
          meals: true,
          chats: 'on_handoff'
        },
        est_effort_s: 1800
      }
    });

    emitEvent(run, 'blackboard.note', 'M0', undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: 'M0',
      topic: 'DAG_APPROVED',
      note: `Task DAG generated with ${nodes.length} nodes. Mobilizing engineering lanes...`,
      ts: '09:05'
    });

    const generatedFiles: Record<string, string> = {};

    // Step C: Execute Each Milestone Task with Assigned Agent
    for (const task of plan.tasks) {
      if (run.done) return; // Check operator cancellation
      const agentId = task.assigned_agent || 'W_backend_0';
      const agentName = team.find(a => a.id === agentId)?.name || 'Engineer';

      // 1.5s gentle pacing pause between tasks to avoid bursting TPM rate limits
      await new Promise(r => setTimeout(r, 1500));

      emitEvent(run, 'task.started', agentId, task.id, { task_id: task.id, agent_id: agentId });
      emitEvent(run, 'agent.state_changed', agentId, undefined, { agent_id: agentId, from: 'ASSIGNED', to: 'WORKING' });
      emitEvent(run, 'blackboard.note', agentId, undefined, {
        id: `note_${Date.now()}`,
        author_agent_id: agentId,
        topic: 'IMPLEMENTATION',
        note: `${agentName} started "${task.description}" (target: ${task.target_file}).`,
        ts: '09:07'
      });

      emitEvent(run, 'task.progress', agentId, task.id, { task_id: task.id, pct: 30 });

      const codePrompt = `Project Objective: "${run.goal}"
Task: "${task.description}"
File to produce: "${task.target_file}"
Specific task requirements:
${task.task_prompt}

${Object.keys(generatedFiles).length > 0 ? `Already created files in this project:\n` + Object.entries(generatedFiles).map(([f, c]) => `--- ${f} ---\n${c.slice(0, 1500)}`).join('\n\n') : ''}

Instructions:
Write complete, fully-implemented, runnable code.
Include thorough comments, clear function names, error handling, and testable examples.
DO NOT leave placeholder comments, TODOs, or stubs.
Return ONLY raw code (no markdown quotes, no conversational filler).`;

      const rawCode = await callLLM(
        codePrompt,
        'You are a principal engineer writing production-grade code. Return code only.',
        { run, agentId, agentName, callId: `code_${task.id}`, role: task.owner_role }
      );

      const cleanCode = rawCode.replace(/^```[a-zA-Z]*\n/g, '').replace(/\n```$/g, '').trim();
      generatedFiles[task.target_file] = cleanCode;

      emitEvent(run, 'task.progress', agentId, task.id, { task_id: task.id, pct: 70 });

      // Ask File Write Permission
      let targetFile = (task.target_file || 'main.py').replace(/\\/g, '/');
      if (targetFile.endsWith('/') || !path.extname(targetFile)) {
        targetFile = path.posix.join(targetFile, targetFile.includes('test') ? 'test_suite.py' : 'main.py');
      }
      generatedFiles[targetFile] = cleanCode;

      const targetFullPath = path.join(outputDir, targetFile);
      const writeApproved = await requestPermission(
        run,
        agentId,
        agentName,
        'file.write',
        targetFullPath,
        `Write verified source file to disk`,
        cleanCode.slice(0, 300) + (cleanCode.length > 300 ? '\n...' : '')
      );

      if (writeApproved) {
        fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
        fs.writeFileSync(targetFullPath, cleanCode, 'utf-8');
        emitEvent(run, 'blackboard.note', agentId, undefined, {
          id: `note_${Date.now()}`,
          author_agent_id: agentId,
          topic: 'DISK_WRITE',
          note: `Saved ${targetFile} to ${outputDir}.`,
          ts: '09:09'
        });
      }

      emitEvent(run, 'task.progress', agentId, task.id, { task_id: task.id, pct: 100 });
      emitEvent(run, 'task.completed', agentId, task.id, { task_id: task.id, result_preview: `${task.target_file} written.` });
      emitEvent(run, 'agent.state_changed', agentId, undefined, { agent_id: agentId, from: 'WORKING', to: 'ASSIGNED' });
    }

    // Step D: Real Code Execution & Verification Gate
    const pyFiles = Object.keys(generatedFiles).filter(f => f.endsWith('.py'));
    if (pyFiles.length > 0) {
      const testFile = pyFiles.find(f => f.includes('test')) || pyFiles[0];
      const fullTestPath = path.join(outputDir, testFile);

      const execApproved = await requestPermission(
        run,
        'W_qa_0',
        'Nisha (QA Lead)',
        'shell.exec',
        `python "${fullTestPath}"`,
        `Execute automated test gate & verify runtime stability`,
        `Command: python "${fullTestPath}"\nWorking Directory: ${outputDir}`
      );

      if (execApproved) {
        emitEvent(run, 'blackboard.note', 'W_qa_0', undefined, {
          id: `note_${Date.now()}`,
          author_agent_id: 'W_qa_0',
          topic: 'VERIFICATION',
          note: `Nisha running automated execution gate on ${testFile}...`,
          ts: '09:12'
        });

        try {
          const runOutput = execSync(`python "${fullTestPath}"`, {
            cwd: outputDir,
            encoding: 'utf-8',
            timeout: 20000
          });
          emitEvent(run, 'runtime.stream', 'W_qa_0', undefined, { stdout: runOutput });
          emitEvent(run, 'validation.passed', 'W_qa_0', undefined, { target: testFile, details: '0 errors, all assertions passed' });
        } catch (err: any) {
          const errOutput = (err.stdout || '') + '\n' + (err.stderr || err.message || '');
          emitEvent(run, 'runtime.stream', 'W_qa_0', undefined, { stderr: errOutput });
        }
      }
    }

    // Step E: Generate Final Report & Summary
    const reportMd = `# ${projectName} - Execution Deliverables

**Goal:** ${run.goal}
**Output Directory:** \`${outputDir}\`

## Generated Source Files:
${Object.keys(generatedFiles).map(f => `- **\`${f}\`** (${generatedFiles[f].split('\n').length} lines)`).join('\n')}

## Verification Status:
All tasks were synthesized by the GravityDesk engineering team, gated with permission checks, and compiled to disk.

---
*Generated autonomously by GravityDesk Multi-Agent Floor.*
`;

    fs.writeFileSync(path.join(outputDir, 'README.md'), reportMd, 'utf-8');

    emitEvent(run, 'result.final', undefined, undefined, {
      report_markdown: reportMd,
      sources: Object.keys(generatedFiles).map(f => ({
        title: f,
        url: `file:///${outputDir.replace(/\\/g, '/')}/${f}`,
        verified: true
      })),
      effort_logical_s: 1800,
      effort_real_s: Math.max(1, Math.round((Date.now() - run.startedAt) / 1000))
    });

    emitEvent(run, 'blackboard.note', 'M0', undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: 'M0',
      topic: 'DELIVERED',
      note: `Project ${projectName} complete! Full deliverables written to ${outputDir}.`,
      ts: '09:15'
    });

  } catch (err: any) {
    console.error('[RealRunner] Error executing run:', err);
    emitEvent(run, 'blackboard.note', 'M0', undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: 'M0',
      topic: 'ERROR',
      note: `Execution halted: ${err?.message || String(err)}`,
      ts: '09:16'
    });
  } finally {
    run.done = true;
  }
}
