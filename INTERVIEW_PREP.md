# Interview prep: how to defend this project

This is your study guide for the Valuation Toolkit. Read it with the site open. Every answer here matches what the
tool actually does, so if an interviewer clicks through while you talk, the page will back you up.

**Live site:** https://tampa-valuation-tool.vercel.app

**Before any interview:** open the Jabil pages and write down today's numbers. Prices move daily, so the figures
quoted in this guide (from November 10, 2026) will be slightly out of date. The logic will not be.

---

## 1. The 60-second walkthrough

Say this while you click:

1. "This takes any US public company ticker and builds an investment-banking style valuation package directly from
   SEC filings." (Type `JBL`, click **Value it**.)
2. "**Snapshot**: five years of financials plus LTM, and the bridge from equity value to enterprise value, step by
   step. Every number links back to its filing."
3. "**Trading comps**: a peer set I can edit, the standard multiples, quartiles, and what the shares would be worth
   at peer multiples."
4. "**DCF**: unlevered free cash flow, WACC built from CAPM with every input sourced, terminal value two ways, and
   sensitivity tables. Every default is derived from the company's own history, and the page shows how."
5. "**Football field**: all the methods on one chart against the current price."
6. "**Merger model**: pick an acquirer and a target and it shows accretion or dilution and the synergies needed to
   break even."
7. "At the bottom of the snapshot there is a **data quality panel** that ties out the filing data, the same checks
   an analyst runs before trusting a spread."

If you only get 20 seconds: "It is a banker's valuation package for any US public company, built on SEC filings,
where every number is sourced and every assumption is shown."

---

## 2. "How did you build this?"

Say it plainly. Do not undersell it and do not oversell it.

> "I built it with an AI coding agent. I'm a finance student, not a software engineer, so I used the tool that let
> me build what I had in mind. My part was the finance: I specified the product, chose the methods, decided how to
> handle the judgment calls, and checked the output. For example, I chose to exclude operating leases from debt,
> to use unadjusted EBITDA so the number is reproducible, and to show 'not available' rather than estimate anything
> that isn't in a filing. Then I verified it: I had every Jabil figure compared against the numbers printed in
> Jabil's actual 10-K, and the Excel export recalculated independently to confirm the formulas. There are 200
> automated tests, each valuation model has a worked example checked by hand, and I can walk you through any number
> on the page."

Follow-ups you should expect:

- **"So did you write the code?"** "No. The agent wrote the code under my direction. What I own is the design, the
  methodology and the verification. I can explain every formula and every assumption, which is the part that matters
  for this job."
- **"How do you know it's right?"** "Three ways. Automated tests with hand-worked examples for each model. A
  line-by-line comparison of Jabil against its 10-K, which matched on all 89 figures that come from that filing.
  And the downloaded Excel file was recalculated in a separate spreadsheet program and gave the same answers as the
  site."
- **"What did you learn?"** Pick one honestly. A good one: "How messy real filing data is. Companies label the same
  line differently, some don't report operating income at all, and the same word 'debt' appears in a dozen different
  tags. Deciding how to handle that without inventing numbers was most of the work."

One thing to do before you say any of this: **actually do the verification yourself once.** Open Jabil's 10-K from
the link on the snapshot page, find revenue, operating income and total debt, and confirm they match the site. It
takes ten minutes and makes the statement "I verified the outputs" true in the first person.

---

## 3. Design choices: what, why, and the alternative

### Data

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| Financial statements from SEC EDGAR (XBRL data) | Official, free, and the primary source. Nothing sits between the filing and the number. | Bloomberg / Capital IQ / FactSet: cleaner and adjusted, but paid, and you cannot see how they adjusted. |
| Market data from Finnhub with an API key | A licensed provider with an official key and published limits, rather than scraping a website that forbids it. | Yahoo Finance scraping: free and richer, but unlicensed and it breaks without warning. |
| "Not available" instead of estimating | A wrong number that looks right is worse than a blank. An interviewer can trust what is shown. | Fill gaps with estimates: looks more complete, but you could not defend the figures. |
| Most recently filed figure wins when a year was restated | It is what the company currently says about that year, and it keeps comparisons consistent. | Use the originally reported figure: shows what investors saw at the time, but mixes old and new accounting. |
| Columns labelled by fiscal year-end month ("FY Aug-2026") | Companies number fiscal years inconsistently. A date cannot be misread. | "FY2026": shorter, but Walmart and Home Depot would label the same period differently. |
| Results cached (SEC 6 hours, prices 15 minutes, peer prices 1 hour) | Filings change about every 90 days. Caching keeps the site fast and inside the free-tier limits. | No cache: always fresh, but slow, and the free market-data limit would be hit almost immediately. |

