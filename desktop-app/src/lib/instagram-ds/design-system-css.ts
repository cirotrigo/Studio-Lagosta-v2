export const INSTAGRAM_DS_STYLE_ID = 'lc-instagram-ds-style-v1'

export const INSTAGRAM_DS_CSS = `
.ig-preview-container {
  position: relative;
  --ig-scale: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  background: var(--ig-bg-color, #09090b);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  color: var(--ig-text-color, #ffffff);
}

.ig-bg-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}

.ig-bg-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(circle at 12% 12%, rgba(249, 115, 22, 0.35), transparent 45%),
    linear-gradient(155deg, #111827 0%, #09090b 45%, #1f2937 100%);
}

.ig-overlay-top,
.ig-overlay-bottom,
.ig-overlay-left,
.ig-overlay-right {
  position: absolute;
  z-index: 10;
  pointer-events: none;
}

.ig-overlay-top {
  top: 0;
  left: 0;
  width: 100%;
  height: 45%;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.75) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

.ig-overlay-bottom {
  bottom: 0;
  left: 0;
  width: 100%;
  height: 45%;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.75) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

.ig-overlay-left {
  left: 0;
  top: 0;
  width: 45%;
  height: 100%;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.75) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

.ig-overlay-right {
  right: 0;
  top: 0;
  width: 45%;
  height: 100%;
  background: linear-gradient(
    to left,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.75) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

.ig-safe-zone {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.ig-safe-zone-story {
  padding: 15% 8% 18% 8%;
}

.ig-safe-zone-feed {
  padding: 5%;
}

.ig-safe-content {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 30;
  pointer-events: auto;
}

.ig-logo {
  width: 22%;
  max-width: calc(75px * var(--ig-scale));
  min-width: calc(36px * var(--ig-scale));
  object-fit: contain;
  opacity: 0.98;
}

.ig-logo-feed {
  width: 18%;
  max-width: calc(55px * var(--ig-scale));
  min-width: calc(30px * var(--ig-scale));
  object-fit: contain;
  opacity: 0.98;
}

.ig-typography-pre,
.ig-typography-title,
.ig-typography-desc,
.ig-typography-cta,
.ig-typography-tag,
.ig-typography-footer {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ig-typography-pre {
  color: #ffffff;
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.9;
  margin-bottom: 0.25rem;
  line-height: 1.2;
}

.ig-typography-title {
  color: var(--ig-text-color, #ffffff);
  font-family: var(--ig-font-heading, "Montserrat"), "Inter", sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 0.85;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-line;
}

.ig-typography-desc {
  color: rgba(255, 255, 255, 0.9);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-line;
}

.ig-typography-cta {
  color: #ffffff;
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: auto;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.ig-typography-tag {
  background: rgba(0, 0, 0, 0.56);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  color: #ffffff;
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: 0.65rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-flex;
  width: fit-content;
}

.ig-typography-footer {
  color: rgba(255, 255, 255, 0.82);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: 0.66rem;
  line-height: 1.28;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: pre-line;
}

.ig-editable {
  outline: none;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: border-color 0.12s ease, background-color 0.12s ease;
  cursor: text;
}

.ig-editable:hover {
  border-color: rgba(249, 115, 22, 0.5);
  background: rgba(249, 115, 22, 0.08);
}

.ig-editable:focus {
  border-color: rgba(249, 115, 22, 0.95);
  background: rgba(249, 115, 22, 0.12);
  box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.4);
}

.ig-template-frame {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}
`
