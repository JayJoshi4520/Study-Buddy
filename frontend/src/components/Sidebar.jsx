import {
  Folder,
  PanelLeftClose,
  PanelRightOpen,
  PanelLeftOpen,
} from "lucide-react";
import ChatSessionManager from "./ChatSessionManager";

export default function Sidebar({
  onSessionSelect,
  currentSessionId,
  onNewSession,
  onNavigateDocuments,
  collapsed = false,
  onToggleCollapse,
}) {
  return (
    <div
      className={`fixed top-0 left-0 h-full bg-card border-r transition-all duration-300 z-[100] flex flex-col ${
        collapsed ? "w-14" : "w-72"
      }`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* 1. Top Section: Logo only */}
      <div className="flex items-center justify-center h-14 border-b shrink-0">
        <div className="h-8 w-8 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
          SB
        </div>

        {/* Toggle button: Only shows here when OPEN */}
        {!collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="ml-auto mr-2 rounded p-2 hover:bg-muted transition-colors text-muted-foreground"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 2. Middle Section: Sessions List (Hidden when collapsed) */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          <ChatSessionManager
            onSessionSelect={onSessionSelect}
            onNewSession={onNewSession}
            currentSessionId={currentSessionId}
            onManageDocuments={onNavigateDocuments}
            showHeader={true}
          />
        </div>
      )}

      {/* 3. Bottom Section: Actions + Toggle when collapsed */}
      <div className="border-t p-2 flex flex-col items-center space-y-2 shrink-0 bg-card">
        {/* Documents Action */}
        <button
          className="w-full inline-flex items-center justify-center lg:justify-start space-x-2 rounded-md hover:bg-muted px-3 py-2 text-sm transition-colors text-muted-foreground"
          onClick={onNavigateDocuments}
          title="Documents"
        >
          <Folder className="h-5 w-5" />
          {!collapsed && <span>Documents</span>}
        </button>

        {/* Toggle button: Only shows here when COLLAPSED */}
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-full flex justify-center items-center rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground border-t border-border/50 pt-3 mt-1"
            title="Open sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