### Financial statements and EBITDA

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| LTM = latest fiscal year + current year-to-date − prior-year year-to-date | The standard formula. It brings companies with different year-ends onto the same footing. | Sum the last four quarters: same answer, but fourth quarters are not reported separately, so it needs more assumptions. |
| EBITDA = operating income + D&A, **unadjusted** | Fully reproducible from the filing, with no judgment. | Adjusted EBITDA (add back restructuring, impairments, stock compensation): closer to what banks use, but adjustments are judgment calls and are not available as structured data. Expect the tool's EBITDA to be lower and its EV/EBITDA higher than broker research. |
| If no operating income line is reported, EBIT = pre-tax income + interest expense | The textbook definition. It widens coverage to companies such as Ball and Silgan. | Show "not available": purer, but leaves many peers without an EV/EBITDA. The derived figure includes non-operating items, and the page flags it. |
| Gross profit is shown only if the company reports it | "Cost of revenue" means different things across industries. Deriving it gave a 71% gross margin for a restaurant, which is wrong. | Derive it as revenue − cost of revenue: more coverage, misleading numbers. |

### Equity value to enterprise value

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| Shares from the cover of the latest 10-K / 10-Q | An official count on a stated recent date. | Weighted-average diluted shares: includes dilution but is an average over the period, not today's count. |
| **Basic** share count, no option dilution | Option tables are not available as structured data. | Treasury stock method: correct in principle and what banks do. Leaving it out slightly understates market cap. Say this before you are asked. |
| Debt = the debt lines on the face of the balance sheet | Lines on the face never overlap, so nothing is double-counted, and each line is shown with the company's own label. | Add up standard debt tags: simpler, but the same debt appears under several overlapping tags and can be counted twice. |
| Operating leases **excluded** from debt | Under US accounting rules rent is an operating expense, so EBITDA is already after rent. Adding the lease liability to EV would count it twice. | Include leases and use EBITDAR: more comparable across companies that own versus rent, and required under international rules where lease cost sits below EBITDA. |
| Debt at book value | The usual practical approximation. Market values of bonds are not freely available. | Market value of debt: more correct, especially for distressed companies or when rates have moved a lot. |
| Cash = cash + short-term investments | The textbook definition of what is available to pay down debt. | Also deduct long-term investments (as analysts do for Apple or Alphabet): arguably right for cash-rich tech, but a judgment call. |
| Pension deficits and other debt-like items left out | They need footnote data and judgment. | Include them: more complete, and worth mentioning as a refinement. |

### Trading comps

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| Peers suggested by Finnhub's industry classification, then editable | Gives a starting point for any ticker. | A hand-picked list: far better quality, but only works for companies you have studied. The suggestions are often poor, and you must say so. |
| Median as the central figure | One outlier can distort the average of eight companies. | Mean: uses all the information, but is sensitive to outliers. |
| 25th to 75th percentile for the range | The standard "interquartile" range, which ignores extremes. | Min to max: shows the full spread, but one odd peer sets the range. |
| Multiples above 100x treated as "not meaningful" | They only arise when earnings are close to zero and say nothing about value. | Show them: technically accurate, but they wreck the statistics. |
| Forward P/E taken as published by Finnhub | It is the only forward measure available from a free, licensed source. | Build forward multiples from consensus estimates: standard at a bank, but estimates cost money. Forward EV/EBITDA is therefore not shown at all. |
| Percentiles by Excel's inclusive method | Matches what a banker gets with QUARTILE in a spreadsheet. | Exclusive method: gives slightly different quartiles for small samples. |

