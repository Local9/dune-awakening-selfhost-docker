import { Archive, Database, FileText, Gift, Home, Map as MapIcon, PackagePlus, RefreshCw, Server, Settings, Shield, Sparkles, Users } from "lucide-react";
import type { Tab } from "../types";

export const navGroups: { title: string; items: { tab: Tab; icon: React.ReactNode }[] }[] = [
  {
    title: "Server Operations",
    items: [
      { tab: "Home", icon: <Home size={18} /> },
      { tab: "Setup", icon: <Shield size={18} /> },
      { tab: "Server Control", icon: <Server size={18} /> },
      { tab: "Backups", icon: <Archive size={18} /> },
      { tab: "Database", icon: <Database size={18} /> },
      { tab: "Updates", icon: <RefreshCw size={18} /> },
      { tab: "Logs", icon: <FileText size={18} /> },
      { tab: "Settings", icon: <Settings size={18} /> }
    ]
  },
  {
    title: "Arrakis Management",
    items: [
      { tab: "Maps", icon: <MapIcon size={18} /> },
      { tab: "Players", icon: <Users size={18} /> },
      { tab: "Live Map", icon: <MapIcon size={18} /> },
      { tab: "Admin Tools", icon: <PackagePlus size={18} /> },
      { tab: "Care Package", icon: <Gift size={18} /> }
    ]
  },
  {
    title: "Community",
    items: [
      { tab: "Addons", icon: <Sparkles size={18} /> }
    ]
  }
];
