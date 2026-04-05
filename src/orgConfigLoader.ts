import * as fs from 'fs';
import * as path from 'path';

import type { OrgAgent } from './orgTypes.js';

/** Shape of a single entry in the org hierarchy JSON */
interface HierarchyEntry {
  title: string;
  agent?: string;
  model: string;
  role?: string;
  reports_to?: string;
  direct_reports?: string[];
  team?: Record<string, { title: string; model: string }>;
  reuses_workers_from?: string;
  inherited_agents?: string[];
}

/** Top-level shape of the org config JSON file */
interface OrgConfigFile {
  company: string;
  description?: string;
  hierarchy: Record<string, HierarchyEntry>;
}

/**
 * Parse an org config JSON file into a flat list of OrgAgent entries.
 * Walks the hierarchy recursively: top-level entries become executives,
 * team members become workers under their parent's department.
 */
export function parseOrgConfig(configPath: string, agentBasePath: string): OrgAgent[] {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw) as OrgConfigFile;
  const { hierarchy } = config;
  const agents: OrgAgent[] = [];

  // Find the top-level agent (has direct_reports but no reports_to)
  const topKey = Object.keys(hierarchy).find(
    (k) => hierarchy[k].direct_reports && !hierarchy[k].reports_to,
  );

  for (const [key, entry] of Object.entries(hierarchy)) {
    const isTopLevel = key === topKey;
    const hasTeam = entry.team && Object.keys(entry.team).length > 0;
    const isExecutive = isTopLevel || hasTeam || !!entry.direct_reports;

    // Determine department name
    let department: string;
    if (isTopLevel) {
      department = config.company;
    } else if (entry.reports_to && hierarchy[entry.reports_to]) {
      department = hierarchy[entry.reports_to].title;
    } else {
      department = config.company;
    }

    // Resolve agent file path
    const agentFilePath = entry.agent ? path.resolve(agentBasePath, entry.agent) : null;

    agents.push({
      key,
      title: entry.title,
      role: entry.role ?? '',
      department,
      agentFilePath,
      model: entry.model,
      reportsTo: entry.reports_to ?? null,
      isExecutive,
    });

    // Flatten team members as workers
    if (entry.team) {
      for (const [workerKey, worker] of Object.entries(entry.team)) {
        agents.push({
          key: workerKey,
          title: worker.title,
          role: '',
          department: entry.title,
          agentFilePath: null,
          model: worker.model,
          reportsTo: key,
          isExecutive: false,
        });
      }
    }
  }

  return agents;
}

/**
 * Derive an org ID slug from the company name.
 * e.g. "KS Advisory Corp" -> "ks-advisory-corp"
 */
export function orgNameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Read org company name from a config file without full parsing.
 */
export function readOrgName(configPath: string): string | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as { company?: string };
    return config.company ?? null;
  } catch {
    return null;
  }
}
