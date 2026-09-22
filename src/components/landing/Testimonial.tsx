import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "~/components/landing/Reveal";

/* Customer quote, published with the author's permission. The author also
 * supplied a French original; the site is English, so only the English
 * version is shown here. */
const QUOTE = {
  text: "LicenseMeter has been a huge help in managing our software licenses. Being able to enter our actual pricing gives us a clear, accurate view of our costs. The result: several thousand dollars saved in just a few clicks.",
  name: "Léo Béchetoille",
  photo: "/testimonials/leo-bechetoille.jpg",
  title: "Head of Technology Transformation",
  company: "Pulsar Opérations",
  companyUrl: "https://pulsaroperations.ca/",
  companyAbout: "Operator of the REM, Montreal's automated light rail network",
  linkedinUrl: "https://www.linkedin.com/in/leo-bechetoille/",
};

export const Testimonial = () => (
  <section
    className="border-line border-t px-6 py-16 lg:py-20"
    aria-label="What customers say"
  >
    <Reveal className="mx-auto max-w-3xl text-center">
      <p className="text-brand-text text-xs font-medium tracking-[0.12em] uppercase">
        From the field
      </p>
      <figure className="mt-8">
        <blockquote className="font-display text-2xl leading-snug font-medium tracking-[-0.03em] text-balance sm:text-3xl">
          <p>&ldquo;{QUOTE.text}&rdquo;</p>
        </blockquote>
        <figcaption className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:text-left">
          <Image
            src={QUOTE.photo}
            alt=""
            width={56}
            height={56}
            className="bg-subtle size-14 shrink-0 rounded-full object-cover"
          />
          <span className="text-sm leading-6">
            <a
              href={QUOTE.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink inline-flex items-center gap-1 font-semibold hover:underline hover:underline-offset-4"
            >
              {QUOTE.name}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(LinkedIn profile)</span>
            </a>
            <span className="text-ink-soft block">
              {QUOTE.title},{" "}
              <a
                href={QUOTE.companyUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-ink whitespace-nowrap underline underline-offset-4"
              >
                {QUOTE.company}
              </a>
            </span>
            <span className="text-ink-faint block">{QUOTE.companyAbout}</span>
          </span>
        </figcaption>
      </figure>
    </Reveal>
  </section>
);