### DCF

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| Unlevered DCF (free cash flow to the firm, discounted at WACC) | Values the business independently of how it is financed. The standard banking approach. | Levered DCF (cash flow to equity at the cost of equity): gives equity value directly but needs a debt schedule. |
| Five-year projection | Standard. Long enough to reach a steady state, short enough to be credible. | Ten years: better for high-growth companies, but the later years are guesswork. |
| Year 1 = the twelve months after the latest reported quarter | The cash flows, the net debt and the valuation date all line up. | Project fiscal years and use a stub period: what banks do, and slightly more precise, but harder to explain. |
| End-of-year discounting | Simplest to explain and check. | Mid-year convention: more realistic because cash arrives through the year, and gives a value a few percent higher. |
| Revenue growth: 3-year CAGR, limited to −5% to +15%, fading in a straight line to the terminal rate | Anchored in what the company has actually done, and converges to a sustainable rate. | Analyst consensus: forward-looking, but not freely available. |
| Margins, D&A, capex, working capital: average of the last three fiscal years | Smooths one-off years. | Latest year or LTM: more current, but can be distorted, as with Mosaic. |
| Net working capital = current assets ex-cash − current liabilities ex-debt | The textbook operating definition. | Receivables + inventory − payables only: cleaner, but tags vary too much across companies. |
| Tax rate: 3-year effective rate, or 21% statutory if that is outside 10% to 35% | Effective rate reflects what the company pays; the fallback avoids distorted years. | Marginal rate (about 25% with state taxes): theoretically right for incremental cash flows. |
| Stock-based compensation **not** added back | It is a real cost paid in shares. Adding it back overstates cash flow unless you also model the dilution. | Add it back as non-cash: common, but flatters value. |
| Terminal growth 2.5% | Roughly long-run inflation plus modest real growth. Labelled a judgment. | 2% to 3% are all defensible. It must stay below WACC and below long-run GDP growth. |
| Exit multiple defaults to the company's own current EV/EBITDA | Assumes it is valued in five years as it is today. One click switches to the peer median. | Peer median: the more common choice, but depends on peer quality. |
| Both terminal value methods, each restated in the other's terms | If the exit multiple implies 5% growth forever, the multiple is too high. The cross-check catches that. | One method only: simpler, but hides the inconsistency. |

