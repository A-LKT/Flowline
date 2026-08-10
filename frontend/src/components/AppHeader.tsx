import type { ReactNode } from 'react';
import { PipelineIcon } from './PipelineIcon';
import { SettingsButton } from './SettingsButton';
import { APP_VERSION } from '../version';
import { navigate, formatRoute } from '../state/route';

// The app-name link that appears at the left of every toolbar. It's a real
// anchor so a middle-click / ⌘-click / Ctrl-click opens the app in a new tab,
// but a plain left-click is intercepted and routed through navigate() so the
// hash router (and its unsaved-changes blocker) still runs.
const HOME_HREF = formatRoute({ space: 'home' }); // '#/'

export function AppNameLink() {
  return (
    <a
      className="toolbar-title toolbar-title--link"
      href={HOME_HREF}
      onClick={(e) => {
        // Let the browser handle modified clicks (new tab / new window).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate({ space: 'home' });
      }}
    >
      <PipelineIcon size={18} /> Flowline
    </a>
  );
}

type AppHeaderProps = {
  /** Home handler. Omit to hide the Home button (e.g. the locked-feature screen). */
  onHome?: () => void;
  /** Label for the Home button. */
  homeLabel?: string;
  /** Small icon rendered just before the space title. */
  icon?: ReactNode;
  /** The space title (e.g. "Jobs", "Triggers"). Omit for a bare header. */
  title?: ReactNode;
  /** Badge(s) rendered immediately after the title (e.g. a "Premium" chip). */
  badge?: ReactNode;
  /** Extra inline content after the title/badge (e.g. a live-run counter). */
  titleExtra?: ReactNode;
  /** Right-aligned actions rendered before the settings button. */
  children?: ReactNode;
};

// One reusable app toolbar: app-name link + version badge, an optional Home
// button, an optional space title, optional right-aligned actions, and the
// settings button. Views with a bespoke toolbar (the workflow editor) use
// <AppNameLink /> directly instead.
export function AppHeader({ onHome, homeLabel = '← Home', icon, title, badge, titleExtra, children }: AppHeaderProps) {
  return (
    <div className="toolbar">
      <AppNameLink />
      <span className="header-badge">v{APP_VERSION}</span>
      {onHome && (
        <>
          <div className="toolbar-divider" />
          <button className="btn-secondary btn-sm" onClick={onHome}>{homeLabel}</button>
        </>
      )}
      {title !== undefined && (
        <>
          <div className="toolbar-divider" />
          {icon}
          <span className="toolbar-workflow-name">{title}</span>
          {badge}
          {titleExtra}
        </>
      )}
      <div className="toolbar-spacer" />
      {children}
      <SettingsButton />
    </div>
  );
}
