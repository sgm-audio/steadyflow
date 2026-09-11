export interface PrintifyCostHeadline {
  avgMarginPct: number | null;
  recoverableAnnual: number | null;
  breakEvenRoas: number | null;
}

const LEAK_TITLE_RE = /Revenue Leak List — ~\$([\d,]+)\/yr/;
const MARGIN_BODY_RE = /Average gross margin:\s*([\d.]+)%/;

export const parsePrintifyCostHeadline = (input: {
  findings: readonly { title: string; body: string }[];
  firstSalePlan?:
    { grossMarginPct?: number | undefined; breakEvenRoas?: number | undefined } | undefined;
}): PrintifyCostHeadline => {
  let recoverableAnnual: number | null = null;
  let avgMarginPct: number | null = null;

  for (const f of input.findings) {
    if (recoverableAnnual === null) {
      const leak = LEAK_TITLE_RE.exec(f.title);
      const n = leak?.[1]?.replace(/,/g, '');
      if (n) {
        const parsed = Number(n);
        if (Number.isFinite(parsed)) recoverableAnnual = parsed;
      }
    }
    if (avgMarginPct === null) {
      const margin = MARGIN_BODY_RE.exec(f.body);
      const n = margin?.[1];
      if (n) {
        const parsed = Number(n);
        if (Number.isFinite(parsed)) avgMarginPct = parsed;
      }
    }
  }

  const planMargin = input.firstSalePlan?.grossMarginPct;
  if (typeof planMargin === 'number' && Number.isFinite(planMargin)) {
    avgMarginPct = planMargin;
  }

  const planRoas = input.firstSalePlan?.breakEvenRoas;
  const breakEvenRoas = typeof planRoas === 'number' && Number.isFinite(planRoas) ? planRoas : null;

  return { avgMarginPct, recoverableAnnual, breakEvenRoas };
};

export const hasPrintifyCostHeadline = (h: PrintifyCostHeadline): boolean =>
  h.avgMarginPct !== null || h.recoverableAnnual !== null || h.breakEvenRoas !== null;
