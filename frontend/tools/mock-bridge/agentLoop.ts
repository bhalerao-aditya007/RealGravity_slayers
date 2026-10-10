import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { RunState } from './realRunner';
import { emitEvent, requestPermission, callLLM } from './realRunner';

interface ToolCall {
  name: string;
  args: Record<string, any>;
}

// 1. Tool Executor with Real Permissions
async function executeTool(run: RunState, agentId: string, agentName: string, projectDir: string, call: ToolCall): Promise<string> {
  const { name, args } = call;

  if (name === 'execute_command') {
    const cmd = args.command || args.cmd || '';
    if (!cmd) return 'Error: command argument is required';

    const approved = await requestPermission(
      run,
      agentId,
      agentName,
      'shell.exec',
      cmd,
      'Execute terminal command',
      `Command: ${cmd}\nWorking Directory: ${projectDir}`
    );
    if (!approved) return 'Error: Permission denied by user';

    emitEvent(run, 'blackboard.note', agentId, undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: agentId,
      topic: 'COMMAND',
      note: `${agentName} executing: ${cmd.slice(0, 45)}...`,
      ts: '09:05'
    });

    try {
      const out = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 35000 });
      emitEvent(run, 'runtime.stream', agentId, undefined, { stdout: out });
      return out || '(command completed with no output)';
    } catch (err: any) {
      const msg = (err.stdout || '') + '\n' + (err.stderr || err.message || '');
      emitEvent(run, 'runtime.stream', agentId, undefined, { stderr: msg });
      return `Command failed (exit code ${err.status || 1}):\n${msg}`;
    }
  }

  if (name === 'read_file') {
    const filePath = args.filePath || args.path || '';
    if (!filePath) return 'Error: filePath argument is required';
    if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;

    const approved = await requestPermission(
      run,
      agentId,
      agentName,
      'file.read',
      filePath,
      'Read file contents',
      `File: ${filePath}\nSize: ${fs.statSync(filePath).size} bytes`
    );
    if (!approved) return 'Error: Permission denied by user';

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      try {
        const pyScript = `import sys; from pypdf import PdfReader; r = PdfReader(sys.argv[1]); print("\\n".join(p.extract_text() or "" for p in r.pages))`;
        return execSync(`python -c "${pyScript}" "${filePath}"`, { encoding: 'utf-8', timeout: 15000 }).trim();
      } catch (e: any) {
        return `Error extracting PDF: ${e?.message || String(e)}. Try running a python script to inspect it.`;
      }
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (name === 'write_file') {
    const relPath = args.filePath || args.filename || args.path || 'solution.py';
    const content = args.content || args.code || '';
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(projectDir, relPath);

    const approved = await requestPermission(
      run,
      agentId,
      agentName,
      'file.write',
      fullPath,
      'Write source code to disk',
      content.slice(0, 300) + (content.length > 300 ? '\n...' : '')
    );
    if (!approved) return 'Error: Permission denied by user';

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');

    emitEvent(run, 'blackboard.note', agentId, undefined, {
      id: `note_${Date.now()}`,
      author_agent_id: agentId,
      topic: 'FILE_SAVED',
      note: `Saved ${path.basename(fullPath)} (${content.split('\n').length} lines).`,
      ts: '09:08'
    });
    return `Successfully wrote ${content.length} bytes to ${fullPath}`;
  }

  if (name === 'list_dir') {
    const dirPath = args.dirPath || args.path || projectDir;
    if (!fs.existsSync(dirPath)) return `Directory does not exist: ${dirPath}`;
    const files = fs.readdirSync(dirPath);
    return `Files in ${dirPath}:\n` + files.join('\n');
  }

  return `Error: Unknown tool "${name}"`;
}

