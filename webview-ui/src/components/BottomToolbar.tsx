import { useEffect, useRef, useState } from 'react';

import type { OrgInfo, WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Dropdown, DropdownItem } from './ui/Dropdown.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenClaude: () => void;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  workspaceFolders: WorkspaceFolder[];
  availableOrgs: OrgInfo[];
  activeOrgId: string | null;
}

export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  workspaceFolders,
  availableOrgs,
  activeOrgId,
}: BottomToolbarProps) {
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isBypassMenuOpen, setIsBypassMenuOpen] = useState(false);
  const [isOrgPickerOpen, setIsOrgPickerOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const orgPickerRef = useRef<HTMLDivElement>(null);
  const pendingBypassRef = useRef(false);
  // Close folder picker / bypass menu / org picker on outside click
  useEffect(() => {
    if (!isFolderPickerOpen && !isBypassMenuOpen && !isOrgPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setIsBypassMenuOpen(false);
      }
      if (orgPickerRef.current && !orgPickerRef.current.contains(e.target as Node)) {
        setIsOrgPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen, isBypassMenuOpen, isOrgPickerOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    setIsBypassMenuOpen(false);
    pendingBypassRef.current = false;
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      onOpenClaude();
    }
  };

  const handleAgentHover = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(true);
    }
  };

  const handleAgentLeave = () => {
    if (!isFolderPickerOpen) {
      setIsBypassMenuOpen(false);
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    const bypassPermissions = pendingBypassRef.current;
    pendingBypassRef.current = false;
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path, bypassPermissions });
  };

  const handleBypassSelect = (bypassPermissions: boolean) => {
    setIsBypassMenuOpen(false);
    if (hasMultipleFolders) {
      pendingBypassRef.current = bypassPermissions;
      setIsFolderPickerOpen(true);
    } else {
      vscode.postMessage({ type: 'openClaude', bypassPermissions });
    }
  };

  const handleOrgSelect = (orgId: string) => {
    setIsOrgPickerOpen(false);
    // Toggle off if clicking the active org
    const newOrgId = orgId === activeOrgId ? null : orgId;
    vscode.postMessage({ type: 'switchOrg', orgId: newOrgId });
  };

  const handleAddOrg = () => {
    setIsOrgPickerOpen(false);
    vscode.postMessage({ type: 'addOrg' });
  };

  const activeOrg = availableOrgs.find((o) => o.id === activeOrgId);

  return (
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
      <div
        ref={folderPickerRef}
        className="relative"
        onMouseEnter={handleAgentHover}
        onMouseLeave={handleAgentLeave}
      >
        <Button
          variant="accent"
          onClick={handleAgentClick}
          className={
            isFolderPickerOpen || isBypassMenuOpen
              ? 'bg-accent-bright'
              : 'bg-accent hover:bg-accent-bright'
          }
        >
          + Agent
        </Button>
        <Dropdown isOpen={isBypassMenuOpen}>
          <DropdownItem onClick={() => handleBypassSelect(true)}>
            Skip permissions mode <span className="text-2xs text-warning">⚠</span>
          </DropdownItem>
        </Dropdown>
        <Dropdown isOpen={isFolderPickerOpen} className="min-w-128">
          {workspaceFolders.map((folder) => (
            <DropdownItem
              key={folder.path}
              onClick={() => handleFolderSelect(folder)}
              className="text-base"
            >
              {folder.name}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>
      <div ref={orgPickerRef} className="relative">
        <Button
          variant={activeOrgId ? 'active' : 'default'}
          onClick={() => setIsOrgPickerOpen((v) => !v)}
          title="Switch organization"
          className={isOrgPickerOpen ? 'bg-accent-bright' : undefined}
        >
          {activeOrg ? activeOrg.name : 'Org'}
        </Button>
        <Dropdown isOpen={isOrgPickerOpen} className="min-w-128">
          {availableOrgs.map((org) => (
            <DropdownItem
              key={org.id}
              onClick={() => handleOrgSelect(org.id)}
              className="text-base"
            >
              {org.id === activeOrgId ? '\u2713 ' : '  '}
              {org.name}
            </DropdownItem>
          ))}
          {availableOrgs.length > 0 && (
            <div style={{ borderTop: '1px solid var(--pixel-border)', margin: '2px 0' }} />
          )}
          <DropdownItem onClick={handleAddOrg} className="text-base">
            + Add Organization...
          </DropdownItem>
        </Dropdown>
      </div>
      <Button
        variant={isEditMode ? 'active' : 'default'}
        onClick={onToggleEditMode}
        title="Edit office layout"
      >
        Layout
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title="Settings"
      >
        Settings
      </Button>
    </div>
  );
}