### WACC

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| Risk-free rate = 10-year Treasury yield (from the Treasury's own daily file) | The standard banking convention; liquid and widely quoted. | 20-year (matches Kroll's premium and long-lived cash flows) or 30-year: longer, slightly higher. |
| Beta as published by Finnhub | Price history to compute it is not available on the free tier. | Compute a 2- or 5-year regression beta, or use an unlevered peer average relevered to the target's capital structure: more robust, and what a bank would do. |
| Equity risk premium 5.0% (Kroll's recommendation) | A widely used published figure. Labelled a judgment. | Damodaran's implied premium (about 4.2% at the start of 2026) or a long-run historical average, which is higher. |
| No size premium | Keeps CAPM textbook-simple. | Add a size premium for small caps: common in practice, debated in theory. |
| Cost of debt = interest expense ÷ debt, floored at the risk-free rate | Uses the company's own data. The floor reflects that it cannot borrow today below the government. | Yield to maturity on its bonds, or a rating-based spread: more correct, because WACC should use today's borrowing cost, not old coupons. |
| Weights: market value of equity, book value of debt | Standard practice. | Target capital structure from peers: better if the company is unusually geared. |

### Football field and merger model

| Choice | Why | Main alternative and its trade-off |
| --- | --- | --- |
| DCF bars span WACC ± 0.5% with growth ± 0.25% or multiple ± 1.0x | A reasonable range around the base case, taken straight from the sensitivity table. | The whole table: wider and less informative. |
| Precedent transactions entered by hand | No free, reliable deal-multiple database exists, and inventing multiples would break the "no made-up numbers" rule. | A paid database (FactSet, Capital IQ, Dealogic): standard at a bank. |
| Merger model on LTM net income, held flat by default | Consensus forecasts are not freely available. Growth is an input. | Use consensus EPS for the next two years: the banking standard. |
| EPS = net income ÷ shares outstanding, same basis before and after | Consistency is what matters for accretion. | Diluted weighted-average shares: matches reported EPS, but mixes an average with a point-in-time count. |
| Target's debt stays in place | Simplest. Its interest is already in the target's net income. | Refinance it at the acquirer's rate: more realistic for many deals. |
| Fees paid in cash and left out of ongoing EPS | They are one-time costs. | Include them in year 1: shows the reported hit, but distorts the run-rate. |
| No purchase price allocation; write-up D&A is an optional input | A proper allocation needs a valuation of the target's assets. | Assume a share of the premium goes to intangibles and amortize it: more complete, more assumptions. |

### Engineering choices (if asked)

- **A small backend** keeps the API key secret. A browser-only site would expose it.
- **Vercel's free tier** rebuilds the site whenever the code changes. It costs nothing.
- **The valuation math is separated from the data and the screens**, so each formula can be tested on its own.

---

## 4. Thirty technical questions, answered with this tool

Jabil figures below are from November 10, 2026. Refresh them before an interview.

### Enterprise value and multiples

**1. What is the difference between equity value and enterprise value?**
Equity value is what the shareholders' stake is worth: share price times shares. Enterprise value is what the whole
operating business is worth to everyone who funds it. You get from one to the other by adding the claims that rank
ahead of shareholders (debt, preferred stock, noncontrolling interests) and subtracting cash. For Jabil: about
$25.7bn of equity value, plus $3.4bn of debt and $4m of minority interest, less $1.7bn of cash, gives about $27.3bn.

**2. Why do you subtract cash?**
Cash is not part of the operating business, and a buyer effectively gets it back. Equivalently, enterprise value
uses net debt. The tool subtracts cash and short-term investments only.

**3. Why add noncontrolling interests?**
Jabil consolidates 100% of the revenue and EBITDA of subsidiaries it does not fully own. To keep the numerator and
denominator consistent, the value of the part it does not own is added to enterprise value.

**4. Why does EV/EBITDA use enterprise value but P/E use equity value?**
Match the numerator to who the earnings belong to. EBITDA is earned before interest, so it belongs to lenders and
shareholders together: use enterprise value. Net income is after interest, so it belongs to shareholders only: use
equity value.

**5. Can enterprise value be lower than equity value? Can it be negative?**
Yes to the first, whenever cash exceeds debt. Microsoft on the site is an example. Negative EV is rare but possible
when cash exceeds market cap plus debt.

**6. Do you include operating leases in debt?**
No, and the reason is consistency. Under US accounting, rent is an operating expense, so EBITDA is already after
rent. If I added the lease liability to enterprise value I would count the same obligation twice. For Jabil that
excludes about $641m. If I added leases I would have to use EBITDAR instead.

**7. Why is your EBITDA different from the company's or Bloomberg's?**
Mine is unadjusted: operating income plus D&A, straight from the filing. Companies and data providers usually
report an adjusted figure that adds back items such as restructuring charges and stock compensation, so theirs is
higher. I chose reproducibility over adjustments, because adjustments are judgment calls and are not available as
structured data. (Check Jabil's latest earnings release for its own adjusted measure before an interview, so you can
quote the gap.)

**8. When is a multiple not meaningful?**
When the denominator is zero or negative, or so small that the multiple is absurd. The tool shows "n/m" for negative
earnings and for anything above 100x.

### Trading comps

**9. How do you pick comparable companies?**
Same industry, similar business model, size, growth, margins and geography. The tool starts with Finnhub's industry
peers, which are a starting point and often poor. For Jabil the list includes Netlist and IPG Photonics, which are
not electronics manufacturers, so I would remove them and keep Flex, Sanmina, Plexus and Benchmark.

**10. Why the median rather than the mean?**
One outlier distorts an average of eight companies. The median ignores it.

**11. How do you get an implied share price from comps?**
Take the peer multiple and apply it to the target's own figure. For EV/EBITDA: multiple times the target's EBITDA
gives enterprise value, subtract net debt and other claims to reach equity value, and divide by shares. For P/E:
multiple times the target's EPS.

**12. LTM or forward multiples?**
Forward is usually preferred because the market prices the future, but it needs estimates. The tool has LTM for
everything and forward P/E only, because consensus estimates are not free. I say that on the page.

**13. A company trades at a discount to its peers. Is it cheap?**
Not necessarily. It may deserve it: lower growth, lower margins, more debt, or worse returns. Comps tell you where
it trades relative to the group, not why.

### DCF

**14. Walk me through a DCF.**
Project unlevered free cash flow for five years. Estimate a terminal value for everything after year five. Discount
both to today at WACC to get enterprise value. Subtract debt and other claims, add cash, to get equity value. Divide
by shares.

**15. How do you get unlevered free cash flow?**
EBIT times one minus the tax rate, plus D&A, minus capital expenditures, minus the increase in net working capital.
In the tool, EBIT is EBITDA minus D&A, and each line is a percentage of revenue based on the last three years.

**16. Why "unlevered"? Why tax EBIT rather than pre-tax income?**
Because the cash flow is before financing. The benefit of the interest tax shield is captured in WACC, through the
after-tax cost of debt. Taxing pre-tax income as well would count the shield twice.

**17. Why add back D&A and subtract capex?**
D&A is an accounting charge with no cash going out. Capex is cash going out that the income statement spreads over
years. Swapping one for the other converts profit to cash.

**18. Why does an increase in working capital reduce cash flow?**
Growing receivables and inventory ties up cash before customers pay. Jabil's working capital is negative, about
−4% of revenue, because suppliers fund it, so growth actually releases cash in the model.

**19. Walk me through WACC.**
Cost of equity times the equity weight, plus after-tax cost of debt times the debt weight. For Jabil: cost of
equity is 4.88% + 1.30 × 5.0% = 11.4%. Pre-tax cost of debt is about 5.4%, or 4.1% after tax at 23.8%. Weights are
88% equity and 12% debt. WACC is about 10.55%.

**20. Where does each WACC input come from?**
Risk-free rate: 10-year Treasury yield from the Treasury's daily file. Beta: Finnhub. Equity risk premium: 5.0%,
Kroll's recommendation. Cost of debt: Jabil's interest expense over its debt. Weights: market cap and book debt.

**21. What is beta and what would you do differently?**
Beta measures how much the stock moves with the market. I use a published figure because price history is not on
the free tier. At a bank I would unlever the betas of the peer group, take the median, and relever at the target's
capital structure, which is more robust than one company's regression.

**22. Perpetuity growth or exit multiple: which do you prefer?**
I show both and cross-check them. The growth method is theoretically cleaner but very sensitive to the growth rate.
The multiple method is what the market actually uses but smuggles a market view into an intrinsic valuation. For
Jabil the growth method gives about $167 and the multiple method about $238. The tool tells me today's 11.4x
multiple implies 5.3% growth forever, which is too high, so I trust the lower number more.

**23. What terminal growth rate, and why?**
2.5%, about long-run inflation plus modest real growth. It must be below WACC, or the formula breaks, and below the
growth of the economy, or the company eventually becomes the economy.

**24. Terminal value is 70% to 80% of the answer. Is that a problem?**
It is normal for a five-year DCF, and it is exactly why I show sensitivity tables and two methods. The tool flags it
when it goes above 85%.

**25. What happens to the valuation if WACC rises?**
It falls. In Jabil's sensitivity table, raising WACC by one point takes the growth-method value from about $167 to
about $147.

**26. Why no DCF for Raymond James?**
For a bank or broker, debt and deposits are raw material, not financing, and interest is an operating cost. You
cannot separate operating from financing cash flows, so unlevered free cash flow and enterprise value are not
defined. Financials are valued with a dividend discount model or on P/E and price-to-book. The site shows those
instead.

### Merger model

**27. What makes a deal accretive or dilutive?**
Whether the earnings bought are worth more than the cost of paying for them. Compare the target's earnings yield at
the purchase price with the after-tax cost of the financing. Cash costs the interest you lose, debt costs the
interest you pay, and stock costs the acquirer's own earnings yield. The merger page shows this comparison directly.

**28. What is the shortcut for an all-stock deal?**
It is accretive if the acquirer's P/E is higher than the P/E it pays for the target. Jabil at about 24x buying
Sanmina at about 34x after a 30% premium is dilutive.

**29. How do you calculate break-even synergies?**
Work out the net income the combined company needs for EPS to equal the acquirer's standalone EPS: standalone EPS
times the new share count. Subtract what it actually earns before synergies. That shortfall is after tax, so divide
by one minus the tax rate.

**30. Is an accretive deal a good deal?**
Not necessarily. Accretion is arithmetic. A deal can add to EPS and still destroy value if the price is too high or
the earnings are low quality. It matters because boards and investors watch EPS, but value comes from the return on
the price paid against the cost of capital.

### Bonus questions this project invites

- **"What does the data quality panel do?"** It checks that the balance sheet balances, that the cash flow statement
  explains the change in cash, that segments add up to the total, and that the share count agrees across two sources.
  Primo Brands is a good example of a flag: its cash flows do not tie because of discontinued operations.
- **"What would you add with more time?"** Diluted shares by the treasury stock method, a mid-year convention and
  stub period, unlevered peer betas, lease-adjusted multiples, and consensus estimates for forward multiples.
- **"What is the weakest part?"** The automatic peer suggestions and the published beta. Both are editable, and both
  are flagged.

---

## 5. Weaknesses to raise before you are asked

Naming a limitation yourself reads as judgment. Being caught by it reads as not knowing.

1. **Suggested peers are mediocre.** Curate them live in front of the interviewer.
2. **EBITDA is unadjusted**, so EV/EBITDA runs higher than broker research.
3. **Share counts are basic**, so market cap is slightly understated and value per share slightly overstated.
4. **Forward multiples are thin.** Forward P/E only, as published by the provider.
5. **Beta comes from a provider** with an undisclosed method. Coca-Cola shows 0.24.
6. **Defaults extend history.** For a cyclical company like Mosaic they give poor answers, and the page warns you.
7. **The merger model is a first-pass model**: no purchase price allocation, no refinancing, LTM earnings.
8. **Coverage has gaps.** Foreign filers are not supported. Alphabet shows no EBITDA because of how it labels
   depreciation.
9. **The free market-data tier is limited** to about 60 requests a minute. Opening several new peer tables within a
   minute can leave prices blank until it resets.

---

## 6. What was verified, and how

- **Against the 10-K.** Every Jabil figure on the live site was compared with the number printed in Jabil's 10-K for
  the year ended August 31, 2026 (filed October 23, 2026). All 89 figures that come from that filing matched: the
  income statement, balance sheet and cash flow statement. The three segment revenues ($12,694m, $17,872m, $5,388m),
  total debt ($3,379m) and the cover-page share count (102,974,470) also match. Earlier years come from earlier
  10-Ks and were not part of this check. EBITDA does not appear in the 10-K because it is not an accounting figure;
  it is operating income of $1,704m plus D&A of $681m. The script is `scripts/check-10k.py`.
- **Excel export.** The downloaded files were recalculated in LibreOffice, a separate spreadsheet program. Every
  formula gave the same result as the site.
- **Automated tests.** 200 tests, including one hand-worked example for each model: LTM, the EV bridge, WACC, the
  DCF, peer statistics, implied share prices, the merger model and the football field ranges.
- **Live data.** Checked across more than 25 companies, including a foreign filer, an invalid ticker, multi-class
  companies, loss-making companies and financial institutions.

---

## 7. Numbers to know cold (Jabil, November 10, 2026: refresh before use)

| Item | Figure |
| --- | --- |
| Share price | about $249 |
| Shares outstanding | 103.0 million |
| Equity value | about $25.7bn |
| Total debt / cash | $3,379m / $1,739m |
| Enterprise value | about $27.3bn |
| LTM revenue | $35,954m |
| LTM EBITDA (unadjusted) | $2,385m (EBIT $1,704m + D&A $681m), 6.6% margin |
| EV / LTM EBITDA | about 11.5x |
| P / E (LTM) | about 25.6x on diluted EPS of $9.75 |
| WACC | about 10.55% |
| DCF value per share | about $167 (perpetuity growth) and $238 (exit multiple) |
| Fiscal year end | August 31 |
