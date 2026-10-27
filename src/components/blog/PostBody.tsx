import Link from "next/link";

import type { BlogBlock, Inline } from "~/lib/blog";

import { MeteringSample } from "./MeteringSample";

const TEXT_LINK =
  "text-ink hover:text-brand-text font-medium underline underline-offset-4";

const Text = ({ parts }: { parts: Inline[] }) => (
  <>
    {parts.map((part) => {
      if (typeof part === "string") return part;
      if ("strong" in part) {
        return (
          <strong key={part.strong} className="text-ink font-semibold">
            {part.strong}
          </strong>
        );
      }
      const external = part.href.startsWith("http");
      return external ? (
        <a key={part.href} href={part.href} className={TEXT_LINK}>
          {part.text}
        </a>
      ) : (
        <Link key={part.href} href={part.href} className={TEXT_LINK}>
          {part.text}
        </Link>
      );
    })}
  </>
);

/** Renders a post body from the structured blocks in ~/lib/blog. */
export const PostBody = ({ blocks }: { blocks: BlogBlock[] }) => (
  <div className="text-ink-soft text-[17px] leading-[1.75]">
    {blocks.map((block, i) => {
      const key = `${block.type}-${i}`;
      switch (block.type) {
        case "p":
          return (
            <p key={key} className="mt-5 text-pretty">
              <Text parts={block.text} />
            </p>
          );
        case "h2":
          return (
            <h2
              key={key}
              id={block.id}
              className="font-display text-ink mt-14 scroll-mt-24 text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]"
            >
              {block.text}
            </h2>
          );
        case "list":
          return (
            <ul key={key} className="mt-5 grid gap-3">
              {block.items.map((item, j) => (
                <li key={j} className="grid grid-cols-[18px_1fr] gap-3">
                  <span
                    aria-hidden="true"
                    className="bg-brand mt-[0.7em] size-1.5 justify-self-center rounded-full"
                  />
                  <span>
                    <Text parts={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        case "steps":
          return (
            <ol key={key} className="mt-6 grid gap-3">
              {block.items.map((step, j) => (
                <li
                  key={step.title}
                  className="border-line bg-card shadow-card grid grid-cols-[2rem_1fr] gap-4 rounded-2xl border p-5"
                >
                  <span
                    aria-hidden="true"
                    className="bg-brand-soft text-brand-text tnum inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold"
                  >
                    {j + 1}
                  </span>
                  <span>
                    <span className="text-ink block font-semibold">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-[15px] leading-relaxed">
                      <Text parts={step.body} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          );
        case "note":
          return (
            <aside
              key={key}
              className="border-waste bg-waste-soft mt-6 rounded-r-2xl border-l-4 px-5 py-4"
            >
              <p className="text-waste-deep text-sm font-semibold">
                {block.title}
              </p>
              <p className="text-ink mt-1 text-[15px] leading-relaxed">
                <Text parts={block.text} />
              </p>
            </aside>
          );
        case "meteringSample":
          return <MeteringSample key={key} className="my-8" />;
      }
    })}
  </div>
);