// 2. Parse Tool Calls from Model Output
function parseAction(text: string): ToolCall | null {
  // Matches Action: tool_name({"arg": "val"}) or Action: tool_name(args)
  const m = text.match(/Action:\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/);
  if (!m) return null;
  const name = m[1].trim();
  const rawArgs = m[2].trim();
  try {
    const args = JSON.parse(rawArgs);
    return { name, args };
  } catch {
    // If not strictly json, try basic string arg
    if (name === 'read_file') return { name, args: { filePath: rawArgs.replace(/^["']|["']$/g, '') } };
    if (name === 'execute_command') return { name, args: { command: rawArgs.replace(/^["']|["']$/g, '') } };
    return null;
  }
}

// 3. Autonomous ReAct Agent Loop
export async function runAutonomousAgent(run: RunState) {
  emitEvent(run, 'task.created', undefined, undefined, { goal: run.goal });
  emitEvent(run, 'sandbox.mode', undefined, undefined, { mode: 'real_gravity' });

  // Hire Agents
  const agent = { id: 'M0', name: 'Diya', role: 'manager', department: 'engineering' };
  emitEvent(run, 'worker.hired', agent.id, undefined, {
    agent: { ...agent, status: 'ASSIGNED', energy: 100, context_tokens: 0, context_max: 32768, current_task_id: null },
    desk: { x: 0, y: 0, z: 0 }
  });

  const projectName = 'Project_' + Date.now().toString(36);
  const projectDir = path.join('D:\\GravityDesk\\output', projectName);
  fs.mkdirSync(projectDir, { recursive: true });

  const systemPrompt = `You are Diya, an elite autonomous software engineer at GravityDesk.
You have direct access to your local computer environment through these tools:

- execute_command({"command": "..."}): Run any shell command (python, pip, node, etc.) in the project folder.
- read_file({"filePath": "..."}): Read any local file or document from disk.
- write_file({"filePath": "...", "content": "..."}): Write code or documentation to disk.
- list_dir({"dirPath": "..."}): List files in a folder.

HOW TO THINK AND ACT:
1. Examine the user goal carefully.
2. If the goal mentions a file (like a PDF, text file, or directory), inspect or read it first!
3. If you need a Python package or tool to read/process it, use execute_command to install it or write a python script to inspect it.
4. If an error occurs, READ THE ERROR, REASON, AND FIX IT!
5. Write complete, high-quality, fully-working code.
6. Test your code using execute_command to ensure it runs with 0 errors!
7. Format every step like this:
Thought: <what you are thinking and your next step>
Action: <tool_name>(<json_arguments>)

When you are 100% finished and verified, output:
Thought: I have solved the problem and verified all code runs with 0 errors.
Final Answer: <Complete summary of what was accomplished, files created, and how to use it>`;

  let conversation = `User Goal: "${run.goal}"\nProject Output Folder: "${projectDir}"\n\nPlease begin solving this autonomously.`;

  const maxSteps = 15;
  for (let step = 1; step <= maxSteps; step++) {
    emitEvent(run, 'llm.call_started', agent.id, undefined, { call_id: `step_${step}`, agent_id: agent.id, model: 'qwen3.8-27b', role: 'engineer' });

    let response = '';
    try {
      response = await callLLM(conversation, systemPrompt);
    } catch (e: any) {
      emitEvent(run, 'blackboard.note', agent.id, undefined, {
        id: `note_${Date.now()}`,
        author_agent_id: agent.id,
        topic: 'LLM_ERROR',
        note: `LLM reasoning failed: ${e?.message || String(e)}`,
        ts: '09:00'
      });
      break;
    }

    emitEvent(run, 'llm.call_finished', agent.id, undefined, { call_id: `step_${step}`, tokens_in: 600, tokens_out: 400, latency_ms: 1200 });

    // Extract Thought
    const thoughtMatch = response.match(/Thought:\s*([\s\S]*?)(?=Action:|Final Answer:|$)/i);
    if (thoughtMatch) {
      const thoughtText = thoughtMatch[1].trim();
      emitEvent(run, 'blackboard.note', agent.id, undefined, {
        id: `note_${Date.now()}`,
        author_agent_id: agent.id,
        topic: 'THOUGHT',
        note: thoughtText.slice(0, 160) + (thoughtText.length > 160 ? '...' : ''),
        ts: `Step ${step}`
      });
    }

    // Check for Final Answer
    if (response.includes('Final Answer:')) {
      const finalIndex = response.indexOf('Final Answer:');
      const finalReport = response.slice(finalIndex + 13).trim();

      fs.writeFileSync(path.join(projectDir, 'README.md'), finalReport, 'utf-8');

      emitEvent(run, 'result.final', undefined, undefined, {
        report_markdown: finalReport,
        sources: fs.readdirSync(projectDir).map(f => ({ name: f, url: `file:///${projectDir.replace(/\\/g, '/')}/${f}` })),
        effort_logical_s: 1800,
        effort_real_s: Math.round((Date.now() - run.startedAt) / 1000)
      });
      break;
    }

    // Parse Action
    const toolCall = parseAction(response);
    if (!toolCall) {
      // Prompt model to choose an action
      conversation += `\n${response}\nObservation: Please specify an Action: tool_name({"arg": "val"}) to proceed, or Final Answer: if complete.`;
      continue;
    }

    // Execute Tool
    const observation = await executeTool(run, agent.id, agent.name, projectDir, toolCall);

    conversation += `\n${response}\nObservation: ${observation}`;
  }

  run.done = true;
}
