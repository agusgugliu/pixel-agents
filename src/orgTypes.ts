/** Organization configuration registered in pixel-agents */
export interface OrgConfig {
  /** Slug derived from name, e.g. "ks-advisory" */
  id: string;
  /** Display name, e.g. "KS Advisory Corp" */
  name: string;
  /** Absolute path to the org JSON config file */
  configPath: string;
  /** Base directory for resolving relative agent .md paths */
  agentBasePath: string;
}

/** A single agent parsed from an org hierarchy JSON file */
export interface OrgAgent {
  /** Hierarchy key, e.g. "cto", "developer-backend" */
  key: string;
  /** Display title, e.g. "Chief Technology Officer" */
  title: string;
  /** Role description */
  role: string;
  /** Parent department name, e.g. "Technology" */
  department: string;
  /** Absolute path to the agent .md file, or null for workers without one */
  agentFilePath: string | null;
  /** Model allocation: "sonnet" | "haiku" */
  model: string;
  /** Key of the parent agent this reports to, or null for the top-level agent */
  reportsTo: string | null;
  /** Whether this agent has direct reports (is an executive/head) */
  isExecutive: boolean;
}

/** A virtual (org-loaded) agent tracked by the extension backend */
export interface VirtualAgent {
  /** Unique agent ID (shared ID space with real agents) */
  id: number;
  /** Which org this agent belongs to */
  orgId: string;
  /** Key from the org hierarchy */
  orgAgentKey: string;
  /** Display title */
  title: string;
  /** Role description */
  role: string;
  /** Department name */
  department: string;
  /** Absolute path to agent .md file, or null */
  agentFilePath: string | null;
  /** Model allocation */
  model: string;
  /** Whether a terminal has been launched for this agent */
  isLaunched: boolean;
  /** Links to the real AgentState.id after launch (same as id) */
  terminalAgentId: number | null;
}

/** Virtual agent info sent to the webview */
export interface VirtualAgentWebviewInfo {
  id: number;
  key: string;
  title: string;
  role: string;
  department: string;
  model: string;
  hasAgentFile: boolean;
}
