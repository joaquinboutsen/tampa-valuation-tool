# Valuation Toolkit

**Live site: https://tampa-valuation-tool.vercel.app**

An investment-banking style valuation package for any US public company, built directly on SEC filings.
Type a ticker and get:

- **Company snapshot**: a business description quoted from the 10-K, five fiscal years plus LTM, and a
  step-by-step bridge from equity value to enterprise value.
- **Trading comps**: an editable peer set, EV/Revenue, EV/EBITDA and P/E with quartiles, and implied share prices.
- **DCF**: unlevered free cash flow with editable assumptions, WACC built from CAPM, terminal value by two
  methods, and sensitivity tables. Each default is derived from the company's filings, with the derivation shown.
- **Football field**: implied share price ranges from every method against the current price.
- **Merger model**: accretion / dilution for any acquirer and target, with break-even synergies.
- **Data-quality checks**: tie-outs on the filing data, with exact figures and links to the filing.
- **Excel export**: the DCF and comps download as working spreadsheets with live formulas.

Built by Joaquin Boutsen (Master's in Finance, University of Tampa). I directed the design, chose the methods and
verified the output; the code was written with an AI coding agent.

## Documents

- [`INTERVIEW_PREP.md`](INTERVIEW_PREP.md): every assumption and design choice with its alternative, and 30
  technical questions answered with reference to the tool.
- The [Methodology page](https://tampa-valuation-tool.vercel.app/methodology) on the site: every formula, data
  source and limitation.

## Data sources

- **Financial statements:** SEC EDGAR (official XBRL data from 10-K and 10-Q filings). Requests carry a contact
  User-Agent and are throttled to 8 per second, inside the SEC's 10-per-second fair-access limit.
- **Market data:** Finnhub (price, 52-week range, beta, forward P/E, suggested peers) through an official API key.
- **Risk-free rate:** U.S. Department of the Treasury daily par yield curve.
- No financial figure is hardcoded. Missing data is shown as "n/a" with the reason.

## Verification

- 200 automated tests (`npm test`), with a hand-checked worked example for each model.
- Every Jabil figure taken from its latest 10-K matches the number printed in that document
  (`scripts/check-10k.py`).
- Exported spreadsheets were recalculated in LibreOffice and match the site (`scripts/verify-excel.ts`).

## How it is put together

- `src/lib/sec/` reads SEC data: ticker lookup, statements, LTM, debt (from the face of the balance sheet),
  segments, and the Item 1 business description.
- `src/lib/finance/` holds the pure calculations: EV bridge, multiples, comps statistics, DCF, WACC, football
  field ranges, merger model, and tie-out checks.
- `src/lib/market/` holds the market-data and Treasury clients.
- `src/lib/export/` builds the Excel workbooks.
- `src/app/` is the website (Next.js). `tests/` holds the automated tests.

## Running it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in the two values in `.env.local`, then:

```bash
npm run dev
```

```bash
npm test
```

## Hosting and upkeep

Deployed on Vercel's free Hobby plan, which rebuilds the site whenever the `main` branch changes. Two settings are
required there (Project → Settings → Environment Variables): `SEC_USER_AGENT` and `FINNHUB_API_KEY`
(see `.env.example`).

`/api/health` on the live site reports whether each data source is reachable and whether the two settings are
present, without revealing their values.

Educational project. Not investment advice.
