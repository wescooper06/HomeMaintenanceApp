export default function PageHeader({ id, title, subtitle, eyebrow, breadcrumbs, backAction, actions, className = "" }) {
  return (
    <header id={id} className={`lm-page-header ${className}`.trim()}>
      <div className="lm-page-heading">
        {(breadcrumbs || backAction) && (
          <div className="lm-page-context">
            {backAction}
            {breadcrumbs && <nav className="lm-page-breadcrumbs" aria-label="Breadcrumb">{breadcrumbs}</nav>}
          </div>
        )}
        {eyebrow && <p className="lm-page-eyebrow">{eyebrow}</p>}
        <h1 className="lm-page-title">{title}</h1>
        {subtitle && <p className="lm-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="lm-page-actions">{actions}</div>}
    </header>
  );
}
