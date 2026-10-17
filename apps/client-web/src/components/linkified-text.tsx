import { Fragment, type ReactNode } from "react";

/** Keep source and evidence URLs absolute, including links pasted with only www. */
export function externalHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(href) || /\s/.test(href)) return null;
  try {
    const url = new URL(href);
    return url.hostname ? href : null;
  } catch {
    return null;
  }
}

export function ExternalLink({
  href,
  children,
  className = "break-words text-violet-700 underline underline-offset-2 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2",
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  const url = externalHref(href);
  if (!url) return <span>{children}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

/** URLs in prose exclude sentence punctuation, but retain balanced URL parentheses. */
function trimUrl(token: string): string {
  let url = token;
  let previous: string;
  do {
    previous = url;
    url = url.replace(/[.,;:!?،؛。…]+$/u, "");
    for (const [opening, closing] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const) {
      while (url.endsWith(closing) && url.split(closing).length > url.split(opening).length) {
        url = url.slice(0, -1).replace(/[.,;:!?،؛。…]+$/u, "");
      }
    }
  } while (url !== previous);
  return url;
}

/** Render pasted URLs and Markdown source links without interpreting arbitrary HTML. */
export function LinkifiedText({
  children,
  linkClassName,
}: {
  children: string | null | undefined;
  linkClassName?: string;
}) {
  const text = children ?? "";
  const links =
    /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.)(?:[^\s<>()]|\([^\s<>()]*\))+)\)|\b(?:https?:\/\/|www\.)[^\s<>"'`«»]+/giu;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(links)) {
    const start = match.index;
    parts.push(text.slice(offset, start));
    const token = match[0];
    const url = match[2] ?? trimUrl(token);
    parts.push(
      <Fragment key={start}>
        <ExternalLink href={url} className={linkClassName}>
          {match[1] ?? url}
        </ExternalLink>
        {!match[2] && token.slice(url.length)}
      </Fragment>,
    );
    offset = start + token.length;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
