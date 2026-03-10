export const INSTAGRAM_DS_STYLE_ID = 'lc-instagram-ds-style-v1'

export const INSTAGRAM_DS_CSS = `
.ig-preview-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
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
  max-width: 84px;
  min-width: 36px;
  object-fit: contain;
  opacity: 0.98;
}

.ig-logo-feed {
  width: 18%;
  max-width: 62px;
  min-width: 30px;
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
  color: var(--ig-primary-color, #f97316);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(0.52rem, 1.05vw, 0.7rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.95;
  margin-bottom: 0.35rem;
  line-height: 1.15;
}

.ig-typography-title {
  color: var(--ig-text-color, #ffffff);
  font-family: var(--ig-font-heading, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(1.05rem, 3.2vw, 1.75rem);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.02em;
  margin-bottom: 0.45rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-line;
}

.ig-typography-desc {
  color: rgba(255, 255, 255, 0.96);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(0.56rem, 1.35vw, 0.82rem);
  font-weight: 500;
  line-height: 1.28;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-line;
}

.ig-typography-cta {
  color: var(--ig-primary-color, #f97316);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(0.54rem, 1.15vw, 0.72rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.55rem;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.ig-typography-tag {
  background: rgba(0, 0, 0, 0.56);
  border-radius: 4px;
  padding: 0.24rem 0.54rem;
  color: #ffffff;
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(0.52rem, 1.1vw, 0.7rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-flex;
  width: fit-content;
}

.ig-typography-footer {
  color: rgba(255, 255, 255, 0.82);
  font-family: var(--ig-font-body, "Montserrat"), "Inter", sans-serif;
  font-size: clamp(0.5rem, 1.02vw, 0.66rem);
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
