/**
 * Plays screens captured from the GetQhse demo template (see
 * scripts/capture-template-mocks.mjs): the template's own markup and CSS, with
 * its inline handlers replaced by local `data-mock` actions — step tabs,
 * filters, modals, inline edits and toasts. Nothing is loaded from or saved to
 * the API; reloading the page resets it.
 *
 * The markup is generated from a checked-in template capture, never from user
 * or API data, so rendering it as HTML is safe.
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import "./template-mock-reset.css";
import "./template-mocks.css";

export interface MockBundle {
  defaults: Record<string, string>;
  snapshots: { step: number; params: Record<string, string>; html: number }[];
  html: string[];
  modals: Record<string, string>;
}

/** The most specific capture of this step whose variant matches the current params. */
function pickScreen(bundle: MockBundle, step: number, params: Record<string, string>) {
  let best: MockBundle["snapshots"][number] | null = null;
  for (const snapshot of bundle.snapshots) {
    if (snapshot.step !== step) continue;
    const entries = Object.entries(snapshot.params);
    if (!entries.every(([key, value]) => (params[key] ?? "") === value)) continue;
    if (!best || entries.length > Object.keys(best.params).length) best = snapshot;
  }
  return best ? bundle.html[best.html] : undefined;
}

export function TemplateMockPage({ bundle }: { bundle: MockBundle }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [params, setParams] = useState<Record<string, string>>(bundle.defaults);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const html = pickScreen(bundle, step, params) ?? "";
  const modalHtml = modal ? bundle.modals[modal] : undefined;

  const showToast = (message: string) => setToast({ id: Date.now(), message });

  const play = (action: string, element: HTMLElement, event: MouseEvent) => {
    const separator = action.indexOf(":");
    const name = separator === -1 ? action : action.slice(0, separator);
    const value = separator === -1 ? "" : action.slice(separator + 1);
    switch (name) {
      case "step":
        setStep(Number(value));
        setParams((current) => ({ ...current, adjust: "" }));
        setModal(null);
        rootRef.current?.scrollIntoView({ block: "start" });
        return;
      case "back":
        void navigate(-1);
        return;
      case "variant": {
        const [key, next = ""] = value.split("=");
        if (key) setParams((current) => ({ ...current, [key]: next }));
        return;
      }
      case "modal":
        if (bundle.modals[value]) setModal(value);
        return;
      case "close":
        setModal(null);
        return;
      case "close-toast":
        setModal(null);
        showToast(value);
        return;
      case "backdrop":
        if (event.target === element) setModal(null);
        return;
      case "toast":
        showToast(value);
        return;
      case "toggle": {
        const at = value.lastIndexOf(":");
        rootRef.current
          ?.querySelector(`#${CSS.escape(value.slice(0, at))}`)
          ?.classList.toggle(value.slice(at + 1));
        return;
      }
      case "editfield": {
        const field = rootRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `#${CSS.escape(value)}`,
        );
        if (!field) return;
        if (field.readOnly) {
          field.readOnly = false;
          field.classList.add("editing");
          field.focus();
          element.textContent = "Enregistrer";
        } else {
          field.readOnly = true;
          field.classList.remove("editing");
          element.textContent = "Modifier";
          showToast("Précision enregistrée");
        }
        return;
      }
      case "edit": {
        const [container, target] = value.split("|");
        const text = container && target ? element.closest(container)?.querySelector(target) : null;
        if (text instanceof HTMLElement) {
          text.contentEditable = "true";
          text.focus();
        }
        return;
      }
      case "assign": {
        const text = element.closest("p")?.childNodes[2];
        if (!text) return;
        const next = window.prompt("Modifier les fonctions retenues :", text.textContent?.trim());
        if (next !== null) {
          text.textContent = ` ${next} `;
          showToast("Affectation mise à jour");
        }
        return;
      }
      case "self": {
        const [text = "", className = ""] = value.split("|");
        element.textContent = text;
        if (className) element.classList.add(className);
        return;
      }
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest<HTMLElement>("[data-mock]");
    if (!element || !event.currentTarget.contains(element)) return;
    event.preventDefault();
    for (const action of (element.dataset["mock"] ?? "").split(" && ")) {
      play(action, element, event);
    }
  };

  return (
    <div ref={rootRef} className="gq-mock" onClick={onClick}>
      <div className="app">
        <div className="app-shell">
          <div className="main">
            <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
      {modalHtml ? <div dangerouslySetInnerHTML={{ __html: modalHtml }} /> : null}
      {toast ? (
        <div key={toast.id} className="toast" role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
