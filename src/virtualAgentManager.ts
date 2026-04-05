import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { JSONL_POLL_INTERVAL_MS } from '../server/src/constants.js';
import { getProjectDirPath } from './agentManager.js';
import { TERMINAL_NAME_PREFIX } from './constants.js';
import { ensureProjectScan, readNewLines, startFileWatching } from './fileWatcher.js';
import { parseOrgConfig } from './orgConfigLoader.js';
import type { OrgConfig, VirtualAgent, VirtualAgentWebviewInfo } from './orgTypes.js';
import type { AgentState } from './types.js';

/**
 * Load all agents from an org config file and assign IDs.
 * Returns the list of VirtualAgent objects ready for the webview.
 */
export function loadOrgAgents(
  orgConfig: OrgConfig,
  nextAgentIdRef: { current: number },
): VirtualAgent[] {
  const orgAgents = parseOrgConfig(orgConfig.configPath, orgConfig.agentBasePath);
  const virtualAgents: VirtualAgent[] = [];

  for (const oa of orgAgents) {
    const id = nextAgentIdRef.current++;
    virtualAgents.push({
      id,
      orgId: orgConfig.id,
      orgAgentKey: oa.key,
      title: oa.title,
      role: oa.role,
      department: oa.department,
      agentFilePath: oa.agentFilePath,
      model: oa.model,
      isLaunched: false,
      terminalAgentId: null,
    });
  }

  return virtualAgents;
}

/**
 * Send all virtual agents to the webview for rendering.
 */
export function sendVirtualAgentsToWebview(
  orgConfig: OrgConfig,
  virtualAgents: VirtualAgent[],
  webview: vscode.Webview | undefined,
): void {
  const agents: VirtualAgentWebviewInfo[] = virtualAgents.map((va) => ({
    id: va.id,
    key: va.orgAgentKey,
    title: va.title,
    role: va.role,
    department: va.department,
    model: va.model,
    hasAgentFile: va.agentFilePath !== null,
  }));

  webview?.postMessage({
    type: 'virtualAgentsLoaded',
    orgId: orgConfig.id,
    orgName: orgConfig.name,
    agents,
  });
}

/**
 * Clear all virtual agents from the office.
 * Sends agentClosed for each virtual agent that hasn't been launched as a terminal.
 */
export function clearVirtualAgents(
  virtualAgentsMap: Map<number, VirtualAgent>,
  webview: vscode.Webview | undefined,
): void {
  for (const [id, va] of virtualAgentsMap) {
    // Only close agents that haven't been converted to real terminals
    if (!va.isLaunched) {
      webview?.postMessage({ type: 'agentClosed', id });
    }
  }
  virtualAgentsMap.clear();
  webview?.postMessage({ type: 'virtualAgentsCleared' });
}

/**
 * Launch a terminal for a virtual agent using `claude --agent <path>`.
 * The virtual agent's ID is reused so the character stays in place.
 */
export function launchVirtualAgentTerminal(
  virtualAgent: VirtualAgent,
  agents: Map<number, AgentState>,
  activeAgentIdRef: { current: number | null },
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  nextTerminalIndexRef: { current: number },
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
): void {
  if (!virtualAgent.agentFilePath) {
    console.warn(
      `[Pixel Agents] Virtual agent ${virtualAgent.id} (${virtualAgent.orgAgentKey}) has no agent file - cannot launch`,
    );
    return;
  }

  // Verify agent file exists
  if (!fs.existsSync(virtualAgent.agentFilePath)) {
    console.error(`[Pixel Agents] Agent file not found: ${virtualAgent.agentFilePath}`);
    vscode.window.showErrorMessage(`Agent file not found: ${virtualAgent.agentFilePath}`);
    return;
  }

  const idx = nextTerminalIndexRef.current++;
  const cwd =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(virtualAgent.agentFilePath);

  const terminal = vscode.window.createTerminal({
    name: `${TERMINAL_NAME_PREFIX} #${idx} (${virtualAgent.title})`,
    cwd,
  });
  terminal.show();

  const sessionId = crypto.randomUUID();
  const claudeCmd = `claude --agent ${virtualAgent.agentFilePath} --session-id ${sessionId}`;
  terminal.sendText(claudeCmd);

  const projectDir = getProjectDirPath(cwd);
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
  knownJsonlFiles.add(expectedFile);

  // Create the real AgentState using the same ID as the virtual agent
  const agent: AgentState = {
    id: virtualAgent.id,
    sessionId,
    terminalRef: terminal,
    isExternal: false,
    projectDir,
    jsonlFile: expectedFile,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
  };

  agents.set(virtualAgent.id, agent);
  activeAgentIdRef.current = virtualAgent.id;
  persistAgents();

  // Mark virtual agent as launched
  virtualAgent.isLaunched = true;
  virtualAgent.terminalAgentId = virtualAgent.id;

  console.log(
    `[Pixel Agents] Virtual agent ${virtualAgent.id} (${virtualAgent.title}): launched terminal with agent file ${virtualAgent.agentFilePath}`,
  );

  // Notify webview that this virtual agent is now active
  webview?.postMessage({ type: 'virtualAgentLaunched', id: virtualAgent.id });

  ensureProjectScan(
    projectDir,
    knownJsonlFiles,
    projectScanTimerRef,
    activeAgentIdRef,
    agents.size > 0 ? { current: Math.max(...Array.from(agents.keys())) + 1 } : { current: 1 },
    agents,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    webview,
    persistAgents,
  );

  // Poll for JSONL file
  const pollTimer = setInterval(() => {
    try {
      if (fs.existsSync(agent.jsonlFile)) {
        console.log(`[Pixel Agents] Virtual agent ${virtualAgent.id}: found JSONL file`);
        clearInterval(pollTimer);
        jsonlPollTimers.delete(virtualAgent.id);
        startFileWatching(
          virtualAgent.id,
          agent.jsonlFile,
          agents,
          fileWatchers,
          pollingTimers,
          waitingTimers,
          permissionTimers,
          webview,
        );
        readNewLines(virtualAgent.id, agents, waitingTimers, permissionTimers, webview);
      }
    } catch {
      /* file may not exist yet */
    }
  }, JSONL_POLL_INTERVAL_MS);
  jsonlPollTimers.set(virtualAgent.id, pollTimer);
}
