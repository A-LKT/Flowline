import {
  Globe, GitBranch, Code2, Network, Braces, Type, Tag,
  GitFork, RefreshCw, Shuffle,
  Clock, Variable, Terminal, OctagonX,
  ArrowRightLeft, Filter, ArrowUpDown, BarChart2, FileText, Calculator,
  FolderOpen, Download, Table,
  Webhook, Activity, Mail, MessageSquare, MessageCircle,
  Waypoints, Sparkles,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type IconComponent = ComponentType<LucideProps>;

export const NODE_TYPE_ICONS: Record<string, IconComponent> = {
  // Logic
  condition:       GitBranch,
  fork:            GitFork,
  loop:            RefreshCw,
  iterator:        RefreshCw,
  switch:          Shuffle,
  script:          Code2,
  // Control
  delay:           Clock,
  'set-variable':  Variable,
  log:             Terminal,
  failure:         OctagonX,
  // Data
  transform:       ArrowRightLeft,
  filter:          Filter,
  sort:            ArrowUpDown,
  aggregate:       BarChart2,
  'render-template': FileText,
  math:            Calculator,
  // File
  'read-file':     FolderOpen,
  'write-file':    Download,
  'parse-csv':     Table,
  'format-csv':    Table,
  // Integration
  http:            Globe,
  graphql:         Webhook,
  ping:            Activity,
  // Notification
  'send-email':    Mail,
  'send-slack':    MessageSquare,
  'send-teams':    MessageCircle,
  'send-whatsapp': MessageSquare,
  // AI
  'ai-completion':    Sparkles,
  'ollama-completion': Sparkles,
  // Decoration
  label:           Type,
  junction:        Waypoints,
};

export const CATEGORY_ICONS: Record<string, IconComponent> = {
  Logic:        Braces,
  Control:      Clock,
  Data:         BarChart2,
  File:         FolderOpen,
  Integration:  Network,
  Notification: Mail,
  AI:           Sparkles,
  Decoration:   Tag,
};

export const getNodeIcon     = (type: string):     IconComponent => NODE_TYPE_ICONS[type]     ?? Code2;
export const getCategoryIcon = (category: string): IconComponent => CATEGORY_ICONS[category]  ?? Tag;
